import { spawn, type SpawnOptions } from 'node:child_process'
import { join } from 'node:path'
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

export interface GTK4TargetOptions {
  command?: readonly [string, ...string[]]
  cwd?: string
  env?: NodeJS.ProcessEnv
  hostPackagePath?: string
  launch?: boolean
  startupTimeoutMs?: number
  stdio?: SpawnOptions['stdio']
}

interface ResolvedNativeGtk4TargetOptions {
  command: readonly [string, ...string[]]
  cwd: string
  env?: NodeJS.ProcessEnv
  hasCustomCommand: boolean
  launch: boolean
  startupTimeoutMs: number
  stdio: SpawnOptions['stdio']
}

const defaultHostPackagePath = fileURLToPath(new URL('./gtk4-rust', import.meta.url))

const resolveNativeGtk4TargetOptions = (
  config: ResolvedConfig,
  options: GTK4TargetOptions,
): ResolvedNativeGtk4TargetOptions => {
  const hostPackagePath = options.hostPackagePath ?? defaultHostPackagePath
  return {
    command: options.command ?? [
      'cargo',
      'run',
      '--manifest-path',
      join(hostPackagePath, 'Cargo.toml'),
      '--features',
      'gtk-ui',
      '--bin',
      'eclipsa-native-gtk4',
    ],
    cwd: options.cwd ?? config.root,
    env: options.env,
    hasCustomCommand: options.command != null,
    launch: options.launch ?? true,
    startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_HOST_STARTUP_TIMEOUT_MS,
    stdio: options.stdio ?? 'inherit',
  }
}

const createNativeGtk4DevEnvironment = (
  name: string,
  config: ResolvedConfig,
  context: NativeFetchableEnvironmentContext,
  options: GTK4TargetOptions,
  manifestPath: string,
) => {
  const resolved = resolveNativeGtk4TargetOptions(config, options)
  return createNativeFetchableDevEnvironment(config, context, {
    createHostProcess({ manifestUrl }) {
      const [command, ...args] = resolved.command
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
    launch: resolved.launch,
    manifestPath,
    name,
    shouldLaunch() {
      return process.platform === 'linux' || resolved.hasCustomCommand
    },
    startupTimeoutMs: resolved.startupTimeoutMs,
  })
}

export const gtk4 = (options: GTK4TargetOptions = {}): NativeTargetAdapter => ({
  bindingPackage: '@eclipsa/native-gtk4',
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
  platform: 'linux',
  workspaceFallback: fileURLToPath(new URL('./mod.ts', import.meta.url)),
})
