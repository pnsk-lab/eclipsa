import { execFile, spawn } from 'node:child_process'
import { access, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_ANDROID_APPLICATION_ID = 'dev.eclipsa.nativecompose'
const DEFAULT_ANDROID_ACTIVITY_NAME = '.MainActivity'
const DEFAULT_MANIFEST_EXTRA_NAME = 'manifestUrl'
const DEFAULT_BOOT_TIMEOUT_MS = 120_000
const DEFAULT_HOST_PROJECT_PATH = path.resolve(import.meta.dirname, './android-compose')

export interface ComposeHostLaunchOptions {
  activityName: string
  adbPath: string
  applicationId: string
  avd?: string
  bootTimeoutMs: number
  emulator: boolean
  emulatorPath: string
  hostProjectPath?: string
  installHostApp?: boolean
  manifestExtraName: string
  manifestValue?: string
}

export interface ComposeCliOptions {
  avd?: string
  bootTimeoutMs?: number
  emulator?: boolean
}

const COMPOSE_EMULATOR_ENV_NAME = 'ECLIPSA_NATIVE_COMPOSE_EMULATOR'
const COMPOSE_AVD_ENV_NAME = 'ECLIPSA_NATIVE_COMPOSE_AVD'
const COMPOSE_BOOT_TIMEOUT_ENV_NAME = 'ECLIPSA_NATIVE_COMPOSE_BOOT_TIMEOUT_MS'
const composeHostInstallTask = ':app:installDebug'

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const resolveSdkRoots = (env: NodeJS.ProcessEnv) => {
  const roots = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    path.join(env.HOME ?? '', 'Android', 'Sdk'),
  ]
  return roots.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

const resolveExecutable = async (
  env: NodeJS.ProcessEnv,
  preferredName: string,
  fallbackPaths: string[],
) => {
  try {
    const { stdout } = await execFileAsync('which', [preferredName], {
      encoding: 'utf8',
      env,
    })
    const resolvedPath = stdout.trim()
    if (resolvedPath.length > 0) {
      return resolvedPath
    }
  } catch {}

  for (const candidate of fallbackPaths) {
    if (await fileExists(candidate)) {
      return candidate
    }
  }

  throw new Error(
    `Could not resolve "${preferredName}". Add it to PATH or set ANDROID_HOME/ANDROID_SDK_ROOT.`,
  )
}

interface CommandError extends Error {
  stderr?: string
  stdout?: string
}

interface ExecFileResult {
  stderr: string
  stdout: string
}

interface ExecFileOptions {
  cwd?: string
  encoding?: BufferEncoding
  env?: NodeJS.ProcessEnv
}

interface ComposeHostTooling {
  execFile: (
    file: string,
    args: readonly string[],
    options: ExecFileOptions,
  ) => Promise<ExecFileResult>
  fileExists: (filePath: string) => Promise<boolean>
  realpath: (filePath: string) => Promise<string>
}

const defaultComposeHostTooling: ComposeHostTooling = {
  execFile: (file, args, options) => execFileAsync(file, [...args], options),
  fileExists,
  realpath,
}

const listAdbDevices = async (adbPath: string, env: NodeJS.ProcessEnv) => {
  const { stdout } = await execFileAsync(adbPath, ['devices'], {
    encoding: 'utf8',
    env,
  })
  return splitLines(stdout)
    .slice(1)
    .map((line) => line.split(/\s+/)[0] ?? '')
    .filter(Boolean)
}

const listAvds = async (emulatorPath: string, env: NodeJS.ProcessEnv) => {
  const { stdout } = await execFileAsync(emulatorPath, ['-list-avds'], {
    encoding: 'utf8',
    env,
  })
  return splitLines(stdout)
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const formatEmulatorLaunchFailure = (
  reason: string,
  details: {
    avd?: string
    stderr?: string
    timeoutMs: number
  },
) => {
  const stderr = details.stderr?.trim()
  const message = [
    `${reason} after ${details.timeoutMs}ms.`,
    details.avd ? `AVD: ${details.avd}.` : null,
    stderr ? `Emulator stderr:\n${stderr}` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return new Error(message)
}

export const waitForEmulatorDevice = async (
  adbPath: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  launchedProcess?: ReturnType<typeof spawn>,
  launchedAvd?: string,
) => {
  const deadline = Date.now() + timeoutMs
  const stderrChunks: string[] = []
  if (launchedProcess?.stderr) {
    launchedProcess.stderr.setEncoding('utf8')
    launchedProcess.stderr.on('data', (chunk: string) => {
      stderrChunks.push(chunk)
      if (stderrChunks.join('').length > 8_192) {
        stderrChunks.splice(0, stderrChunks.length, stderrChunks.join('').slice(-8_192))
      }
    })
  }

  while (Date.now() < deadline) {
    if (launchedProcess && launchedProcess.exitCode != null) {
      throw formatEmulatorLaunchFailure('Android emulator exited before it became available', {
        avd: launchedAvd,
        stderr: stderrChunks.join(''),
        timeoutMs,
      })
    }
    if (launchedProcess && launchedProcess.signalCode != null) {
      throw formatEmulatorLaunchFailure(
        `Android emulator terminated with signal ${launchedProcess.signalCode}`,
        {
          avd: launchedAvd,
          stderr: stderrChunks.join(''),
          timeoutMs,
        },
      )
    }

    try {
      const devices = await listAdbDevices(adbPath, env)
      if (devices.some((serial) => serial.startsWith('emulator-'))) {
        launchedProcess?.unref()
        return
      }
    } catch {}

    await delay(1_000)
  }

  throw formatEmulatorLaunchFailure('Timed out waiting for the Android emulator device', {
    avd: launchedAvd,
    stderr: stderrChunks.join(''),
    timeoutMs,
  })
}

const waitForEmulatorBoot = async (adbPath: string, env: NodeJS.ProcessEnv, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync(
        adbPath,
        ['-e', 'shell', 'getprop', 'sys.boot_completed'],
        {
          encoding: 'utf8',
          env,
        },
      )
      if (stdout.trim() === '1') {
        return
      }
    } catch {}
    await delay(1_000)
  }
  throw new Error(
    `Timed out waiting for the Android emulator to finish booting after ${timeoutMs}ms.`,
  )
}

const ensureEmulator = async (
  options: Pick<ComposeHostLaunchOptions, 'adbPath' | 'avd' | 'bootTimeoutMs' | 'emulatorPath'>,
  env: NodeJS.ProcessEnv,
) => {
  const devices = await listAdbDevices(options.adbPath, env)
  let launchedProcess: ReturnType<typeof spawn> | undefined
  let launchedAvd: string | undefined
  if (!devices.some((serial) => serial.startsWith('emulator-'))) {
    const availableAvds = await listAvds(options.emulatorPath, env)
    const avd = options.avd ?? availableAvds[0]
    if (!avd) {
      throw new Error(
        'No Android Virtual Devices are available. Create one in Android Studio Device Manager first.',
      )
    }
    launchedAvd = avd
    launchedProcess = spawn(options.emulatorPath, ['-avd', avd], {
      detached: true,
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  }

  await waitForEmulatorDevice(
    options.adbPath,
    env,
    options.bootTimeoutMs,
    launchedProcess,
    launchedAvd,
  )
  await waitForEmulatorBoot(options.adbPath, env, options.bootTimeoutMs)
}

export const parseComposeHostLaunchArgs = (argv: string[]) => {
  const parsed = {
    activityName: DEFAULT_ANDROID_ACTIVITY_NAME,
    applicationId: DEFAULT_ANDROID_APPLICATION_ID,
    avd: undefined as string | undefined,
    bootTimeoutMs: DEFAULT_BOOT_TIMEOUT_MS,
    emulator: false,
    manifestExtraName: DEFAULT_MANIFEST_EXTRA_NAME,
    manifestValue: undefined as string | undefined,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    switch (argument) {
      case '--activity-name':
        parsed.activityName = argv[++index] ?? parsed.activityName
        break
      case '--application-id':
        parsed.applicationId = argv[++index] ?? parsed.applicationId
        break
      case '--avd':
        parsed.avd = argv[++index] ?? parsed.avd
        break
      case '--boot-timeout-ms': {
        const rawValue = argv[++index]
        if (rawValue) {
          const value = Number(rawValue)
          if (Number.isFinite(value) && value > 0) {
            parsed.bootTimeoutMs = value
          }
        }
        break
      }
      case '--emulator':
      case '--enurator':
        parsed.emulator = true
        break
      case '--manifest-extra-name':
        parsed.manifestExtraName = argv[++index] ?? parsed.manifestExtraName
        break
      case '--manifest-path':
      case '--manifest-url':
        parsed.manifestValue = argv[++index] ?? parsed.manifestValue
        break
      default:
        break
    }
  }

  return parsed
}

export const parseComposeCliOptions = (argv: string[]): ComposeCliOptions => {
  const parsed = parseComposeHostLaunchArgs(argv)
  return {
    avd: parsed.avd,
    bootTimeoutMs: argv.includes('--boot-timeout-ms') ? parsed.bootTimeoutMs : undefined,
    emulator: argv.includes('--emulator') || argv.includes('--enurator') ? true : undefined,
  }
}

export const parseComposeCliOptionsFromEnv = (env: NodeJS.ProcessEnv): ComposeCliOptions => {
  const rawBootTimeout = env[COMPOSE_BOOT_TIMEOUT_ENV_NAME]
  const bootTimeoutMs =
    rawBootTimeout && Number.isFinite(Number(rawBootTimeout)) && Number(rawBootTimeout) > 0
      ? Number(rawBootTimeout)
      : undefined

  return {
    avd: env[COMPOSE_AVD_ENV_NAME] || undefined,
    bootTimeoutMs,
    emulator:
      env[COMPOSE_EMULATOR_ENV_NAME] === '1' || env[COMPOSE_EMULATOR_ENV_NAME] === 'true'
        ? true
        : undefined,
  }
}

export const createDefaultComposeHostCommand = (
  manifestUrl: string,
  options: {
    activityName?: string
    applicationId?: string
    avd?: string
    bootTimeoutMs?: number
    emulator?: boolean
    manifestExtraName?: string
  } = {},
) => {
  const args: [string, ...string[]] = [
    'bun',
    path.resolve(import.meta.dirname, './host.ts'),
    '--application-id',
    options.applicationId ?? DEFAULT_ANDROID_APPLICATION_ID,
    '--activity-name',
    options.activityName ?? DEFAULT_ANDROID_ACTIVITY_NAME,
    '--manifest-extra-name',
    options.manifestExtraName ?? DEFAULT_MANIFEST_EXTRA_NAME,
    '--manifest-url',
    manifestUrl,
  ]

  if (options.bootTimeoutMs != null) {
    args.push('--boot-timeout-ms', String(options.bootTimeoutMs))
  }
  if (options.emulator) {
    args.push('--emulator')
  }
  if (options.avd) {
    args.push('--avd', options.avd)
  }

  return args
}

export const createDefaultComposeHostInstallCommand = (hostProjectPath: string) =>
  [
    process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
    '--project-dir',
    hostProjectPath,
    composeHostInstallTask,
  ] as const

const resolveLoopbackManifestPort = (manifestValue: string) => {
  try {
    const url = new URL(manifestValue)
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') &&
      url.port.length > 0
    ) {
      return url.port
    }
  } catch {}
  return null
}

const getComposeHostGradleWrapperPath = (hostProjectPath: string) =>
  path.join(hostProjectPath, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')

const normalizeAndroidSdkRoot = async (
  candidatePath: string,
  tooling: ComposeHostTooling,
): Promise<string | null> => {
  let currentPath = await tooling.realpath(candidatePath).catch(() => candidatePath)
  while (true) {
    if (path.basename(currentPath) === 'android-sdk') {
      return currentPath
    }
    const parentPath = path.dirname(currentPath)
    if (parentPath === currentPath) {
      return null
    }
    currentPath = parentPath
  }
}

const resolveAndroidSdkRootFromCandidates = async (
  candidatePaths: readonly string[],
  tooling: ComposeHostTooling,
) => {
  for (const candidatePath of candidatePaths) {
    const normalizedPath = await normalizeAndroidSdkRoot(candidatePath, tooling)
    if (normalizedPath) {
      return normalizedPath
    }
  }
  return null
}

const isCompleteAndroidSdkRoot = async (sdkRoot: string, tooling: ComposeHostTooling) => {
  const adbPath = path.join(
    sdkRoot,
    'platform-tools',
    process.platform === 'win32' ? 'adb.exe' : 'adb',
  )
  if (!(await tooling.fileExists(adbPath))) {
    return false
  }

  const hasBuildTools = await tooling.fileExists(path.join(sdkRoot, 'build-tools'))
  const hasPlatforms = await tooling.fileExists(path.join(sdkRoot, 'platforms'))
  return hasBuildTools || hasPlatforms
}

export const resolveAndroidSdkRoot = async (
  env: NodeJS.ProcessEnv = process.env,
  candidatePaths: readonly string[] = [],
  tooling: ComposeHostTooling = defaultComposeHostTooling,
) => {
  const configuredRoot = env.ANDROID_HOME?.trim() || env.ANDROID_SDK_ROOT?.trim()
  if (configuredRoot && (await isCompleteAndroidSdkRoot(configuredRoot, tooling))) {
    return configuredRoot
  }

  const resolvedFromCandidates = await resolveAndroidSdkRootFromCandidates(
    [...candidatePaths, ...resolveSdkRoots(env)],
    tooling,
  )
  if (resolvedFromCandidates && (await isCompleteAndroidSdkRoot(resolvedFromCandidates, tooling))) {
    return resolvedFromCandidates
  }

  return resolvedFromCandidates
}

const normalizeJavaHome = async (javaExecutablePath: string, tooling: ComposeHostTooling) =>
  path.dirname(path.dirname(await tooling.realpath(javaExecutablePath)))

const resolveJavaHomeFromPath = async (env: NodeJS.ProcessEnv, tooling: ComposeHostTooling) => {
  try {
    const { stdout } = await tooling.execFile(
      process.platform === 'win32' ? 'where' : 'which',
      ['java'],
      {
        encoding: 'utf8',
        env,
      },
    )
    const javaExecutablePath = stdout.trim().split(/\r?\n/)[0]?.trim()
    if (!javaExecutablePath) {
      return null
    }
    return normalizeJavaHome(javaExecutablePath, tooling)
  } catch {
    return null
  }
}

export const resolveJavaHome = async (
  env: NodeJS.ProcessEnv = process.env,
  tooling: ComposeHostTooling = defaultComposeHostTooling,
) => {
  const configuredJavaHome = env.JAVA_HOME?.trim()
  if (configuredJavaHome) {
    const configuredJavaExecutable = path.join(
      configuredJavaHome,
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java',
    )
    if (await tooling.fileExists(configuredJavaExecutable)) {
      return normalizeJavaHome(configuredJavaExecutable, tooling)
    }
  }

  return resolveJavaHomeFromPath(env, tooling)
}

const formatCommandErrorOutput = (error: unknown) => {
  const lines: string[] = []
  if (error instanceof Error && error.message) {
    lines.push(error.message)
  }
  if (typeof (error as CommandError | undefined)?.stdout === 'string') {
    lines.push((error as CommandError).stdout ?? '')
  }
  if (typeof (error as CommandError | undefined)?.stderr === 'string') {
    lines.push((error as CommandError).stderr ?? '')
  }
  return lines.join('\n')
}

export const isMissingComposeHostActivityError = (error: unknown) => {
  const output = formatCommandErrorOutput(error)
  return (
    /Error type 3/i.test(output) ||
    /Activity class .* does not exist\./i.test(output) ||
    /unable to resolve Intent/i.test(output)
  )
}

const shouldInstallComposeHostApp = (
  options: Pick<
    ComposeHostLaunchOptions,
    'activityName' | 'applicationId' | 'hostProjectPath' | 'installHostApp'
  >,
) => {
  if (options.installHostApp === false) {
    return false
  }
  if (options.hostProjectPath) {
    return true
  }
  return (
    options.applicationId === DEFAULT_ANDROID_APPLICATION_ID &&
    options.activityName === DEFAULT_ANDROID_ACTIVITY_NAME
  )
}

export const launchComposeHostActivity = async (
  options: Pick<
    ComposeHostLaunchOptions,
    | 'activityName'
    | 'adbPath'
    | 'applicationId'
    | 'emulator'
    | 'hostProjectPath'
    | 'installHostApp'
    | 'manifestExtraName'
    | 'manifestValue'
  >,
  env: NodeJS.ProcessEnv = process.env,
  tooling: ComposeHostTooling = defaultComposeHostTooling,
) => {
  const targetArgs = options.emulator ? ['-e'] : []
  const manifestValue = options.manifestValue
  const manifestPort = manifestValue ? resolveLoopbackManifestPort(manifestValue) : null
  if (manifestPort) {
    await tooling.execFile(
      options.adbPath,
      [...targetArgs, 'reverse', `tcp:${manifestPort}`, `tcp:${manifestPort}`],
      {
        env,
      },
    )
  }
  const args = [
    ...targetArgs,
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.MAIN',
    '-n',
    `${options.applicationId}/${options.activityName}`,
  ]
  if (manifestValue) {
    args.push('--es', options.manifestExtraName, manifestValue)
  }

  try {
    await tooling.execFile(options.adbPath, args, {
      env,
    })
    return
  } catch (error) {
    const hostProjectPath = options.hostProjectPath ?? DEFAULT_HOST_PROJECT_PATH
    const shouldInstall =
      shouldInstallComposeHostApp(options) &&
      isMissingComposeHostActivityError(error) &&
      (await tooling.fileExists(getComposeHostGradleWrapperPath(hostProjectPath)))

    if (!shouldInstall) {
      throw error
    }

    const [command, ...installArgs] = createDefaultComposeHostInstallCommand(hostProjectPath)
    const javaHome = await resolveJavaHome(env, tooling)
    const androidSdkRoot = await resolveAndroidSdkRoot(env, [options.adbPath], tooling)
    const installEnv = {
      ...env,
      ...(androidSdkRoot
        ? {
            ANDROID_HOME: androidSdkRoot,
            ANDROID_SDK_ROOT: androidSdkRoot,
          }
        : {}),
      ...(javaHome
        ? {
            JAVA_HOME: javaHome,
            PATH: [path.join(javaHome, 'bin'), env.PATH ?? process.env.PATH ?? '']
              .filter(Boolean)
              .join(path.delimiter),
          }
        : {}),
    }
    await tooling.execFile(command, installArgs, {
      cwd: hostProjectPath,
      env: installEnv,
    })
    await tooling.execFile(options.adbPath, args, {
      env,
    })
  }
}

export const launchComposeHost = async (
  options: Omit<ComposeHostLaunchOptions, 'adbPath' | 'emulatorPath'>,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const sdkRoots = resolveSdkRoots(env)
  const adbPath = await resolveExecutable(
    env,
    'adb',
    sdkRoots.map((root) =>
      path.join(root, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'),
    ),
  )
  const emulatorPath = await resolveExecutable(
    env,
    'emulator',
    sdkRoots.map((root) =>
      path.join(root, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator'),
    ),
  ).catch((error) => {
    if (!options.emulator) {
      return 'emulator'
    }
    throw error
  })

  if (options.emulator) {
    await ensureEmulator(
      {
        adbPath,
        avd: options.avd,
        bootTimeoutMs: options.bootTimeoutMs,
        emulatorPath,
      },
      env,
    )
  }

  await launchComposeHostActivity(
    {
      ...options,
      adbPath,
    },
    env,
  )
}

if (import.meta.main) {
  const parsed = parseComposeHostLaunchArgs(process.argv.slice(2))
  const manifestValue = parsed.manifestValue ?? process.env.ECLIPSA_NATIVE_MANIFEST

  await launchComposeHost(
    {
      activityName: parsed.activityName,
      applicationId: parsed.applicationId,
      avd: parsed.avd,
      bootTimeoutMs: parsed.bootTimeoutMs,
      emulator: parsed.emulator,
      manifestExtraName: parsed.manifestExtraName,
      manifestValue,
    },
    process.env,
  )
}
