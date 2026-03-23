import { createServerModuleRunner, type Plugin, type PluginOption, type ResolvedConfig } from 'vite'
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
import { RESUME_HMR_EVENT } from '../core/resume-hmr.ts'

const preserveCssHotModules = <T extends { type?: string }>(modules: T[]) =>
  modules.filter((module) => module.type === 'css')

const DEV_APP_INVALIDATORS_KEY = Symbol.for('eclipsa.dev-app-invalidators')

const registerDevAppInvalidator = (server: Record<PropertyKey, unknown>, invalidate: () => void) => {
  const existing = server[DEV_APP_INVALIDATORS_KEY]
  const invalidators =
    existing instanceof Set ? existing : new Set<() => void>()
  invalidators.add(invalidate)
  server[DEV_APP_INVALIDATORS_KEY] = invalidators
}

const eclipsaCore = (options: EclipsaPluginOptions = {}): Plugin => {
  let config: ResolvedConfig

  return {
    enforce: 'pre',
    name: 'vite-plugin-eclipsa',
    config: createConfig(resolveEclipsaPluginOptions(options)),
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    configureServer(server) {
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
    async hotUpdate(options) {
      if (!options.file.endsWith('.tsx')) {
        return
      }
      const source = await options.read()
      if (this.environment.name !== 'client') {
        const resumableUpdate = await inspectResumeHmrUpdate({
          filePath: options.file,
          root: config.root,
          source,
        })
        if (resumableUpdate.isResumable) {
          return preserveCssHotModules(options.modules)
        }
        return
      }
      const resumableUpdate = await resolveResumeHmrUpdate({
        filePath: options.file,
        root: config.root,
        source,
      })
      if (resumableUpdate.isResumable) {
        if (resumableUpdate.update) {
          this.environment.hot.send(RESUME_HMR_EVENT, resumableUpdate.update)
        }
        return preserveCssHotModules(options.modules)
      }

      const module =
        options.modules[0] ??
        [...(this.environment.moduleGraph?.getModulesByFile(options.file) ?? [])][0]
      if (!module) {
        return
      }
      this.environment.hot.send('update-client', {
        url: module.url,
      })
      return preserveCssHotModules(options.modules)
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

export type { EclipsaPluginOptions } from './options.ts'

export const eclipsa = (options?: EclipsaPluginOptions): PluginOption => [eclipsaCore(options)]
