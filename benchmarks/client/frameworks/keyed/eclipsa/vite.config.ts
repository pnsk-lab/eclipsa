import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig } from 'vite'

const hasWorkspaceRootMarkers = (directory: string) =>
  existsSync(resolve(directory, 'package.json')) &&
  existsSync(resolve(directory, 'packages/eclipsa/mod.ts'))

const findWorkspaceRoot = (startDirectory = import.meta.dirname) => {
  let current = startDirectory
  while (true) {
    if (hasWorkspaceRootMarkers(current)) {
      return current
    }

    const parent = resolve(current, '..')
    if (parent === current) {
      throw new Error(`Failed to locate the Eclipsa workspace root from ${startDirectory}.`)
    }
    current = parent
  }
}

const importWorkspaceModule = async (...segments: string[]) =>
  import(pathToFileURL(resolve(findWorkspaceRoot(), ...segments)).href)

const {
  collectReachableSymbols,
  compileModuleForClient,
  createBuildSymbolEntryName,
  createSymbolRequestId,
  loadSymbolModuleForClient,
  parseSymbolRequest,
} = await importWorkspaceModule('packages/eclipsa/vite/compiler.ts')

const stripQuery = (id: string) => id.replace(/[?#].*$/, '')
const isEclipsaBenchmarkSource = (id: string) => /\.(?:jsx|tsx)$/.test(stripQuery(id))
const benchmarkEntry = resolve(import.meta.dirname, 'src/main.tsx')
const benchmarkSymbolVirtualId = 'virtual:eclipsa-benchmark-symbols'
const benchmarkSymbols = await collectReachableSymbols([benchmarkEntry])

export const benchmarkSymbolUrls = Object.fromEntries(
  benchmarkSymbols.map((symbol) => [
    symbol.id,
    `dist/entries/${createBuildSymbolEntryName(symbol.id)}.js`,
  ]),
)

const benchmarkSymbolInputs = Object.fromEntries(
  benchmarkSymbols.map((symbol) => [
    createBuildSymbolEntryName(symbol.id),
    createSymbolRequestId(symbol.filePath, symbol.id),
  ]),
)

export const createEclipsaBenchmarkPlugin = () => ({
  enforce: 'pre' as const,
  name: 'vite-plugin-eclipsa-benchmark',
  load(id: string) {
    if (id === benchmarkSymbolVirtualId) {
      const entries = Object.entries(benchmarkSymbolUrls)
        .map(
          ([symbolId, url]) =>
            `${JSON.stringify(symbolId)}: new URL(${JSON.stringify(url)}, window.location.href).href`,
        )
        .join(', ')
      return `export const benchmarkSymbols = {${entries}};`
    }
    if (!parseSymbolRequest(id)) {
      return null
    }
    return loadSymbolModuleForClient(id)
  },
  resolveId(source: string) {
    return source === benchmarkSymbolVirtualId ? benchmarkSymbolVirtualId : null
  },
  async transform(code: string, id: string) {
    if (!isEclipsaBenchmarkSource(id) || parseSymbolRequest(id)) {
      return null
    }

    return {
      code: await compileModuleForClient(code, stripQuery(id), {
        hmr: false,
      }),
      map: null,
    }
  },
})

export default defineConfig({
  appType: 'custom',
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: benchmarkEntry,
        ...benchmarkSymbolInputs,
      },
      preserveEntrySignatures: 'allow-extension',
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: (chunk) =>
          chunk.name === 'main' ? 'assets/[name].js' : 'entries/[name].js',
        format: 'es',
      },
    },
    sourcemap: false,
    target: 'es2022',
  },
  plugins: [createEclipsaBenchmarkPlugin()],
})
