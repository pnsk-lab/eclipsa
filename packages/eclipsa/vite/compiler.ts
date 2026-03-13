import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import fg from 'fast-glob'
import {
  analyzeModule,
  compileClientModule,
  compileSSRModule,
  type AnalyzedModule,
  type ResumeHmrComponentEntry,
  type ResumeHmrSymbolEntry,
  type ResumeSymbol,
} from '../compiler/mod.ts'
import type { ResumeHmrUpdatePayload } from '../core/resume-hmr.ts'

const SYMBOL_QUERY = 'eclipsa-symbol'

interface AnalyzedEntry {
  analyzed: AnalyzedModule
  source: string
}

const cache = new Map<string, AnalyzedEntry>()

const stripQuery = (id: string) => {
  const queryIndex = id.indexOf('?')
  if (queryIndex < 0) {
    return id
  }
  return id.slice(0, queryIndex)
}

export const parseSymbolRequest = (id: string): { filePath: string; symbolId: string } | null => {
  const queryIndex = id.indexOf('?')
  if (queryIndex < 0) {
    return null
  }

  const params = new URLSearchParams(id.slice(queryIndex + 1))
  const symbolId = params.get(SYMBOL_QUERY)
  if (!symbolId) {
    return null
  }

  return {
    filePath: id.slice(0, queryIndex),
    symbolId,
  }
}

const loadAnalyzedModule = async (filePath: string, source?: string) => {
  const normalizedPath = stripQuery(filePath)
  const resolvedSource = source ?? (await fs.readFile(normalizedPath, 'utf8'))
  const cached = cache.get(normalizedPath)
  if (cached?.source === resolvedSource) {
    return cached.analyzed
  }

  const analyzed = await analyzeModule(resolvedSource, normalizedPath)
  if (!analyzed) {
    throw new Error(`Failed to compile ${normalizedPath}.`)
  }

  cache.set(normalizedPath, {
    analyzed,
    source: resolvedSource,
  })

  return analyzed
}

const createAnalyzedEntry = async (filePath: string, source: string): Promise<AnalyzedEntry> => {
  const analyzed = await analyzeModule(source, filePath)
  if (!analyzed) {
    throw new Error(`Failed to compile ${filePath}.`)
  }

  return {
    analyzed,
    source,
  }
}

const getComponentEntryById = (components: Map<string, ResumeHmrComponentEntry>, id: string) => {
  for (const component of components.values()) {
    if (component.id === id) {
      return component
    }
  }
  return null
}

const sameStrings = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

const findOwnerComponentForSymbol = (
  oldSymbol: ResumeHmrSymbolEntry,
  components: Map<string, ResumeHmrComponentEntry>,
) => {
  if (oldSymbol.ownerComponentKey) {
    return components.get(oldSymbol.ownerComponentKey) ?? null
  }
  if (oldSymbol.kind === 'component') {
    return getComponentEntryById(components, oldSymbol.id)
  }
  return null
}

export const createResumeHmrUpdate = (options: {
  filePath: string
  next: AnalyzedModule
  previous: AnalyzedModule | null
  root: string
}): ResumeHmrUpdatePayload | null => {
  const { filePath, next, previous, root } = options
  const fileUrl = `/${path.relative(root, filePath).replaceAll('\\', '/')}`
  if (!previous) {
    return next.symbols.size > 0
      ? {
          fileUrl,
          fullReload: true,
          rerenderComponentSymbols: [],
          rerenderOwnerSymbols: [],
          symbolUrlReplacements: {},
        }
      : null
  }
  if (previous.symbols.size === 0 && next.symbols.size === 0) {
    return null
  }

  const previousManifest = previous.hmrManifest
  const nextManifest = next.hmrManifest
  const rerenderComponentSymbols = new Set<string>()
  const rerenderOwnerSymbols = new Set<string>()
  const symbolUrlReplacements: Record<string, string> = {}
  let fullReload = previous.symbols.size > 0 && next.symbols.size === 0

  const markOwnerRerender = (symbol: ResumeHmrSymbolEntry) => {
    const owner = findOwnerComponentForSymbol(symbol, previousManifest.components)
    if (!owner) {
      fullReload = true
      return
    }
    rerenderOwnerSymbols.add(owner.id)
  }

  if (previousManifest.components.size !== nextManifest.components.size) {
    fullReload = true
  }

  for (const [hmrKey, previousComponent] of previousManifest.components) {
    const nextComponent = nextManifest.components.get(hmrKey)
    if (!nextComponent) {
      fullReload = true
      continue
    }
    if (!sameStrings(previousComponent.localSymbolKeys, nextComponent.localSymbolKeys)) {
      rerenderOwnerSymbols.add(previousComponent.id)
    }
    if (!sameStrings(previousComponent.captures, nextComponent.captures)) {
      rerenderOwnerSymbols.add(previousComponent.id)
    }
  }

  for (const [hmrKey, nextComponent] of nextManifest.components) {
    if (!previousManifest.components.has(hmrKey)) {
      fullReload = true
      if (nextComponent.id) {
        continue
      }
    }
  }

  for (const [hmrKey, previousSymbol] of previousManifest.symbols) {
    const nextSymbol = nextManifest.symbols.get(hmrKey)
    if (!nextSymbol || nextSymbol.kind !== previousSymbol.kind) {
      if (previousSymbol.kind === 'component') {
        fullReload = true
      } else {
        markOwnerRerender(previousSymbol)
      }
      continue
    }

    if (previousSymbol.id !== nextSymbol.id) {
      symbolUrlReplacements[previousSymbol.id] = createDevSymbolUrl(root, filePath, nextSymbol.id)
    }

    if (!sameStrings(previousSymbol.captures, nextSymbol.captures)) {
      markOwnerRerender(previousSymbol)
      continue
    }

    if (previousSymbol.kind === 'component') {
      if (previousSymbol.signature !== nextSymbol.signature) {
        rerenderComponentSymbols.add(previousSymbol.id)
      }
      continue
    }

    if (previousSymbol.signature === nextSymbol.signature) {
      continue
    }

    if (previousSymbol.kind === 'watch') {
      markOwnerRerender(previousSymbol)
    }
  }

  for (const [hmrKey, nextSymbol] of nextManifest.symbols) {
    if (previousManifest.symbols.has(hmrKey)) {
      continue
    }
    if (nextSymbol.kind === 'component') {
      fullReload = true
      continue
    }
    symbolUrlReplacements[nextSymbol.id] = createDevSymbolUrl(root, filePath, nextSymbol.id)
    const owner = nextSymbol.ownerComponentKey
      ? previousManifest.components.get(nextSymbol.ownerComponentKey)
      : null
    if (!owner) {
      fullReload = true
      continue
    }
    rerenderOwnerSymbols.add(owner.id)
  }

  if (fullReload) {
    return {
      fileUrl,
      fullReload: true,
      rerenderComponentSymbols: [],
      rerenderOwnerSymbols: [],
      symbolUrlReplacements: {},
    }
  }

  for (const ownerSymbol of rerenderOwnerSymbols) {
    rerenderComponentSymbols.delete(ownerSymbol)
  }

  if (
    rerenderComponentSymbols.size === 0 &&
    rerenderOwnerSymbols.size === 0 &&
    Object.keys(symbolUrlReplacements).length === 0
  ) {
    return {
      fileUrl,
      fullReload: false,
      rerenderComponentSymbols: [],
      rerenderOwnerSymbols: [],
      symbolUrlReplacements: {},
    }
  }

  return {
    fileUrl,
    fullReload: false,
    rerenderComponentSymbols: [...rerenderComponentSymbols],
    rerenderOwnerSymbols: [...rerenderOwnerSymbols],
    symbolUrlReplacements,
  }
}

export const resolveResumeHmrUpdate = async (options: {
  filePath: string
  root: string
  source: string
}): Promise<{
  isResumable: boolean
  update: ResumeHmrUpdatePayload | null
}> => {
  const normalizedPath = stripQuery(options.filePath)
  const previous = cache.get(normalizedPath)?.analyzed ?? null
  const nextEntry = await createAnalyzedEntry(normalizedPath, options.source)
  const update = createResumeHmrUpdate({
    filePath: normalizedPath,
    next: nextEntry.analyzed,
    previous,
    root: options.root,
  })
  cache.set(normalizedPath, nextEntry)
  return {
    isResumable: (previous?.symbols.size ?? 0) > 0 || nextEntry.analyzed.symbols.size > 0,
    update,
  }
}

export const compileModuleForClient = async (
  source: string,
  id: string,
  options?: {
    hmr?: boolean
  },
) => {
  const filePath = stripQuery(id)
  const analyzed = await loadAnalyzedModule(filePath, source)
  return compileClientModule(analyzed.code, filePath, {
    hmr: options?.hmr ?? false,
  })
}

export const compileModuleForSSR = async (source: string, id: string) => {
  const filePath = stripQuery(id)
  const analyzed = await loadAnalyzedModule(filePath, source)
  return compileSSRModule(analyzed.code, filePath)
}

export const loadSymbolModuleForClient = async (id: string) => {
  const parsed = parseSymbolRequest(id)
  if (!parsed) {
    return null
  }

  const analyzed = await loadAnalyzedModule(parsed.filePath)
  const symbol = analyzed.symbols.get(parsed.symbolId)
  if (!symbol) {
    throw new Error(`Unknown resume symbol ${parsed.symbolId} for ${parsed.filePath}.`)
  }

  return compileClientModule(symbol.code, `${parsed.filePath}?${SYMBOL_QUERY}=${parsed.symbolId}`, {
    hmr: false,
  })
}

export const loadSymbolModuleForSSR = async (id: string) => {
  const parsed = parseSymbolRequest(id)
  if (!parsed) {
    return null
  }

  const analyzed = await loadAnalyzedModule(parsed.filePath)
  const symbol = analyzed.symbols.get(parsed.symbolId)
  if (!symbol) {
    throw new Error(`Unknown resume symbol ${parsed.symbolId} for ${parsed.filePath}.`)
  }

  return compileSSRModule(symbol.code, `${parsed.filePath}?${SYMBOL_QUERY}=${parsed.symbolId}`)
}

export const createDevSymbolUrl = (root: string, filePath: string, symbolId: string) =>
  `/${path.relative(root, filePath).replaceAll('\\', '/')}?${SYMBOL_QUERY}=${symbolId}`

export const createBuildSymbolUrl = (symbolId: string) => `/entries/symbol__${symbolId}.js`

export const createBuildServerActionUrl = (actionId: string) => `../ssr/entries/action__${actionId}.mjs`

export const createBuildServerLoaderUrl = (loaderId: string) => `../ssr/entries/loader__${loaderId}.mjs`

export const collectAppSymbols = async (root: string): Promise<ResumeSymbol[]> => {
  const appDir = path.join(root, 'app')
  const files = await fg(path.join(appDir, '**/*.tsx').replaceAll('\\', '/'))
  const result: ResumeSymbol[] = []

  for (const filePath of files) {
    const analyzed = await loadAnalyzedModule(filePath)
    result.push(...analyzed.symbols.values())
  }

  return result
}

export const collectAppActions = async (
  root: string,
): Promise<Array<{ filePath: string; id: string }>> => {
  const appDir = path.join(root, 'app')
  const files = await fg(path.join(appDir, '**/*.{ts,tsx}').replaceAll('\\', '/'))
  const result: Array<{ filePath: string; id: string }> = []

  for (const filePath of files) {
    const analyzed = await loadAnalyzedModule(filePath)
    result.push(...analyzed.actions.values())
  }

  return result
}

export const collectAppLoaders = async (
  root: string,
): Promise<Array<{ filePath: string; id: string }>> => {
  const appDir = path.join(root, 'app')
  const files = await fg(path.join(appDir, '**/*.{ts,tsx}').replaceAll('\\', '/'))
  const result: Array<{ filePath: string; id: string }> = []

  for (const filePath of files) {
    const analyzed = await loadAnalyzedModule(filePath)
    result.push(...analyzed.loaders.values())
  }

  return result
}
