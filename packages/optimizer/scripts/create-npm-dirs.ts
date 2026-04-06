import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

type Platform = NodeJS.Platform | 'wasi' | 'wasm' | 'openharmony'
type NodeArch =
  | 'arm'
  | 'arm64'
  | 'ia32'
  | 'loong64'
  | 'ppc64'
  | 'riscv64'
  | 'universal'
  | 'wasm32'
  | 'x64'
  | 's390x'

interface RootPackageJson {
  author?: string
  authors?: string[]
  bugs?: unknown
  dependencies?: Record<string, string>
  description?: string
  engines?: Record<string, string>
  homepage?: unknown
  keywords?: string[]
  license?: string
  name: string
  napi?: {
    binaryName?: string
    name?: string
    package?: {
      name?: string
    }
    packageName?: string
    targets?: string[]
  }
  publishConfig?: {
    access?: string
    registry?: string
  }
  repository?: unknown
  version: string
}

interface ParsedTarget {
  abi: string | null
  arch: NodeArch
  platform: Platform
  platformArchABI: string
  triple: string
}

interface ScopedPackageJson {
  author?: string
  authors?: string[]
  browser?: string
  bugs?: unknown
  cpu?: string[]
  dependencies?: Record<string, string>
  description?: string
  engines?: Record<string, string>
  files: string[]
  homepage?: unknown
  keywords?: string[]
  libc?: string[]
  license?: string
  main: string
  name: string
  os?: string[]
  publishConfig?: {
    access?: string
    registry?: string
  }
  repository?: unknown
  version: string
}

interface CreateNpmDirsOptions {
  cwd?: string
  npmDir?: string
  packageJsonPath?: string
}

const CPU_TO_NODE_ARCH: Record<string, NodeArch> = {
  aarch64: 'arm64',
  i686: 'ia32',
  loongarch64: 'loong64',
  powerpc64le: 'ppc64',
  riscv64gc: 'riscv64',
  s390x: 's390x',
  wasm32: 'wasm32',
  x86_64: 'x64',
}

const SYS_TO_NODE_PLATFORM: Record<string, Platform> = {
  darwin: 'darwin',
  freebsd: 'freebsd',
  linux: 'linux',
  ohos: 'openharmony',
  wasi: 'wasi',
  windows: 'win32',
}

const SUB_SYSTEMS = new Set(['android', 'ohos'])

const readPackageJson = async (packageJsonPath: string) =>
  JSON.parse(await readFile(packageJsonPath, 'utf8')) as RootPackageJson

const parseTargetTriple = (rawTriple: string): ParsedTarget => {
  if (
    rawTriple === 'wasm32-wasi' ||
    rawTriple === 'wasm32-wasi-preview1-threads' ||
    rawTriple.startsWith('wasm32-wasip')
  ) {
    return {
      triple: rawTriple,
      platformArchABI: 'wasm32-wasi',
      platform: 'wasi',
      arch: 'wasm32',
      abi: 'wasi',
    }
  }

  const triple = rawTriple.endsWith('eabi') ? `${rawTriple.slice(0, -4)}-eabi` : rawTriple
  const segments = triple.split('-')
  let cpu: string
  let sys: string
  let abi: string | null = null

  if (segments.length === 2) {
    ;[cpu, sys] = segments
  } else {
    ;[cpu, , sys, abi = null] = segments
  }

  if (abi && SUB_SYSTEMS.has(abi)) {
    sys = abi
    abi = null
  }

  const platform = SYS_TO_NODE_PLATFORM[sys] ?? (sys as Platform)
  const arch = CPU_TO_NODE_ARCH[cpu] ?? (cpu as NodeArch)

  return {
    triple: rawTriple,
    platformArchABI: abi ? `${platform}-${arch}-${abi}` : `${platform}-${arch}`,
    platform,
    arch,
    abi,
  }
}

const pickDefined = <T extends object, K extends keyof T>(source: T, keys: K[]) =>
  Object.fromEntries(
    keys.flatMap((key) => {
      const value = source[key]
      return value === undefined ? [] : [[key, value]]
    }),
  ) as Partial<Pick<T, K>>

const resolveBinaryName = (packageJson: RootPackageJson) =>
  packageJson.napi?.binaryName ?? packageJson.napi?.name ?? 'index'

const resolvePackageName = (packageJson: RootPackageJson) =>
  packageJson.napi?.packageName ?? packageJson.napi?.package?.name ?? packageJson.name

const resolveTargets = (packageJson: RootPackageJson) => {
  const rawTargets = packageJson.napi?.targets ?? []
  const uniqueTargets = new Set(rawTargets)

  if (rawTargets.length === 0) {
    throw new Error('Expected package.json napi.targets to contain at least one target.')
  }

  if (uniqueTargets.size !== rawTargets.length) {
    const duplicateTarget = rawTargets.find((target, index) => rawTargets.indexOf(target) !== index)
    throw new Error(`Duplicate targets are not allowed: ${duplicateTarget}`)
  }

  return rawTargets.map(parseTargetTriple)
}

const hasNode14OrNewer = (engines: Record<string, string> | undefined) => {
  const declared = engines?.node
  if (!declared) {
    return false
  }

  const major = Number(declared.match(/\d+/)?.[0] ?? 0)
  return Number.isFinite(major) && major >= 14
}

const createScopedPackageJson = (packageJson: RootPackageJson, target: ParsedTarget) => {
  const binaryName = resolveBinaryName(packageJson)
  const scopedPackageJson: ScopedPackageJson = {
    name: `${resolvePackageName(packageJson)}-${target.platformArchABI}`,
    version: packageJson.version,
    cpu: [target.arch],
    main:
      target.arch === 'wasm32'
        ? `${binaryName}.wasi.cjs`
        : `${binaryName}.${target.platformArchABI}.node`,
    files:
      target.arch === 'wasm32'
        ? [
            `${binaryName}.wasm32-wasi.wasm`,
            `${binaryName}.wasi.cjs`,
            `${binaryName}.wasi-browser.js`,
            'wasi-worker.mjs',
            'wasi-worker-browser.mjs',
          ]
        : [`${binaryName}.${target.platformArchABI}.node`],
    ...pickDefined(packageJson, [
      'description',
      'keywords',
      'author',
      'authors',
      'homepage',
      'license',
      'engines',
      'repository',
      'bugs',
    ]),
  }

  if (packageJson.publishConfig) {
    const publishConfig = pickDefined(packageJson.publishConfig, ['registry', 'access'])
    scopedPackageJson.publishConfig = publishConfig
  }

  if (target.arch !== 'wasm32') {
    scopedPackageJson.os = [target.platform]
  } else {
    if (!hasNode14OrNewer(scopedPackageJson.engines)) {
      scopedPackageJson.engines = {
        node: '>=14.0.0',
      }
    }

    const wasmRuntimeVersion = packageJson.dependencies?.['@napi-rs/wasm-runtime']
    if (!wasmRuntimeVersion) {
      throw new Error('Expected @napi-rs/wasm-runtime to be declared in dependencies.')
    }

    scopedPackageJson.browser = `${binaryName}.wasi-browser.js`
    scopedPackageJson.dependencies = {
      '@napi-rs/wasm-runtime': wasmRuntimeVersion,
    }
  }

  if (target.abi === 'gnu') {
    scopedPackageJson.libc = ['glibc']
  } else if (target.abi === 'musl') {
    scopedPackageJson.libc = ['musl']
  }

  return scopedPackageJson
}

const createScopedReadme = (
  packageName: string,
  target: ParsedTarget,
) => `# \`${packageName}-${target.platformArchABI}\`

This is the **${target.triple}** binary for \`${packageName}\`
`

export const createNpmDirs = async (options: CreateNpmDirsOptions = {}) => {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const packageJsonPath = path.resolve(cwd, options.packageJsonPath ?? 'package.json')
  const npmDir = path.resolve(cwd, options.npmDir ?? 'npm')
  const packageJson = await readPackageJson(packageJsonPath)
  const packageName = resolvePackageName(packageJson)

  await rm(npmDir, { recursive: true, force: true })

  for (const target of resolveTargets(packageJson)) {
    const targetDir = path.join(npmDir, target.platformArchABI)
    await mkdir(targetDir, { recursive: true })
    await writeFile(
      path.join(targetDir, 'package.json'),
      `${JSON.stringify(createScopedPackageJson(packageJson, target), null, 2)}\n`,
    )
    await writeFile(path.join(targetDir, 'README.md'), createScopedReadme(packageName, target))
  }
}

const parseCliArgs = (argv: string[]) => {
  const parsed: CreateNpmDirsOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]

    if (!value) {
      continue
    }

    if (argument === '--cwd') {
      parsed.cwd = value
      index += 1
      continue
    }

    if (argument === '--package-json-path') {
      parsed.packageJsonPath = value
      index += 1
      continue
    }

    if (argument === '--npm-dir') {
      parsed.npmDir = value
      index += 1
    }
  }

  return parsed
}

if (import.meta.main) {
  await createNpmDirs(parseCliArgs(process.argv.slice(2)))
}

export { parseTargetTriple }
