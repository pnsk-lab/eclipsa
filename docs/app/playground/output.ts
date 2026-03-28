import {
  PLAYGROUND_DIST_ROOT,
  PLAYGROUND_ENTRY_ID,
  PLAYGROUND_SYMBOL_QUERY,
  type PlaygroundOutputFile,
} from './shared.ts'

type PlaygroundSymbolKind = 'action' | 'component' | 'event' | 'lazy' | 'loader' | 'watch'

interface PlaygroundSymbol {
  code: string
  id: string
  kind: PlaygroundSymbolKind
}

interface PlaygroundAnalyzedModule {
  code: string
  symbols: Iterable<PlaygroundSymbol> | Map<string, PlaygroundSymbol>
}

const SYMBOL_KIND_PRIORITY: Record<PlaygroundSymbolKind, number> = {
  component: 0,
  event: 1,
  lazy: 2,
  watch: 3,
  loader: 4,
  action: 5,
}

const toSymbolArray = (symbols: PlaygroundAnalyzedModule['symbols']) => {
  if (symbols instanceof Map) {
    return [...symbols.values()]
  }

  return [...symbols]
}

const createEntryFile = (
  code: string,
): PlaygroundOutputFile => ({
  code,
  fileName: 'app.js',
  language: 'javascript',
  path: `${PLAYGROUND_DIST_ROOT}/app.js`,
  relativePath: 'app.js',
})

const createSsrFile = (
  code: string,
): PlaygroundOutputFile => ({
  code,
  fileName: 'ssr.js',
  language: 'javascript',
  path: `${PLAYGROUND_DIST_ROOT}/ssr.js`,
  relativePath: 'ssr.js',
})

const createSymbolFile = (symbol: PlaygroundSymbol): PlaygroundOutputFile => {
  const fileName = `symbol__${symbol.id}.js`

  return {
    code: symbol.code,
    fileName,
    language: 'javascript',
    path: `${PLAYGROUND_DIST_ROOT}/entries/${fileName}`,
    relativePath: `entries/${fileName}`,
    symbolKind: symbol.kind,
  }
}

export const createPlaygroundOutputFiles = async (options: {
  analyzed: PlaygroundAnalyzedModule
  compileClient(source: string, id: string): Promise<string> | string
  compileSsr(source: string, id: string): Promise<string> | string
  entryId?: string
}) => {
  const entryId = options.entryId ?? PLAYGROUND_ENTRY_ID
  const sortedSymbols = toSymbolArray(options.analyzed.symbols).sort((left, right) => {
    const priorityDiff = SYMBOL_KIND_PRIORITY[left.kind] - SYMBOL_KIND_PRIORITY[right.kind]
    if (priorityDiff !== 0) {
      return priorityDiff
    }

    return left.id.localeCompare(right.id)
  })

  const files = await Promise.all([
    Promise.resolve(options.compileClient(options.analyzed.code, entryId)).then(createEntryFile),
    Promise.resolve(options.compileSsr(options.analyzed.code, entryId)).then(createSsrFile),
    ...sortedSymbols.map(async (symbol) =>
      createSymbolFile({
        ...symbol,
        code: await options.compileClient(
          symbol.code,
          `${entryId}?${PLAYGROUND_SYMBOL_QUERY}=${symbol.id}`,
        ),
      }),
    ),
  ])

  return files
}
