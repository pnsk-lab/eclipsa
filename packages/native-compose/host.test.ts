import {
  createDefaultComposeHostCommand,
  createDefaultComposeHostInstallCommand,
  resolveAndroidSdkRoot,
  isMissingComposeHostActivityError,
  launchComposeHostActivity,
  parseComposeCliOptions,
  parseComposeCliOptionsFromEnv,
  parseComposeHostLaunchArgs,
  resolveJavaHome,
  waitForEmulatorDevice,
} from './host.ts'
import { describe, expect, it } from 'vitest'

describe('@eclipsa/native-compose host launcher', () => {
  it('parses emulator launch flags including the legacy typo alias', () => {
    expect(parseComposeHostLaunchArgs(['--emulator']).emulator).toBe(true)
    expect(parseComposeHostLaunchArgs(['--enurator']).emulator).toBe(true)
  })

  it('extracts CLI-only options for vp dev passthrough', () => {
    expect(
      parseComposeCliOptions([
        'dev',
        '--emulator',
        '--avd',
        'Pixel_8_API_35',
        '--boot-timeout-ms',
        '45000',
      ]),
    ).toEqual({
      avd: 'Pixel_8_API_35',
      bootTimeoutMs: 45_000,
      emulator: true,
    })
  })

  it('reads compose runtime options from environment variables', () => {
    expect(
      parseComposeCliOptionsFromEnv({
        ECLIPSA_NATIVE_COMPOSE_AVD: 'Pixel_8_API_35',
        ECLIPSA_NATIVE_COMPOSE_BOOT_TIMEOUT_MS: '45000',
        ECLIPSA_NATIVE_COMPOSE_EMULATOR: '1',
      }),
    ).toEqual({
      avd: 'Pixel_8_API_35',
      bootTimeoutMs: 45_000,
      emulator: true,
    })
  })

  it('builds a default host command that can target an emulator', () => {
    const command = createDefaultComposeHostCommand(
      'http://127.0.0.1:5173/__eclipsa_native__/manifest.json',
      {
        activityName: '.CustomActivity',
        applicationId: 'dev.eclipsa.example',
        avd: 'Pixel_8_API_35',
        bootTimeoutMs: 45_000,
        emulator: true,
        manifestExtraName: 'manifestUrl',
      },
    )

    expect(command[0]).toBe('bun')
    expect(command).toContain('--emulator')
    expect(command).toContain('--avd')
    expect(command).toContain('Pixel_8_API_35')
    expect(command).toContain('--manifest-url')
    expect(command).toContain('http://127.0.0.1:5173/__eclipsa_native__/manifest.json')
    expect(command).toContain('.CustomActivity')
    expect(command).toContain('dev.eclipsa.example')
  })

  it('detects the adb error when the Compose host activity is not installed yet', () => {
    const error = new Error('Command failed') as Error & { stdout: string }
    error.stdout =
      'Starting: Intent { act=android.intent.action.MAIN cmp=dev.eclipsa.nativecompose/.MainActivity (has extras) }\n' +
      'Error type 3\n' +
      'Error: Activity class {dev.eclipsa.nativecompose/dev.eclipsa.nativecompose.MainActivity} does not exist.\n'

    expect(isMissingComposeHostActivityError(error)).toBe(true)
  })

  it('builds the default install command for the bundled Android host project', () => {
    const command = createDefaultComposeHostInstallCommand('/tmp/eclipsa-native-compose-host')

    expect(command[0]).toBe(process.platform === 'win32' ? 'gradlew.bat' : './gradlew')
    expect(command).toContain('--project-dir')
    expect(command).toContain('/tmp/eclipsa-native-compose-host')
    expect(command).toContain(':app:installDebug')
  })

  it('resolves a Java home from the java executable on PATH when JAVA_HOME is unset', async () => {
    const javaHome = await resolveJavaHome(
      {
        PATH: '/tmp/bin',
      },
      {
        execFile: async (file, args) => {
          expect(file).toBe(process.platform === 'win32' ? 'where' : 'which')
          expect(args).toEqual(['java'])
          return {
            stderr: '',
            stdout: '/tmp/bin/java\n',
          }
        },
        fileExists: async () => false,
        realpath: async (filePath) =>
          filePath === '/tmp/bin/java' ? '/toolchains/openjdk-17/bin/java' : filePath,
      },
    )

    expect(javaHome).toBe('/toolchains/openjdk-17')
  })

  it('resolves an Android SDK root from adb or emulator paths', async () => {
    const sdkRoot = await resolveAndroidSdkRoot({}, ['/tmp/bin/adb', '/tmp/bin/emulator'], {
      execFile: async () => ({ stderr: '', stdout: '' }),
      fileExists: async (filePath) =>
        filePath === '/toolchains/android-sdk/platform-tools/adb' ||
        filePath === '/toolchains/android-sdk/build-tools',
      realpath: async (filePath) => {
        if (filePath === '/tmp/bin/adb') {
          return '/toolchains/android-sdk/platform-tools/adb'
        }
        if (filePath === '/tmp/bin/emulator') {
          return '/toolchains/android-sdk/emulator/emulator'
        }
        return filePath
      },
    })

    expect(sdkRoot).toBe('/toolchains/android-sdk')
  })

  it('installs the bundled Android host app and retries the activity launch on missing activity', async () => {
    const calls: Array<{
      args: readonly string[]
      cwd?: string
      env?: NodeJS.ProcessEnv
      file: string
    }> = []
    let launchAttempts = 0

    await launchComposeHostActivity(
      {
        activityName: '.MainActivity',
        adbPath: 'adb',
        applicationId: 'dev.eclipsa.nativecompose',
        emulator: true,
        hostProjectPath: '/tmp/eclipsa-native-compose-host',
        manifestExtraName: 'manifestUrl',
        manifestValue: 'http://127.0.0.1:5173/__eclipsa_native__/manifest.json',
      },
      {},
      {
        execFile: async (file, args, options) => {
          calls.push({ args, cwd: options.cwd, env: options.env, file })
          if (file === 'adb' && args.includes('shell') && launchAttempts === 0) {
            launchAttempts += 1
            const error = new Error('Command failed') as Error & { stdout: string }
            error.stdout =
              'Starting: Intent { act=android.intent.action.MAIN cmp=dev.eclipsa.nativecompose/.MainActivity (has extras) }\n' +
              'Error type 3\n' +
              'Error: Activity class {dev.eclipsa.nativecompose/dev.eclipsa.nativecompose.MainActivity} does not exist.\n'
            throw error
          }
          if (file === (process.platform === 'win32' ? 'where' : 'which')) {
            return { stderr: '', stdout: '/tmp/bin/java\n' }
          }
          launchAttempts += file === 'adb' && args.includes('shell') ? 1 : 0
          return { stderr: '', stdout: '' }
        },
        fileExists: async (filePath) =>
          filePath === '/tmp/eclipsa-native-compose-host/gradlew' ||
          filePath === '/toolchains/openjdk-17/bin/java' ||
          filePath === '/toolchains/android-sdk/platform-tools/adb' ||
          filePath === '/toolchains/android-sdk/build-tools',
        realpath: async (filePath) => {
          if (filePath === 'adb') {
            return '/toolchains/android-sdk/platform-tools/adb'
          }
          if (filePath === '/tmp/bin/java') {
            return '/toolchains/openjdk-17/bin/java'
          }
          return filePath
        },
      },
    )

    expect(calls).toHaveLength(5)
    expect(calls[0]?.file).toBe('adb')
    expect(calls[0]?.args).toEqual(['-e', 'reverse', 'tcp:5173', 'tcp:5173'])
    expect(calls[1]?.file).toBe('adb')
    expect(calls[1]?.args).toContain('http://127.0.0.1:5173/__eclipsa_native__/manifest.json')
    expect(calls[2]?.file).toBe(process.platform === 'win32' ? 'where' : 'which')
    expect(calls[2]?.args).toEqual(['java'])
    expect(calls[3]?.file).toBe(process.platform === 'win32' ? 'gradlew.bat' : './gradlew')
    expect(calls[3]?.cwd).toBe('/tmp/eclipsa-native-compose-host')
    expect(calls[3]?.args).toContain(':app:installDebug')
    expect(calls[3]?.env?.ANDROID_HOME).toBe('/toolchains/android-sdk')
    expect(calls[3]?.env?.ANDROID_SDK_ROOT).toBe('/toolchains/android-sdk')
    expect(calls[3]?.env?.JAVA_HOME).toBe('/toolchains/openjdk-17')
    expect(calls[4]?.file).toBe('adb')
  })

  it('fails fast when the Android emulator process exits before a device appears', async () => {
    const launchedProcess = {
      exitCode: 1,
      signalCode: null,
      stderr: {
        on(event: string, listener: (value: string) => void) {
          if (event === 'data') {
            listener('PANIC: Missing emulator backend')
          }
          return this
        },
        setEncoding() {},
      },
      unref() {},
    } as unknown as ReturnType<typeof import('node:child_process').spawn>

    await expect(waitForEmulatorDevice('adb', {}, 50, launchedProcess, 'Pixel_9a')).rejects.toThrow(
      /Missing emulator backend/,
    )
  })

  it('times out instead of hanging forever when no emulator device becomes available', async () => {
    await expect(waitForEmulatorDevice('__missing_adb__', {}, 50)).rejects.toThrow(
      /Timed out waiting for the Android emulator device/,
    )
  }, 3_000)
})
