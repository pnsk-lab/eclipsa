import * as fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import type { Plugin, PluginOption, ResolvedConfig, ViteDevServer } from 'vite'
import { createContentSearch } from './internal.ts'
import { generateContentSearchRuntimeModule, resolveContentSearchOptions } from './search.ts'
import type { ResolvedContentSearchOptions } from './types.ts'

const DEV_APP_INVALIDATORS_KEY = Symbol.for('eclipsa.dev-app-invalidators')
const CONTENT_HMR_EVENT = 'eclipsa:content-update'
const VIRTUAL_RUNTIME_ID = 'virtual:eclipsa-content:runtime'
const RESOLVED_VIRTUAL_RUNTIME_ID = '\0eclipsa-content:runtime'
const VIRTUAL_SEARCH_ID = 'virtual:eclipsa-content:search'
const RESOLVED_VIRTUAL_SEARCH_ID = '\0eclipsa-content:search'
const CONTENT_CONFIG_PATH = 'app/content.config.ts'
const CONTENT_COLLECTION_MARKER = '__eclipsa_content_collection__'
const CONTENT_SEARCH_ASSET = '__eclipsa_content_search__.json'

const normalizeSlashes = (value: string) => value.replaceAll('\\', '/')
const stripQuery = (id: string) => id.split('?', 1)[0] ?? id

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const getConfigPath = (root: string) => path.join(root, CONTENT_CONFIG_PATH)
const getSearchAssetPath = (base: string) => {
  const normalizedBase = base === '' ? '/' : base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}${CONTENT_SEARCH_ASSET}`
}
const isContentConfigId = (root: string, id: string) =>
  normalizeSlashes(path.resolve(stripQuery(id))) === normalizeSlashes(getConfigPath(root))

const getNamedCollectionExports = (source: string) =>
  [...source.matchAll(/^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=/gm)].map((match) => match[1]!)

const invalidateVirtualRuntime = (server: ViteDevServer) => {
  const graphs = [
    (server as ViteDevServer & { moduleGraph?: any }).moduleGraph,
    ...Object.values(
      (server as ViteDevServer & { environments?: Record<string, { moduleGraph?: any }> })
        .environments ?? {},
    ).map((environment) => environment.moduleGraph),
  ]
  for (const graph of graphs) {
    if (!graph) {
      continue
    }
    for (const id of [
      VIRTUAL_RUNTIME_ID,
      RESOLVED_VIRTUAL_RUNTIME_ID,
      VIRTUAL_SEARCH_ID,
      RESOLVED_VIRTUAL_SEARCH_ID,
    ]) {
      const mod = graph.getModuleById?.(id)
      if (mod) {
        graph.invalidateModule?.(mod)
      }
    }
  }
}

const invalidateRegisteredDevApps = (server: ViteDevServer) => {
  const invalidators = (
    server as ViteDevServer & {
      [DEV_APP_INVALIDATORS_KEY]?: Set<() => void>
    }
  )[DEV_APP_INVALIDATORS_KEY]
  if (!invalidators) {
    return
  }
  for (const invalidate of invalidators) {
    invalidate()
  }
}

const shouldInvalidateForFile = (root: string, filePath: string) => {
  const normalizedFilePath = normalizeSlashes(path.resolve(filePath))
  const normalizedRoot = normalizeSlashes(path.resolve(root))
  if (!normalizedFilePath.startsWith(normalizedRoot)) {
    return false
  }
  if (normalizedFilePath === normalizeSlashes(path.join(root, CONTENT_CONFIG_PATH))) {
    return true
  }
  return normalizedFilePath.endsWith('.md')
}

const createMissingRuntimeModule = (root: string) => {
  const message = `Missing ${CONTENT_CONFIG_PATH} in ${root}.`
  return `
const error = new Error(${JSON.stringify(message)});
export const getCollection = async () => { throw error; };
export const getEntries = async () => { throw error; };
export const getEntry = async () => { throw error; };
export const render = async () => { throw error; };
`
}

const createClientRuntimeModule = () => `
const error = new Error("@eclipsa/content query APIs are server-only.");
export const getCollection = async () => { throw error; };
export const getEntries = async () => { throw error; };
export const getEntry = async () => { throw error; };
export const render = async () => { throw error; };
`

const createDisabledSearchModule = () => `
export const searchOptions = ${JSON.stringify(resolveContentSearchOptions(false))};
export const search = async () => [];
export default { search, searchOptions };
`

const createClientContentConfigModule = async (configPath: string) => {
  const source = await fs.readFile(configPath, 'utf8')
  const exportNames = getNamedCollectionExports(source)
  if (exportNames.length === 0) {
    return ''
  }
  return exportNames
    .map(
      (name) =>
        `export const ${name} = Object.freeze({ ${JSON.stringify(CONTENT_COLLECTION_MARKER)}: true });`,
    )
    .join('\n')
}

const createRuntimeModule = (root: string, configPath: string) => `
import * as collectionsModule from ${JSON.stringify(normalizeSlashes(configPath))};
import { createContentRuntime } from '@eclipsa/content/internal';

const runtime = createContentRuntime({
  collectionsModule,
  configPath: ${JSON.stringify(normalizeSlashes(configPath))},
  root: ${JSON.stringify(normalizeSlashes(root))},
});

export const getCollection = runtime.getCollection;
export const getEntries = runtime.getEntries;
export const getEntry = runtime.getEntry;
export const render = runtime.render;
`

const loadCollectionsModule = async (configPath: string) => {
  const href = pathToFileURL(configPath).href
  return import(`${href}?t=${Date.now()}`)
}

const handleInvalidation = (server: ViteDevServer, root: string, filePath: string) => {
  if (!shouldInvalidateForFile(root, filePath)) {
    return false
  }
  invalidateVirtualRuntime(server)
  invalidateRegisteredDevApps(server)
  ;(
    server as ViteDevServer & { ws?: { send?: (event: string, payload?: unknown) => void } }
  ).ws?.send?.(CONTENT_HMR_EVENT)
  return true
}

const contentPlugin = (): Plugin => {
  let config: ResolvedConfig
  let searchStatePromise: Promise<{
    indexJson: string
    options: ResolvedContentSearchOptions
  } | null> | null = null

  const resolveSearchState = async () => {
    if (searchStatePromise) {
      return searchStatePromise
    }
    searchStatePromise = (async () => {
      const configPath = getConfigPath(config.root)
      if (!(await fileExists(configPath))) {
        return null
      }
      const collectionsModule = await loadCollectionsModule(configPath)
      const result = await createContentSearch({
        base: config.base,
        collectionsModule,
        configPath,
        root: config.root,
      })
      if (!result.options.enabled || result.index.documents.length === 0) {
        return null
      }
      return {
        indexJson: JSON.stringify(result.index),
        options: result.options,
      }
    })()
    return searchStatePromise
  }

  return {
    enforce: 'pre',
    name: 'vite-plugin-eclipsa-content',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    configureServer(server) {
      const searchPath = getSearchAssetPath(config.base)
      server.middlewares.use(async (req, res, next) => {
        const requestPath = req.url?.split('?', 1)[0] ?? ''
        if (requestPath !== searchPath) {
          next()
          return
        }
        const state = await resolveSearchState()
        if (!state) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(state.indexJson)
      })
    },
    hotUpdate(options) {
      searchStatePromise = null
      if (handleInvalidation(options.server, config.root, options.file)) {
        return []
      }
    },
    resolveId(id) {
      if (id === VIRTUAL_RUNTIME_ID) {
        return RESOLVED_VIRTUAL_RUNTIME_ID
      }
      if (id === VIRTUAL_SEARCH_ID) {
        return RESOLVED_VIRTUAL_SEARCH_ID
      }
      return null
    },
    async load(id) {
      if (id === RESOLVED_VIRTUAL_SEARCH_ID) {
        const state = await resolveSearchState()
        if (!state) {
          return createDisabledSearchModule()
        }
        return generateContentSearchRuntimeModule(getSearchAssetPath(config.base), state.options)
      }
      if (id !== RESOLVED_VIRTUAL_RUNTIME_ID) {
        if (this.environment?.name === 'client' && isContentConfigId(config.root, id)) {
          return createClientContentConfigModule(getConfigPath(config.root))
        }
        return null
      }
      if (this.environment?.name === 'client') {
        return createClientRuntimeModule()
      }
      const configPath = getConfigPath(config.root)
      if (!(await fileExists(configPath))) {
        return createMissingRuntimeModule(config.root)
      }
      return createRuntimeModule(config.root, configPath)
    },
    async generateBundle() {
      const state = await resolveSearchState()
      if (!state) {
        return
      }
      this.emitFile({
        fileName: CONTENT_SEARCH_ASSET,
        source: state.indexJson,
        type: 'asset',
      })
    },
  }
}

export const eclipsaContent = (): PluginOption => [contentPlugin()]
