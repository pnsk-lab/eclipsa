import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type PackageJson = Record<string, unknown>
type ManifestMode = 'dev' | 'publish'

export const DEV_EXPORTS = {
  '.': {
    types: './mod.ts',
    import: './mod.ts',
  },
  './browser': {
    types: './generated/index.d.ts',
    import: './generated/optimizer.wasi-browser.js',
  },
}

export const PUBLISH_EXPORTS = {
  '.': {
    types: './dist/mod.d.mts',
    import: './dist/mod.mjs',
  },
  './browser': {
    types: './generated/index.d.ts',
    import: './generated/optimizer.wasi-browser.js',
  },
}

export const PUBLISH_FILES = [
  'dist/**/*.mjs',
  'dist/**/*.mjs.map',
  'dist/**/*.d.mts',
  'generated/**/*.js',
  'generated/**/*.d.ts',
  'generated/**/*.cjs',
  'generated/**/*.mjs',
  'generated/**/*.wasm',
]

export const buildPackageManifest = (packageJson: PackageJson, mode: ManifestMode): PackageJson => {
  const nextManifest: PackageJson = {
    ...packageJson,
    exports: mode === 'publish' ? PUBLISH_EXPORTS : DEV_EXPORTS,
  }

  if (mode === 'publish') {
    nextManifest.files = PUBLISH_FILES
    nextManifest.main = './dist/mod.mjs'
    nextManifest.types = './dist/mod.d.mts'
    return nextManifest
  }

  delete nextManifest.files
  delete nextManifest.main
  delete nextManifest.types
  delete nextManifest.optionalDependencies
  return nextManifest
}

const parseArgs = (argv: string[]) => {
  const [modeArg, ...rest] = argv
  let mode: ManifestMode | null = null
  if (modeArg === 'publish' || modeArg === 'dev') {
    mode = modeArg
  }
  if (!mode) {
    throw new Error('Expected mode argument: dev | publish')
  }

  let packageJsonPath = path.resolve('package.json')
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--package-json') {
      packageJsonPath = path.resolve(rest[index + 1] ?? '')
      index += 1
    }
  }

  return { mode, packageJsonPath }
}

if (import.meta.main) {
  const { mode, packageJsonPath } = parseArgs(process.argv.slice(2))
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as PackageJson
  const nextManifest = buildPackageManifest(packageJson, mode)
  await writeFile(packageJsonPath, `${JSON.stringify(nextManifest, null, 2)}\n`)
}
