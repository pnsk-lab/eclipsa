import { spawn, type SpawnOptions } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  createNativeFetchableDevEnvironment,
  type NativeFetchableEnvironmentContext,
} from '../native/dev-environment.ts'
import type { NativeTargetAdapter } from '@eclipsa/native/vite'
import type { ResolvedConfig } from 'vite'
import { SWIFTUI_DEFAULT_COMPONENT_MAP } from './platform.ts'

export const NATIVE_SWIFT_ENVIRONMENT_NAME = 'nativeSwift'
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

const createNativeSwiftDevEnvironment = (
  name: string,
  config: ResolvedConfig,
  context: NativeFetchableEnvironmentContext,
  options: SwiftUITargetOptions,
  manifestPath: string,
) => {
  const resolved = resolveNativeSwiftTargetOptions(config, options)
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
      return process.platform === 'darwin' || resolved.hasCustomCommand
    },
    startupTimeoutMs: resolved.startupTimeoutMs,
  })
}

export const swiftui = (options: SwiftUITargetOptions = {}): NativeTargetAdapter => ({
  bindingPackage: '@eclipsa/native-swiftui',
  bundledHostDir: 'host',
  bundledHostFallbackDir: 'dist/host',
  commonEntry: '@eclipsa/native-swiftui/common',
  createEnvironmentOptions({ manifestPath }) {
    return {
      consumer: 'server',
      dev: {
        createEnvironment(name, config, context) {
          return createNativeSwiftDevEnvironment(
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
  defaultMap: SWIFTUI_DEFAULT_COMPONENT_MAP,
  environmentName: NATIVE_SWIFT_ENVIRONMENT_NAME,
  name: 'swiftui',
  platform: 'swiftui',
  commonEntryFallback: fileURLToPath(new URL('./common.tsx', import.meta.url)),
  workspaceFallback: fileURLToPath(new URL('./mod.ts', import.meta.url)),
})
