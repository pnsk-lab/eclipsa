import { spawn, type SpawnOptions } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  createNativeFetchableDevEnvironment,
  type NativeFetchableEnvironmentContext,
} from '../native/dev-environment.ts'
import type { NativeTargetAdapter } from '@eclipsa/native/vite'
import type { ResolvedConfig } from 'vite'
import { createDefaultComposeHostCommand } from './host.ts'
import { parseComposeCliOptionsFromEnv } from './host.ts'
import { parseComposeCliOptions } from './host.ts'
import { COMPOSE_DEFAULT_COMPONENT_MAP } from './platform.ts'

export const NATIVE_ANDROID_COMPOSE_ENVIRONMENT_NAME = 'nativeAndroidCompose'
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
    launch: resolvedOptions.launch ?? true,
    startupTimeoutMs: resolvedOptions.startupTimeoutMs ?? DEFAULT_HOST_STARTUP_TIMEOUT_MS,
    stdio: resolvedOptions.stdio ?? 'inherit',
  }
}

const createNativeComposeDevEnvironment = (
  name: string,
  config: ResolvedConfig,
  context: NativeFetchableEnvironmentContext,
  options: ComposeTargetOptions,
  manifestPath: string,
) => {
  const resolved = resolveNativeComposeTargetOptions(config, options)
  return createNativeFetchableDevEnvironment(config, context, {
    createHostProcess({ manifestUrl }) {
      const [command, ...args] = resolved.commandFactory({
        manifestPath,
        manifestUrl,
      })
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
    startupTimeoutMs: resolved.startupTimeoutMs,
  })
}

export const androidCompose = (options: ComposeTargetOptions = {}): NativeTargetAdapter => ({
  bindingPackage: '@eclipsa/native-android-compose',
  bundledHostDir: 'host',
  bundledHostFallbackDir: 'dist/host',
  commonEntry: '@eclipsa/native-android-compose/common',
  createEnvironmentOptions({ manifestPath }) {
    return {
      consumer: 'server',
      dev: {
        createEnvironment(name, config, context) {
          return createNativeComposeDevEnvironment(
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
  defaultMap: COMPOSE_DEFAULT_COMPONENT_MAP,
  environmentName: NATIVE_ANDROID_COMPOSE_ENVIRONMENT_NAME,
  name: 'android-compose',
  platform: 'android',
  commonEntryFallback: fileURLToPath(new URL('./common.tsx', import.meta.url)),
  workspaceFallback: fileURLToPath(new URL('./mod.ts', import.meta.url)),
})

export const compose = androidCompose
