import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { NativeTargetAdapter } from '@eclipsa/native/vite'
import type { DevEnvironment, ResolvedConfig, ViteDevServer } from 'vite'
import { createRunnableDevEnvironment } from 'vite'
import { createDefaultComposeHostCommand } from './host.ts'
import { parseComposeCliOptionsFromEnv } from './host.ts'
import { parseComposeCliOptions } from './host.ts'
import { COMPOSE_DEFAULT_COMPONENT_MAP } from './platform.ts'

export const NATIVE_COMPOSE_ENVIRONMENT_NAME = 'nativeCompose'
const DEFAULT_HOST_SHUTDOWN_TIMEOUT_MS = 3_000
const DEFAULT_HOST_STARTUP_TIMEOUT_MS = 30_000
const DEFAULT_ANDROID_APPLICATION_ID = 'dev.eclipsa.nativecompose'
const DEFAULT_ANDROID_ACTIVITY_NAME = '.MainActivity'
const DEFAULT_MANIFEST_EXTRA_NAME = 'manifestUrl'

export interface ComposeLaunchContext {
  manifestPath: string
  manifestUrl: string
}

export type ComposeCommandFactory = (
  context: ComposeLaunchContext,
) => readonly [string, ...string[]]

export interface ComposeTargetOptions {
  activityName?: string
  applicationId?: string
  avd?: string
  bootTimeoutMs?: number
  command?: ComposeCommandFactory | readonly [string, ...string[]]
  cwd?: string
  emulator?: boolean
  env?: NodeJS.ProcessEnv
  launch?: boolean
  manifestExtraName?: string
  startupTimeoutMs?: number
  stdio?: SpawnOptions['stdio']
}

interface ResolvedNativeComposeTargetOptions {
  commandFactory: ComposeCommandFactory
  cwd: string
  env?: NodeJS.ProcessEnv
  hasCustomCommand: boolean
  launch: boolean
  startupTimeoutMs: number
  stdio: SpawnOptions['stdio']
}

const resolveComposeOptionsFromCli = (options: ComposeTargetOptions): ComposeTargetOptions => {
  const cliOptions = parseComposeCliOptions(process.argv.slice(2))
  const envOptions = parseComposeCliOptionsFromEnv(process.env)
  return {
    ...options,
    avd: options.avd ?? envOptions.avd ?? cliOptions.avd,
    bootTimeoutMs: options.bootTimeoutMs ?? envOptions.bootTimeoutMs ?? cliOptions.bootTimeoutMs,
    emulator: options.emulator ?? envOptions.emulator ?? cliOptions.emulator,
  }
}

const resolveNativeComposeTargetOptions = (
  config: ResolvedConfig,
  options: ComposeTargetOptions,
): ResolvedNativeComposeTargetOptions => {
  const resolvedOptions = resolveComposeOptionsFromCli(options)
  const manifestExtraName = options.manifestExtraName ?? DEFAULT_MANIFEST_EXTRA_NAME
  return {
    commandFactory:
      typeof resolvedOptions.command === 'function'
        ? resolvedOptions.command
        : resolvedOptions.command
          ? () => resolvedOptions.command as readonly [string, ...string[]]
          : ({ manifestUrl }) =>
              createDefaultComposeHostCommand(manifestUrl, {
                activityName: resolvedOptions.activityName ?? DEFAULT_ANDROID_ACTIVITY_NAME,
                applicationId: resolvedOptions.applicationId ?? DEFAULT_ANDROID_APPLICATION_ID,
                avd: resolvedOptions.avd,
                bootTimeoutMs: resolvedOptions.bootTimeoutMs,
                emulator: resolvedOptions.emulator,
                manifestExtraName,
              }),
    cwd: resolvedOptions.cwd ?? config.root,
    env: resolvedOptions.env,
    hasCustomCommand: resolvedOptions.command != null,
    launch: resolvedOptions.launch ?? true,
    startupTimeoutMs: resolvedOptions.startupTimeoutMs ?? DEFAULT_HOST_STARTUP_TIMEOUT_MS,
    stdio: resolvedOptions.stdio ?? 'inherit',
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
    throw new Error('Could not resolve a dev server origin for the nativeCompose environment.')
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
      throw new Error('Cancelled nativeCompose host startup.')
    }
    try {
      return tryResolveServerOrigin(server)
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Could not resolve a dev server origin for the nativeCompose environment.')
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
      throw new Error('Cancelled nativeCompose host startup.')
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

type NativeComposeEnvironmentContext = {
  ws: ViteDevServer['ws']
}

const createNativeComposeDevEnvironment = (
  name: string,
  config: ResolvedConfig,
  context: NativeComposeEnvironmentContext,
  options: ComposeTargetOptions,
  manifestPath: string,
): DevEnvironment => {
  const environment = createRunnableDevEnvironment(name, config, {
    hot: true,
    options: config.environments[name],
    transport: context.ws,
  })
  const resolved = resolveNativeComposeTargetOptions(config, options)
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

        const [command, ...args] = resolved.commandFactory({
          manifestPath,
          manifestUrl,
        })
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
            `Failed to launch the nativeCompose host with "${command} ${args.join(' ')}": ${String(error)}`,
          )
        })
        hostProcess.once('exit', (code, signal) => {
          const expectedShutdown = closing && (signal === 'SIGTERM' || signal === 'SIGKILL')
          hostProcess = null
          if (expectedShutdown || code === 0) {
            return
          }
          environment.logger.warn(
            `The nativeCompose host exited unexpectedly${code != null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}.`,
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

export const compose = (options: ComposeTargetOptions = {}): NativeTargetAdapter => ({
  bindingPackage: '@eclipsa/native-compose',
  createEnvironmentOptions({ manifestPath }) {
    return {
      consumer: 'server',
      dev: {
        createEnvironment(name, config, context) {
          return createNativeComposeDevEnvironment(
            name,
            config,
            context as NativeComposeEnvironmentContext,
            options,
            manifestPath,
          )
        },
      },
    }
  },
  defaultMap: COMPOSE_DEFAULT_COMPONENT_MAP,
  environmentName: NATIVE_COMPOSE_ENVIRONMENT_NAME,
  name: 'compose',
  platform: 'android',
  workspaceFallback: fileURLToPath(new URL('./mod.ts', import.meta.url)),
})
