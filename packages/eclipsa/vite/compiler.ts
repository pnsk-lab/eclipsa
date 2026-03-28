import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import fg from 'fast-glob'
import ts from 'typescript'
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
  previous: {
    analyzed: AnalyzedModule
    source: string
  } | null
  source: string
}

interface ResumeHmrResolution {
  isResumable: boolean
  nextEntry: AnalyzedEntry
  normalizedId: string
  update: ResumeHmrUpdatePayload | null
}

const cache = new Map<string, AnalyzedEntry>()
const servedSources = new Map<string, string>()

export const resetCompilerCache = () => {
  cache.clear()
  servedSources.clear()
}

export const primeCompilerCache = async (filePath: string, source?: string) => {
  const normalizedPath = stripQuery(filePath)
  const normalizedId = normalizeCompilerModuleId(normalizedPath)
  const resolvedSource = source ?? (await fs.readFile(normalizedPath, 'utf8'))
  servedSources.set(normalizedId, resolvedSource)
  await loadAnalyzedModule(normalizedPath, resolvedSource)
}

const stripQuery = (id: string) => {
  const queryIndex = id.indexOf('?')
  if (queryIndex < 0) {
    return id
  }
  return id.slice(0, queryIndex)
}

const normalizeCompilerModuleId = (id: string) => {
  const normalized = stripQuery(id).replaceAll('\\', '/')
  if (normalized.startsWith('/app/')) {
    return normalized
  }
  const appIndex = normalized.lastIndexOf('/app/')
  if (appIndex >= 0) {
    return normalized.slice(appIndex)
  }
  return normalized
}

const isAppModuleId = (id: string) => normalizeCompilerModuleId(id).startsWith('/app/')

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
  const normalizedId = normalizeCompilerModuleId(normalizedPath)
  const cached = cache.get(normalizedId)
  if (source == null && cached && isAppModuleId(normalizedPath)) {
    return cached.analyzed
  }

  const resolvedSource = source ?? (await fs.readFile(normalizedPath, 'utf8'))
  if (cached?.source === resolvedSource) {
    return cached.analyzed
  }

  const analyzed = await analyzeModule(resolvedSource, normalizedId)
  if (!analyzed) {
    throw new Error(`Failed to compile ${normalizedId}.`)
  }

  const entry = {
    analyzed,
    previous: cached
      ? {
          analyzed: cached.analyzed,
          source: cached.source,
        }
      : null,
    source: resolvedSource,
  } satisfies AnalyzedEntry
  cache.set(normalizedId, entry)

  return entry.analyzed
}

const createAnalyzedEntry = async (filePath: string, source: string): Promise<AnalyzedEntry> => {
  const analyzed = await analyzeModule(source, normalizeCompilerModuleId(filePath))
  if (!analyzed) {
    throw new Error(`Failed to compile ${filePath}.`)
  }

  return {
    analyzed,
    previous: null,
    source,
  }
}

const findCachedAnalyzedModuleBySymbolId = (symbolId: string) => {
  for (const entry of cache.values()) {
    if (entry.analyzed.symbols.has(symbolId)) {
      return entry.analyzed
    }
  }
  return null
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

const createDevSourceUrl = (root: string, filePath: string) => {
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/$/, '')
  const normalizedFilePath = filePath.replaceAll('\\', '/')
  if (normalizedFilePath.startsWith('/app/')) {
    return normalizedFilePath
  }
  if (
    normalizedFilePath === normalizedRoot ||
    normalizedFilePath.startsWith(`${normalizedRoot}/`)
  ) {
    return `/${path.relative(root, filePath).replaceAll('\\', '/')}`
  }
  return `/@fs/${normalizedFilePath}`
}

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
  const fileUrl = createDevSourceUrl(root, filePath)
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
  const resolution = await inspectResumeHmrUpdate(options)
  cache.set(resolution.normalizedId, resolution.nextEntry)
  return {
    isResumable: resolution.isResumable,
    update: resolution.update,
  }
}

export const inspectResumeHmrUpdate = async (options: {
  filePath: string
  root: string
  source: string
}): Promise<ResumeHmrResolution> => {
  const normalizedPath = stripQuery(options.filePath)
  const normalizedId = normalizeCompilerModuleId(normalizedPath)
  const cached = cache.get(normalizedId)
  let nextEntry: AnalyzedEntry
  if (cached?.source === options.source) {
    nextEntry = cached
  } else {
    const createdEntry = await createAnalyzedEntry(normalizedPath, options.source)
    nextEntry = {
      ...createdEntry,
      previous: cached
        ? {
            analyzed: cached.analyzed,
            source: cached.source,
          }
        : null,
    }
  }
  let previous =
    cached?.source === options.source
      ? nextEntry.previous?.analyzed ?? null
      : cached?.analyzed ?? null
  if (!previous) {
    const servedSource = servedSources.get(normalizedId)
    if (servedSource && servedSource !== options.source) {
      const previousEntry = await createAnalyzedEntry(normalizedPath, servedSource)
      previous = previousEntry.analyzed
      if (!nextEntry.previous) {
        nextEntry = {
          ...nextEntry,
          previous: {
            analyzed: previousEntry.analyzed,
            source: servedSource,
          },
        }
      }
    }
  }
  const update = createResumeHmrUpdate({
    filePath: normalizedPath,
    next: nextEntry.analyzed,
    previous,
    root: options.root,
  })
  servedSources.set(normalizedId, nextEntry.source)
  return {
    isResumable: (previous?.symbols.size ?? 0) > 0 || nextEntry.analyzed.symbols.size > 0,
    nextEntry,
    normalizedId,
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

  let currentAnalyzed = findCachedAnalyzedModuleBySymbolId(parsed.symbolId)
  try {
    const currentSource = await fs.readFile(stripQuery(parsed.filePath), 'utf8')
    currentAnalyzed = await loadAnalyzedModule(parsed.filePath, currentSource)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      throw error
    }
    currentAnalyzed ??= await loadAnalyzedModule(parsed.filePath)
  }
  const analyzed = currentAnalyzed.symbols.has(parsed.symbolId)
    ? currentAnalyzed
    : findCachedAnalyzedModuleBySymbolId(parsed.symbolId) ?? currentAnalyzed
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

  let currentAnalyzed = findCachedAnalyzedModuleBySymbolId(parsed.symbolId)
  try {
    const currentSource = await fs.readFile(stripQuery(parsed.filePath), 'utf8')
    currentAnalyzed = await loadAnalyzedModule(parsed.filePath, currentSource)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      throw error
    }
    currentAnalyzed ??= await loadAnalyzedModule(parsed.filePath)
  }
  const analyzed = currentAnalyzed.symbols.has(parsed.symbolId)
    ? currentAnalyzed
    : findCachedAnalyzedModuleBySymbolId(parsed.symbolId) ?? currentAnalyzed
  const symbol = analyzed.symbols.get(parsed.symbolId)
  if (!symbol) {
    throw new Error(`Unknown resume symbol ${parsed.symbolId} for ${parsed.filePath}.`)
  }

  return compileSSRModule(symbol.code, `${parsed.filePath}?${SYMBOL_QUERY}=${parsed.symbolId}`)
}

export const createDevSymbolUrl = (root: string, filePath: string, symbolId: string) =>
  `${createDevSourceUrl(root, filePath)}?${SYMBOL_QUERY}=${symbolId}`

export const createBuildSymbolUrl = (symbolId: string) => `/entries/symbol__${symbolId}.js`

export const createBuildServerActionUrl = (actionId: string) =>
  `../ssr/entries/action__${actionId}.mjs`

export const createBuildServerLoaderUrl = (loaderId: string) =>
  `../ssr/entries/loader__${loaderId}.mjs`

const ANALYZABLE_SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])

const ANALYZABLE_APP_GLOB = '**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}'

const moduleResolutionOptions: ts.CompilerOptions = {
  allowImportingTsExtensions: true,
  jsx: ts.JsxEmit.Preserve,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  resolvePackageJsonExports: true,
  resolvePackageJsonImports: true,
  target: ts.ScriptTarget.ESNext,
}

const moduleResolutionHost = ts.createCompilerHost(moduleResolutionOptions, true)

const isAnalyzableSourceFile = (filePath: string) => {
  const ext = path.extname(filePath)
  return ANALYZABLE_SOURCE_EXTENSIONS.has(ext) && !filePath.endsWith('.d.ts')
}

const resolveImportedModule = (specifier: string, containingFile: string) =>
  ts.resolveModuleName(
    specifier,
    containingFile,
    moduleResolutionOptions,
    moduleResolutionHost,
  ).resolvedModule?.resolvedFileName ?? null

export const collectAppSymbols = async (root: string): Promise<ResumeSymbol[]> => {
  const appDir = path.join(root, 'app')
  const entryFiles = await fg(path.join(appDir, ANALYZABLE_APP_GLOB).replaceAll('\\', '/'))
  const entryFileSet = new Set(entryFiles)
  const pending = [...entryFiles]
  const visited = new Set<string>()
  const symbols = new Map<string, ResumeSymbol>()

  while (pending.length > 0) {
    const next = pending.pop()
    if (!next) {
      continue
    }

    const filePath = stripQuery(next)
    if (visited.has(filePath) || !isAnalyzableSourceFile(filePath)) {
      continue
    }
    visited.add(filePath)

    let source: string
    try {
      source = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      if (entryFileSet.has(filePath)) {
        throw error
      }
      continue
    }

    let analyzed: Awaited<ReturnType<typeof loadAnalyzedModule>>
    try {
      analyzed = await loadAnalyzedModule(filePath, source)
    } catch (error) {
      if (entryFileSet.has(filePath)) {
        throw error
      }
      continue
    }
    for (const symbol of analyzed.symbols.values()) {
      symbols.set(symbol.id, symbol)
    }

    const imports = ts.preProcessFile(source, true, true).importedFiles
    for (const imported of imports) {
      const resolvedFilePath = resolveImportedModule(imported.fileName, filePath)
      if (!resolvedFilePath || !isAnalyzableSourceFile(resolvedFilePath)) {
        continue
      }
      pending.push(resolvedFilePath)
    }
  }

  return [...symbols.values()]
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
