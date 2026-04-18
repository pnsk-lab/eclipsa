import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { NativeTargetAdapter } from '@eclipsa/native/vite'
import type { DevEnvironment, ResolvedConfig, ViteDevServer } from 'vite'
import { createRunnableDevEnvironment } from 'vite'

export const NATIVE_SWIFT_ENVIRONMENT_NAME = 'nativeSwift'
const DEFAULT_HOST_SHUTDOWN_TIMEOUT_MS = 3_000
const DEFAULT_HOST_STARTUP_TIMEOUT_MS = 30_000

export interface SwiftUITargetOptions {
  command?: readonly [string, ...string[]]
  cwd?: string
  env?: NodeJS.ProcessEnv
  hostPackagePath?: string
  launch?: boolean
  startupTimeoutMs?: number
  stdio?: SpawnOptions['stdio']
}

interface ResolvedNativeSwiftTargetOptions {
  command: readonly [string, ...string[]]
  cwd: string
  env?: NodeJS.ProcessEnv
  hasCustomCommand: boolean
  launch: boolean
  startupTimeoutMs: number
  stdio: SpawnOptions['stdio']
}

const defaultHostPackagePath = fileURLToPath(new URL('./macos-swiftui', import.meta.url))

const resolveNativeSwiftTargetOptions = (
  config: ResolvedConfig,
  options: SwiftUITargetOptions,
): ResolvedNativeSwiftTargetOptions => {
  const hostPackagePath = options.hostPackagePath ?? defaultHostPackagePath
  return {
    command: options.command ?? [
      'swift',
      'run',
      '--package-path',
      hostPackagePath,
      'EclipsaNativeMacOS',
    ],
    cwd: options.cwd ?? config.root,
    env: options.env,
    hasCustomCommand: options.command != null,
    launch: options.launch ?? true,
    startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_HOST_STARTUP_TIMEOUT_MS,
    stdio: options.stdio ?? 'inherit',
  }
}

const normalizeServerHost = (host: string | boolean | undefined) => {
  if (typeof host !== 'string' || host === '0.0.0.0' || host === '::') {
    return '127.0.0.1'
  }
  return host
}

const tryResolveServerOrigin = (server: ViteDevServer) => {
  const preferredOrigin =
    server.resolvedUrls?.local[0] ??
    server.resolvedUrls?.network[0] ??
    server.config.server.origin ??
    null
  if (preferredOrigin) {
    return preferredOrigin.endsWith('/') ? preferredOrigin : `${preferredOrigin}/`
  }

  if (server.config.server.strictPort && server.config.server.port > 0) {
    const protocol = server.config.server.https ? 'https' : 'http'
    const host = normalizeServerHost(server.config.server.host)
    return `${protocol}://${host}:${server.config.server.port}/`
  }

  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Could not resolve a dev server origin for the nativeSwift environment.')
  }

  const protocol = server.config.server.https ? 'https' : 'http'
  const host =
    address.address === '::' || address.address === '0.0.0.0' ? '127.0.0.1' : address.address
  return `${protocol}://${host}:${address.port}/`
}

const waitForServerOrigin = async (
  server: ViteDevServer,
  timeoutMs: number,
  shouldCancel?: () => boolean,
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (shouldCancel?.()) {
      throw new Error('Cancelled nativeSwift host startup.')
    }
    try {
      return tryResolveServerOrigin(server)
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Could not resolve a dev server origin for the nativeSwift environment.')
}

const resolveManifestUrl = async (
  server: ViteDevServer,
  manifestPath: string,
  timeoutMs: number,
  shouldCancel?: () => boolean,
) => {
  const origin = await waitForServerOrigin(server, timeoutMs, shouldCancel)
  return new URL(manifestPath.slice(1), origin).href
}

const waitForManifest = async (
  manifestUrl: string,
  timeoutMs: number,
  shouldCancel?: () => boolean,
) => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null
  while (Date.now() < deadline) {
    if (shouldCancel?.()) {
      throw new Error('Cancelled nativeSwift host startup.')
    }
    try {
      const response = await fetch(manifestUrl)
      if (response.ok) {
        return
      }
      lastError = new Error(`Received ${response.status} from ${manifestUrl}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(
    `Timed out waiting for the native manifest at ${manifestUrl}.${lastError ? ` ${String(lastError)}` : ''}`,
  )
}

const stopChildProcess = async (child: ChildProcess | null) => {
  if (!child || child.exitCode != null || child.signalCode != null) {
    return
  }

  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId)
      resolve()
    }

    const timeoutId = setTimeout(() => {
      if (child.exitCode == null && child.signalCode == null) {
        child.kill('SIGKILL')
      }
    }, DEFAULT_HOST_SHUTDOWN_TIMEOUT_MS)

    child.once('exit', finish)
    child.kill('SIGTERM')
  })
}

type NativeSwiftEnvironmentContext = {
  ws: ViteDevServer['ws']
}

const createNativeSwiftDevEnvironment = (
  name: string,
  config: ResolvedConfig,
  context: NativeSwiftEnvironmentContext,
  options: SwiftUITargetOptions,
  manifestPath: string,
): DevEnvironment => {
  const environment = createRunnableDevEnvironment(name, config, {
    hot: true,
    options: config.environments[name],
    transport: context.ws,
  })
  const resolved = resolveNativeSwiftTargetOptions(config, options)
  const originalListen = environment.listen.bind(environment)
  const originalClose = environment.close.bind(environment)
  let closing = false
  let hostProcess: ChildProcess | null = null
  let startupTask: Promise<void> | null = null

  environment.listen = async (server) => {
    await originalListen(server)
    if (hostProcess || startupTask) {
      return
    }
    if (!resolved.launch) {
      return
    }
    if (process.platform !== 'darwin' && !resolved.hasCustomCommand) {
      return
    }

    startupTask = (async () => {
      const shouldCancel = () => closing
      try {
        const manifestUrl = await resolveManifestUrl(
          server,
          manifestPath,
          resolved.startupTimeoutMs,
          shouldCancel,
        )
        await waitForManifest(manifestUrl, resolved.startupTimeoutMs, shouldCancel)
        if (closing) {
          return
        }

        const [command, ...args] = resolved.command
        hostProcess = spawn(command, args, {
          cwd: resolved.cwd,
          env: {
            ...process.env,
            ...resolved.env,
            ECLIPSA_NATIVE_MANIFEST: manifestUrl,
          },
          stdio: resolved.stdio,
        })

        hostProcess.once('error', (error) => {
          environment.logger.error(
            `Failed to launch the nativeSwift host with "${command} ${args.join(' ')}": ${String(error)}`,
          )
        })
        hostProcess.once('exit', (code, signal) => {
          const expectedShutdown = closing && (signal === 'SIGTERM' || signal === 'SIGKILL')
          hostProcess = null
          if (expectedShutdown || code === 0) {
            return
          }
          environment.logger.warn(
            `The nativeSwift host exited unexpectedly${code != null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}.`,
          )
        })
      } catch (error) {
        if (!closing) {
          environment.logger.error(String(error))
        }
      } finally {
        startupTask = null
      }
    })()
  }

  environment.close = async () => {
    closing = true
    try {
      await startupTask
      await stopChildProcess(hostProcess)
      hostProcess = null
      await originalClose()
    } finally {
      closing = false
    }
  }

  return environment
}

export const swiftui = (options: SwiftUITargetOptions = {}): NativeTargetAdapter => ({
  bindingPackage: '@eclipsa/native-swiftui',
  createEnvironmentOptions({ manifestPath }) {
    return {
      consumer: 'server',
      dev: {
        createEnvironment(name, config, context) {
          return createNativeSwiftDevEnvironment(
            name,
            config,
            context as NativeSwiftEnvironmentContext,
            options,
            manifestPath,
          )
        },
      },
    }
  },
  environmentName: NATIVE_SWIFT_ENVIRONMENT_NAME,
  name: 'swiftui',
  platform: 'swiftui',
  workspaceFallback: fileURLToPath(new URL('./mod.ts', import.meta.url)),
})
