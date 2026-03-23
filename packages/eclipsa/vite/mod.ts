import {
  createServerModuleRunner,
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

const isCssRequest = (value: string | undefined) => {
  if (!value) {
    return false
  }
  const normalized = value.replace(/[#?].*$/, '')
  return normalized.endsWith('.css')
}

const preserveCssHotModules = <
  T extends { file?: string; id?: string; type?: string; url?: string },
>(
  modules: T[],
) =>
  modules.filter(
    (module) =>
      module.type === 'css' ||
      isCssRequest(module.id) ||
      isCssRequest(module.url) ||
      isCssRequest(module.file),
  )

const mergeUniqueHotModules = <T extends { file?: string; id?: string; url?: string }>(modules: T[]) => {
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

const DEV_APP_INVALIDATORS_KEY = Symbol.for('eclipsa.dev-app-invalidators')

const registerDevAppInvalidator = (server: Record<PropertyKey, unknown>, invalidate: () => void) => {
  const existing = server[DEV_APP_INVALIDATORS_KEY]
  const invalidators =
    existing instanceof Set ? existing : new Set<() => void>()
  invalidators.add(invalidate)
  server[DEV_APP_INVALIDATORS_KEY] = invalidators
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

const handleHotUpdate = async (
  state: EclipsaPluginState,
  pluginContext: PluginContextWithEnvironment,
  options: HotUpdateContext,
) => {
  const config = state.config
  if (!config || !options.file.endsWith('.tsx')) {
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

  const module =
    options.modules[0] ??
    [...(pluginContext.environment.moduleGraph?.getModulesByFile(options.file) ?? [])][0]
  if (!module) {
    return
  }
  pluginContext.environment.hot.send('update-client', {
    url: module.url,
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
      const invalidateDevApp = (filePath: string, event: 'add' | 'change' | 'unlink') => {
        if (shouldInvalidateDevApp(config.root, filePath, event)) {
          devApp.invalidate()
        }
      }

      registerDevAppInvalidator(server as unknown as Record<PropertyKey, unknown>, () => {
        devApp.invalidate()
      })

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
      if (!id.endsWith('.tsx') || parseSymbolRequest(id)) {
        return
      }
      const config = state.config
      if (!config) {
        throw new Error('Resolved Vite config is unavailable during transform().')
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
