import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'

type CliPackageJson = {
  bin?: Record<string, string>
  version?: string
}

type CargoMetadataPackage = {
  manifest_path?: string
  name?: string
}

type CargoMetadata = {
  packages?: CargoMetadataPackage[]
  resolve?: {
    root?: string
  }
  target_directory?: string
}

const NOISY_TYPE_DEF_WARNING =
  'Failed to write type def file: Os { code: 2, kind: NotFound, message: "No such file or directory" }'

export const resolveNapiCliPath = async () => {
  const require = createRequire(import.meta.url)
  const packageJsonPath = require.resolve('@napi-rs/cli/package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as CliPackageJson
  const cliRelativePath = packageJson.bin?.napi

  if (!cliRelativePath) {
    throw new Error('Unable to resolve the napi binary entry from @napi-rs/cli/package.json.')
  }

  return path.resolve(path.dirname(packageJsonPath), cliRelativePath)
}

const execFileAsync = promisify(execFile)

const resolveNapiCliPackageJson = async () => {
  const require = createRequire(import.meta.url)
  const packageJsonPath = require.resolve('@napi-rs/cli/package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as CliPackageJson
  return {
    packageJson,
    packageJsonPath,
  }
}

const findArgValue = (argv: string[], ...flags: string[]) => {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!flags.includes(current)) {
      continue
    }
    const next = argv[index + 1]
    if (next && !next.startsWith('-')) {
      return next
    }
  }
  return null
}

const resolveCargoMetadata = async (cwd: string, manifestPath: string) => {
  const { stdout } = await execFileAsync(
    process.env.CARGO ?? 'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifestPath],
    {
      cwd,
      encoding: 'utf8',
      env: process.env,
    },
  )
  return JSON.parse(stdout) as CargoMetadata
}

const resolveRootPackage = (metadata: CargoMetadata, manifestPath: string) => {
  const manifestPathResolved = path.resolve(manifestPath)
  return (
    metadata.packages?.find(
      (pkg) => path.resolve(pkg.manifest_path ?? '') === manifestPathResolved,
    ) ??
    metadata.packages?.find((pkg) => pkg.name != null) ??
    null
  )
}

export const resolveNapiTypeDefTempFolder = (
  targetDirectory: string,
  crateName: string,
  manifestPath: string,
  cliVersion: string,
) => {
  const hash = createHash('sha256')
    .update(manifestPath)
    .update(cliVersion)
    .digest('hex')
    .substring(0, 8)
  return path.join(targetDirectory, 'napi-rs', `${crateName}-${hash}`)
}

export const filterNapiStderrLines = (output: string) => {
  const lines = output.split(/\r?\n/)
  const forwarded: string[] = []
  let suppressedCount = 0

  for (const line of lines) {
    if (line.includes(NOISY_TYPE_DEF_WARNING)) {
      suppressedCount += 1
      continue
    }
    forwarded.push(line)
  }

  return {
    forwarded: forwarded.join('\n'),
    suppressedCount,
  }
}

const attachFilteredOutput = (
  stream: NodeJS.ReadableStream | null | undefined,
  target: NodeJS.WriteStream,
  onSuppressed: (count: number) => void,
) => {
  if (!stream) {
    return () => {}
  }

  let buffer = ''
  stream.setEncoding?.('utf8')
  stream.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    const filtered = filterNapiStderrLines(lines.join('\n'))
    onSuppressed(filtered.suppressedCount)
    if (filtered.forwarded.length > 0) {
      target.write(`${filtered.forwarded}\n`)
    }
  })

  return () => {
    if (buffer.length === 0) {
      return
    }
    const filtered = filterNapiStderrLines(buffer)
    onSuppressed(filtered.suppressedCount)
    if (filtered.forwarded.length > 0) {
      target.write(filtered.forwarded)
    }
  }
}

const ensureTypeDefTempFolder = async (argv: string[]) => {
  if (argv[0] !== 'build' || process.env.NAPI_TYPE_DEF_TMP_FOLDER) {
    return
  }

  const cwd = process.cwd()
  const manifestPathArg = findArgValue(argv, '--manifest-path')
  if (!manifestPathArg) {
    return
  }

  const targetDirArg = findArgValue(argv, '--target-dir')
  const manifestPath = path.resolve(cwd, manifestPathArg)
  const metadata = await resolveCargoMetadata(cwd, manifestPath)
  const rootPackage = resolveRootPackage(metadata, manifestPath)
  const cliVersion = (await resolveNapiCliPackageJson()).packageJson.version

  if (!rootPackage?.name || !rootPackage.manifest_path || !cliVersion) {
    return
  }

  const targetDirectory = path.resolve(cwd, targetDirArg ?? metadata.target_directory ?? 'target')
  const typeDefTempFolder = resolveNapiTypeDefTempFolder(
    targetDirectory,
    rootPackage.name,
    rootPackage.manifest_path,
    cliVersion,
  )

  await mkdir(typeDefTempFolder, { recursive: true })
  process.env.NAPI_TYPE_DEF_TMP_FOLDER = typeDefTempFolder
}

export const runNapiCli = async (argv: string[]) => {
  await ensureTypeDefTempFolder(argv)
  const { packageJsonPath, packageJson } = await resolveNapiCliPackageJson()
  const cliRelativePath = packageJson.bin?.napi

  if (!cliRelativePath) {
    throw new Error('Unable to resolve the napi binary entry from @napi-rs/cli/package.json.')
  }

  const cliPath = path.resolve(path.dirname(packageJsonPath), cliRelativePath)

  await new Promise<void>((resolve, reject) => {
    let suppressedTypeDefWarnings = 0
    const child = spawn(process.execPath, [cliPath, ...argv], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    })

    const flushStdout = attachFilteredOutput(child.stdout, process.stdout, (count) => {
      suppressedTypeDefWarnings += count
    })
    const flushStderr = attachFilteredOutput(child.stderr, process.stderr, (count) => {
      suppressedTypeDefWarnings += count
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      flushStdout()
      flushStderr()
      if (suppressedTypeDefWarnings > 0) {
        process.stderr.write(
          `[napi] Suppressed ${suppressedTypeDefWarnings} noisy type definition temp-dir warnings from @napi-rs/cli.\n`,
        )
      }
      if (signal) {
        reject(new Error(`napi terminated with signal ${signal}`))
        return
      }
      if (code && code !== 0) {
        reject(new Error(`napi exited with status ${code}`))
        return
      }
      resolve()
    })
  })
}

if (import.meta.main) {
  await runNapiCli(process.argv.slice(2))
}
