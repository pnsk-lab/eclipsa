import { existsSync, readFileSync } from 'node:fs'
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NativeTargetAdapter } from '@eclipsa/native/vite'
import type { DevEnvironment, ResolvedConfig, ViteDevServer } from 'vite'
import { createRunnableDevEnvironment } from 'vite'
import { GTK4_DEFAULT_COMPONENT_MAP } from './platform.ts'

export const NATIVE_GTK4_ENVIRONMENT_NAME = 'nativeGtk4'
const DEFAULT_HOST_SHUTDOWN_TIMEOUT_MS = 3_000
const DEFAULT_HOST_STARTUP_TIMEOUT_MS = 30_000
const defaultGuiHostBinaryName = `eclipsa-native-gtk4${process.platform === 'win32' ? '.exe' : ''}`
const defaultHostManifestPaths = [
  fileURLToPath(new URL('./host/manifest.json', import.meta.url)),
  fileURLToPath(new URL('./dist/host/manifest.json', import.meta.url)),
]
const defaultGuiHostBinaryPaths = [
  fileURLToPath(new URL(`./gtk4-rust/target/debug/${defaultGuiHostBinaryName}`, import.meta.url)),
  fileURLToPath(new URL(`./gtk4-rust/target/release/${defaultGuiHostBinaryName}`, import.meta.url)),
]
const defaultWorkspaceCargoManifestPath = fileURLToPath(
  new URL('./gtk4-rust/Cargo.toml', import.meta.url),
)

export interface Gtk4TargetOptions {
  command?: readonly [string, ...string[]]
  cwd?: string
  env?: NodeJS.ProcessEnv
  hostBinaryPath?: string
  launch?: boolean
  startupTimeoutMs?: number
  stdio?: SpawnOptions['stdio']
}

interface ResolvedNativeGtk4TargetOptions {
  command: readonly [string, ...string[]] | null
  cwd: string
  env?: NodeJS.ProcessEnv
  hasCustomCommand: boolean
  launch: boolean
  startupTimeoutMs: number
  stdio: SpawnOptions['stdio']
}

interface NativeDistributionManifestTarget {
  arch: string
  entrypoint: string
  os: string
}

interface NativeDistributionManifest {
  targets?: NativeDistributionManifestTarget[]
}

const normalizeBundlePath = (value: string) => value.replace(/\\/g, '/').replace(/^\.?\//, '')

const resolveBundledGtk4HostBinaryPath = () => {
  for (const manifestPath of defaultHostManifestPaths) {
    if (!existsSync(manifestPath)) {
      continue
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as NativeDistributionManifest
    const matchingTarget =
      manifest.targets?.find(
        (target) => target.os === process.platform && target.arch === process.arch,
      ) ??
      manifest.targets?.find(
        (target) => target.os === process.platform && target.arch === 'universal',
      )
    if (!matchingTarget) {
      continue
    }
    const entrypoint = path.resolve(
      path.dirname(manifestPath),
      normalizeBundlePath(matchingTarget.entrypoint),
    )
    if (existsSync(entrypoint)) {
      return entrypoint
    }
  }
  return null
}

const resolveWorkspaceGtk4GuiHostBinaryPath = () => {
  for (const candidate of defaultGuiHostBinaryPaths) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

const resolveDefaultGtk4Command = (
  hostBinaryPath?: string,
): readonly [string, ...string[]] | null => {
  if (hostBinaryPath != null) {
    if (existsSync(hostBinaryPath)) {
      return [hostBinaryPath]
    }
    throw new Error(`Could not resolve the configured GTK4 host binary at ${hostBinaryPath}.`)
  }

  const bundledHostBinaryPath = resolveBundledGtk4HostBinaryPath()
  if (bundledHostBinaryPath && existsSync(bundledHostBinaryPath)) {
    return [bundledHostBinaryPath]
  }

  if (process.platform === 'linux' && existsSync(defaultWorkspaceCargoManifestPath)) {
    return [
      'cargo',
      'run',
      '--manifest-path',
      defaultWorkspaceCargoManifestPath,
      '--features',
      'gtk-ui',
      '--bin',
      'eclipsa-native-gtk4',
    ]
  }

  const workspaceGuiHostBinaryPath = resolveWorkspaceGtk4GuiHostBinaryPath()
  if (workspaceGuiHostBinaryPath) {
    return [workspaceGuiHostBinaryPath]
  }
  return null
}

const resolveNativeGtk4TargetOptions = (
  config: ResolvedConfig,
  options: Gtk4TargetOptions,
): ResolvedNativeGtk4TargetOptions => ({
  command: options.command ?? resolveDefaultGtk4Command(options.hostBinaryPath),
  cwd: options.cwd ?? config.root,
  env: options.env,
  hasCustomCommand: options.command != null || options.hostBinaryPath != null,
  launch: options.launch ?? true,
  startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_HOST_STARTUP_TIMEOUT_MS,
  stdio: options.stdio ?? 'inherit',
})

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
    throw new Error('Could not resolve a dev server origin for the nativeGtk4 environment.')
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
      throw new Error('Cancelled nativeGtk4 host startup.')
    }
    try {
      return tryResolveServerOrigin(server)
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Could not resolve a dev server origin for the nativeGtk4 environment.')
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
      throw new Error('Cancelled nativeGtk4 host startup.')
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

type NativeGtk4EnvironmentContext = {
  ws: ViteDevServer['ws']
}

const createNativeGtk4DevEnvironment = (
  name: string,
  config: ResolvedConfig,
  context: NativeGtk4EnvironmentContext,
  options: Gtk4TargetOptions,
  manifestPath: string,
): DevEnvironment => {
  const environment = createRunnableDevEnvironment(name, config, {
    hot: true,
    options: config.environments[name],
    transport: context.ws,
  })
  const resolved = resolveNativeGtk4TargetOptions(config, options)
  const originalListen = environment.listen.bind(environment)
  const originalClose = environment.close.bind(environment)
  let closing = false
  let hostProcess: ChildProcess | null = null
  let startupTask: Promise<void> | null = null
  let warnedMissingDefaultHost = false

  environment.listen = async (server) => {
    await originalListen(server)
    if (hostProcess || startupTask) {
      return
    }
    if (!resolved.launch) {
      return
    }
    if (!resolved.command) {
      if (!resolved.hasCustomCommand && !warnedMissingDefaultHost) {
        warnedMissingDefaultHost = true
        environment.logger.warn(
          'Skipping nativeGtk4 host launch because no GTK4 GUI host is available. Pass gtk4({ command: [...] }), bundle dist/host/manifest.json, or add packages/native-gtk4/gtk4-rust/Cargo.toml to open a window during bun dev.',
        )
      }
      return
    }
    const launchCommand = resolved.command

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

        const [command, ...args] = launchCommand
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
            `Failed to launch the nativeGtk4 host with "${command} ${args.join(' ')}": ${String(error)}`,
          )
        })
        hostProcess.once('exit', (code, signal) => {
          const expectedShutdown = closing && (signal === 'SIGTERM' || signal === 'SIGKILL')
          hostProcess = null
          if (expectedShutdown || code === 0) {
            return
          }
          environment.logger.warn(
            `The nativeGtk4 host exited unexpectedly${code != null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}.`,
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

export const gtk4 = (options: Gtk4TargetOptions = {}): NativeTargetAdapter => ({
  bindingPackage: '@eclipsa/native-gtk4',
  bundledHostDir: 'host',
  bundledHostFallbackDir: 'dist/host',
  commonEntry: '@eclipsa/native-gtk4/common',
  commonEntryFallback: fileURLToPath(new URL('./common.tsx', import.meta.url)),
  createEnvironmentOptions({ manifestPath }) {
    return {
      consumer: 'server',
      dev: {
        createEnvironment(name, config, context) {
          return createNativeGtk4DevEnvironment(
            name,
            config,
            context as NativeGtk4EnvironmentContext,
            options,
            manifestPath,
          )
        },
      },
    }
  },
  defaultMap: GTK4_DEFAULT_COMPONENT_MAP,
  environmentName: NATIVE_GTK4_ENVIRONMENT_NAME,
  name: 'gtk4',
  platform: 'gtk4',
  workspaceFallback: fileURLToPath(new URL('./mod.ts', import.meta.url)),
})
