import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type PackageJson = Record<string, unknown>
type ManifestMode = 'dev' | 'publish'

export const DEV_EXPORTS = {
  '.': {
    types: './mod.ts',
    import: './mod.ts',
  },
  './atom': {
    types: './atom/mod.ts',
    import: './atom/mod.ts',
  },
  './web-utils': {
    types: './web-utils/mod.ts',
    import: './web-utils/mod.ts',
  },
  './vite': {
    types: './vite/mod.ts',
    import: './vite/mod.ts',
  },
  './jsx-runtime': {
    types: './jsx/jsx-runtime.ts',
    import: './jsx/jsx-runtime.ts',
  },
  './jsx-dev-runtime': {
    types: './jsx/jsx-dev-runtime.ts',
    import: './jsx/jsx-dev-runtime.ts',
  },
  './jsx': {
    types: './jsx/mod.ts',
    import: './jsx/mod.ts',
  },
  './internal': {
    types: './core/internal.ts',
    import: './core/internal.ts',
  },
  './client': {
    types: './core/client/mod.ts',
    import: './core/client/mod.ts',
  },
  './dev-client': {
    types: './core/dev-client/mod.ts',
    import: './core/dev-client/mod.ts',
  },
  './prod-client': {
    types: './core/prod-client/mod.ts',
    import: './core/prod-client/mod.ts',
  },
}

export const PUBLISH_EXPORTS = {
  '.': {
    types: './dist/mod.d.mts',
    import: './dist/mod.mjs',
  },
  './atom': {
    types: './dist/atom/mod.d.mts',
    import: './dist/atom/mod.mjs',
  },
  './web-utils': {
    types: './dist/web-utils/mod.d.mts',
    import: './dist/web-utils/mod.mjs',
  },
  './vite': {
    types: './dist/vite/mod.d.mts',
    import: './dist/vite/mod.mjs',
  },
  './jsx-runtime': {
    types: './dist/jsx/jsx-runtime.d.mts',
    import: './dist/jsx/jsx-runtime.mjs',
  },
  './jsx-dev-runtime': {
    types: './dist/jsx/jsx-dev-runtime.d.mts',
    import: './dist/jsx/jsx-dev-runtime.mjs',
  },
  './jsx': {
    types: './dist/jsx/mod.d.mts',
    import: './dist/jsx/mod.mjs',
  },
  './internal': {
    types: './dist/core/internal.d.mts',
    import: './dist/core/internal.mjs',
  },
  './client': {
    types: './dist/core/client/mod.d.mts',
    import: './dist/core/client/mod.mjs',
  },
  './dev-client': {
    types: './dist/core/dev-client/mod.d.mts',
    import: './dist/core/dev-client/mod.mjs',
  },
  './prod-client': {
    types: './dist/core/prod-client/mod.d.mts',
    import: './dist/core/prod-client/mod.mjs',
  },
}

export const PUBLISH_FILES = [
  'dist/**/*.mjs',
  'dist/**/*.mjs.map',
  'dist/**/*.d.mts',
  'compiler/native/generated/**/*.js',
  'compiler/native/generated/**/*.d.ts',
  'compiler/native/generated/**/*.cjs',
  'compiler/native/generated/**/*.mjs',
  'compiler/native/generated/**/*.wasm',
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
