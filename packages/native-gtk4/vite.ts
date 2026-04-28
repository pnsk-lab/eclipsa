import { existsSync, readFileSync } from 'node:fs'
import { spawn, type SpawnOptions } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createNativeFetchableDevEnvironment,
  type NativeFetchableEnvironmentContext,
} from '../native/dev-environment.ts'
import type { NativeTargetAdapter } from '@eclipsa/native/vite'
import type { ResolvedConfig } from 'vite'
import { GTK4_DEFAULT_COMPONENT_MAP } from './platform.ts'

export const NATIVE_GTK4_ENVIRONMENT_NAME = 'nativeGtk4'
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

  if (existsSync(defaultWorkspaceCargoManifestPath)) {
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

const createNativeGtk4DevEnvironment = (
  name: string,
  config: ResolvedConfig,
  context: NativeFetchableEnvironmentContext,
  options: Gtk4TargetOptions,
  manifestPath: string,
) => {
  const resolved = resolveNativeGtk4TargetOptions(config, options)
  const environment = createNativeFetchableDevEnvironment(config, context, {
    createHostProcess({ manifestUrl }) {
      const launchCommand = resolved.command
      if (!launchCommand) {
        throw new Error('Missing the resolved nativeGtk4 host command.')
      }
      const [command, ...args] = launchCommand
      return {
        child: spawn(command, args, {
          cwd: resolved.cwd,
          env: {
            ...process.env,
            ...resolved.env,
            ECLIPSA_NATIVE_MANIFEST: manifestUrl,
          },
          stdio: resolved.stdio,
        }),
        description: [command, ...args].join(' '),
      }
    },
    launch: resolved.launch && resolved.command != null,
    manifestPath,
    name,
    startupTimeoutMs: resolved.startupTimeoutMs,
  })

  if (resolved.launch && !resolved.command && !resolved.hasCustomCommand) {
    const originalListen = environment.listen.bind(environment)
    let warnedMissingDefaultHost = false
    environment.listen = async (server) => {
      await originalListen(server)
      if (!warnedMissingDefaultHost) {
        warnedMissingDefaultHost = true
        environment.logger.warn(
          'Skipping nativeGtk4 host launch because no GTK4 GUI host is available. Pass gtk4({ command: [...] }), bundle dist/host/manifest.json, or add packages/native-gtk4/gtk4-rust/Cargo.toml to open a window during bun dev.',
        )
      }
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
            context as NativeFetchableEnvironmentContext,
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
