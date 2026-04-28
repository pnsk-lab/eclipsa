import {
  createServerModuleRunner,
  transformWithOxc,
  type Plugin,
  type PluginOption,
  type ResolvedConfig,
} from 'vite'
import { createDevFetch, shouldInvalidateDevApp } from './dev-app/mod.ts'
import { incomingMessageToRequest, responseForServerResponse } from '../utils/node-connect.ts'
import { createConfig } from './config.ts'
import { resolveEclipsaPluginOptions, type EclipsaPluginOptions } from './options.ts'
import {
  compileModuleForClient,
  compileModuleForSSR,
  inspectResumeHmrUpdate,
  loadSymbolModuleForClient,
  loadSymbolModuleForSSR,
  parseSymbolRequest,
  resolveResumeHmrUpdate,
} from './compiler.ts'
import { RESUME_HMR_EVENT, type ResumeHmrUpdatePayload } from '../core/resume-hmr.ts'

const ECLIPSA_SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])

const stripRequestQuery = (value: string) => value.replace(/[?#].*$/, '')

const isTestLikeSourceRequest = (value: string) =>
  /\.(?:test|spec)\.[^./]+$/.test(stripRequestQuery(value).replaceAll('\\', '/'))

const isAppSourceRequest = (value: string) =>
  /(^|\/)app\//.test(stripRequestQuery(value).replaceAll('\\', '/'))

const isEclipsaSourceRequest = (value: string) => {
  const normalized = stripRequestQuery(value)
  const extensionIndex = normalized.lastIndexOf('.')
  if (extensionIndex < 0) {
    return false
  }
  const extension = normalized.slice(extensionIndex)
  if (!ECLIPSA_SOURCE_EXTENSIONS.has(extension)) {
    return false
  }
  return extension === '.tsx' || isAppSourceRequest(normalized)
}

const isCssRequest = (value: string | undefined) => {
  if (!value) {
    return false
  }
  const normalized = stripRequestQuery(value)
  return normalized.endsWith('.css')
}

const createHotTargetUrl = (root: string, filePath: string) => {
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/$/, '')
  const normalizedFilePath = stripRequestQuery(filePath).replaceAll('\\', '/')
  if (normalizedFilePath.startsWith('/app/')) {
    return normalizedFilePath
  }
  if (
    normalizedFilePath === normalizedRoot ||
    normalizedFilePath.startsWith(`${normalizedRoot}/`)
  ) {
    return `/${normalizedFilePath.slice(normalizedRoot.length + 1)}`
  }
  return `/@fs/${normalizedFilePath}`
}

const preserveCssHotModules = <
  T extends { file?: string; id?: string; type?: string; url?: string },
>(
  modules: T[],
) => modules.filter(isCssHotModule)

const isCssHotModule = <T extends { file?: string; id?: string; type?: string; url?: string }>(
  module: T,
) =>
  module.type === 'css' ||
  isCssRequest(module.id) ||
  isCssRequest(module.url) ||
  isCssRequest(module.file)

const mergeUniqueHotModules = <T extends { file?: string; id?: string; url?: string }>(
  modules: T[],
) => {
  const seen = new Set<string>()
  return modules.filter((module) => {
    const key = module.id ?? module.file ?? module.url
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

interface EclipsaPluginState {
  config?: ResolvedConfig
  pendingSsrUpdates?: Map<string, ResumeHmrUpdatePayload>
}

interface HotModule {
  file?: string
  id?: string
  type?: string
  url: string
}

const collectCssHotModules = (
  pluginContext: PluginContextWithEnvironment,
  options: HotUpdateContext,
) =>
  mergeUniqueHotModules([
    ...preserveCssHotModules(options.modules),
    ...preserveCssHotModules([
      ...(pluginContext.environment.moduleGraph?.idToModuleMap?.values() ?? []),
    ]),
  ])

const sendSsrHotEvent = (
  pluginContext: PluginContextWithEnvironment,
  options: HotUpdateContext,
  event: string,
  payload?: unknown,
) => {
  if (options.server?.ws) {
    options.server.ws.send(event, payload)
    return
  }
  pluginContext.environment.hot.send(event, payload)
}

const hasClientHotModuleForFile = (options: HotUpdateContext) => {
  const clientModules = options.server?.environments?.client?.moduleGraph?.getModulesByFile(
    options.file,
  )
  if (!clientModules) {
    return false
  }
  for (const _module of clientModules) {
    return true
  }
  return false
}

const selectSourceHotModule = (
  pluginContext: PluginContextWithEnvironment,
  options: HotUpdateContext,
) =>
  options.modules.find((module) => !isCssHotModule(module)) ??
  [...(pluginContext.environment.moduleGraph?.getModulesByFile(options.file) ?? [])].find(
    (module) => !isCssHotModule(module),
  )

const shouldForceFullReloadForWatcherEvent = (
  filePath: string,
  event: 'add' | 'change' | 'unlink',
) => event !== 'change' && isEclipsaSourceRequest(filePath) && !isTestLikeSourceRequest(filePath)

const handleHotUpdate = async (
  state: EclipsaPluginState,
  pluginContext: PluginContextWithEnvironment,
  options: HotUpdateContext,
) => {
  const config = state.config
  if (!config || !isEclipsaSourceRequest(options.file) || isTestLikeSourceRequest(options.file)) {
    return
  }
  const source = await options.read()
  if (pluginContext.environment.name !== 'client') {
    const resumableUpdate = await inspectResumeHmrUpdate({
      filePath: options.file,
      root: config.root,
      source,
    })
    if (resumableUpdate.isResumable) {
      if (resumableUpdate.update) {
        if (hasClientHotModuleForFile(options)) {
          return collectCssHotModules(pluginContext, options)
        }
        const pendingSsrUpdate = state.pendingSsrUpdates?.get(options.file)
        if (
          pendingSsrUpdate &&
          !pendingSsrUpdate.fullReload &&
          resumableUpdate.update.fullReload &&
          pendingSsrUpdate.fileUrl === resumableUpdate.update.fileUrl
        ) {
          return collectCssHotModules(pluginContext, options)
        }
        state.pendingSsrUpdates ??= new Map()
        state.pendingSsrUpdates.set(options.file, resumableUpdate.update)
        sendSsrHotEvent(pluginContext, options, RESUME_HMR_EVENT, resumableUpdate.update)
      }
      return collectCssHotModules(pluginContext, options)
    }
    return
  }
  const resumableUpdate = await resolveResumeHmrUpdate({
    filePath: options.file,
    root: config.root,
    source,
  })
  if (resumableUpdate.isResumable) {
    const pendingSsrUpdate = state.pendingSsrUpdates?.get(options.file)
    if (pendingSsrUpdate) {
      state.pendingSsrUpdates?.delete(options.file)
    } else if (resumableUpdate.update) {
      pluginContext.environment.hot.send(RESUME_HMR_EVENT, resumableUpdate.update)
    }
    return collectCssHotModules(pluginContext, options)
  }

  const module = selectSourceHotModule(pluginContext, options)
  pluginContext.environment.hot.send('update-client', {
    url: module?.url ?? createHotTargetUrl(config.root, options.file),
  })
  return collectCssHotModules(pluginContext, options)
}

interface PluginContextWithEnvironment {
  environment: {
    hot: {
      send(event: string, payload?: unknown): void
    }
    moduleGraph?: {
      idToModuleMap?: Map<string, HotModule>
      getModulesByFile(file: string): Iterable<{ url: string }> | undefined
    }
    name: string
  }
}

interface HotUpdateContext {
  file: string
  modules: HotModule[]
  read(): Promise<string> | string
  server?: {
    environments?: {
      client?: {
        moduleGraph?: {
          getModulesByFile(file: string): Iterable<{ url: string }> | undefined
        }
      }
    }
    ws?: {
      send(event: string, payload?: unknown): void
    }
  }
}

const eclipsaCore = (state: EclipsaPluginState, options: EclipsaPluginOptions = {}): Plugin => {
  return {
    enforce: 'pre',
    name: 'vite-plugin-eclipsa',
    config: createConfig(resolveEclipsaPluginOptions(options)),
    configResolved(resolvedConfig) {
      state.config = resolvedConfig
    },
    configureServer(server) {
      const config = state.config
      if (!config) {
        throw new Error('Resolved Vite config is unavailable during configureServer().')
      }
      const ssrEnv = server.environments.ssr
      const runner = createServerModuleRunner(ssrEnv, {
        hmr: false,
      })
      const devApp = createDevFetch({
        resolvedConfig: config,
        devServer: server,
        runner,
        ssrEnv,
      })
      void devApp.installWebSocket().catch((error) => {
        console.error(error)
      })
      const invalidateDevApp = (filePath: string, event: 'add' | 'change' | 'unlink') => {
        if (shouldInvalidateDevApp(config.root, filePath, event)) {
          devApp.invalidate()
          void devApp.installWebSocket().catch((error) => {
            console.error(error)
          })
        }
        if (shouldForceFullReloadForWatcherEvent(filePath, event)) {
          server.ws.send({
            path: '*',
            type: 'full-reload',
          } as any)
        }
      }

      server.watcher.on('add', (filePath) => {
        invalidateDevApp(filePath, 'add')
      })
      server.watcher.on('change', (filePath) => {
        invalidateDevApp(filePath, 'change')
      })
      server.watcher.on('unlink', (filePath) => {
        invalidateDevApp(filePath, 'unlink')
      })

      server.middlewares.use(async (req, res, next) => {
        const webReq = incomingMessageToRequest(req)
        const webRes = await devApp.fetch(webReq)
        if (webRes) {
          responseForServerResponse(webRes, res)
          return
        }
        next()
      })
    },
    async load(id) {
      if (!parseSymbolRequest(id)) {
        return null
      }
      return this.environment.name === 'client'
        ? loadSymbolModuleForClient(id)
        : loadSymbolModuleForSSR(id)
    },
    async transform(code, id) {
      if (!isEclipsaSourceRequest(id) || parseSymbolRequest(id)) {
        return
      }
      const config = state.config
      if (!config) {
        throw new Error('Resolved Vite config is unavailable during transform().')
      }
      if (isTestLikeSourceRequest(id)) {
        return transformWithOxc(code, id, {
          jsx: {
            development: !config.isProduction,
            importSource: 'eclipsa',
            runtime: 'automatic',
          },
        })
      }
      const isClient = this.environment.name === 'client'
      return {
        code: isClient
          ? await compileModuleForClient(code, id, {
              hmr: !config.isProduction,
            })
          : await compileModuleForSSR(code, id),
      }
    },
  }
}

const eclipsaHot = (state: EclipsaPluginState): Plugin => ({
  enforce: 'post',
  name: 'vite-plugin-eclipsa:hmr',
  async hotUpdate(options) {
    return handleHotUpdate(
      state,
      this as PluginContextWithEnvironment,
      options as unknown as HotUpdateContext,
    ) as any
  },
})

export type { EclipsaPluginOptions } from './options.ts'

export const eclipsa = (options?: EclipsaPluginOptions): PluginOption => {
  const state: EclipsaPluginState = {}
  return [eclipsaCore(state, options), eclipsaHot(state)]
}
