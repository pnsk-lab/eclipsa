import { createServerModuleRunner, type Plugin, type PluginOption, type ResolvedConfig } from 'vite'
import { createDevFetch, shouldInvalidateDevApp } from './dev-app/mod.ts'
import { incomingMessageToRequest, responseForServerResponse } from '../utils/node-connect.ts'
import { createConfig } from './config.ts'
import { resolveEclipsaPluginOptions, type EclipsaPluginOptions } from './options.ts'
import {
  compileModuleForClient,
  compileModuleForSSR,
  loadSymbolModuleForClient,
  loadSymbolModuleForSSR,
  parseSymbolRequest,
  resolveResumeHmrUpdate,
} from './compiler.ts'
import { RESUME_HMR_EVENT } from '../core/resume-hmr.ts'

const preserveNonJsHotModules = <T extends { type?: string }>(modules: T[]) =>
  modules.filter((module) => module.type !== 'js')

const eclipsaCore = (options: EclipsaPluginOptions = {}): Plugin => {
  let config: ResolvedConfig

  return {
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
      if (this.environment.name !== 'client') {
        return
      }
      if (!options.file.endsWith('.tsx')) {
        return
      }
      const source = await options.read()
      const resumableUpdate = await resolveResumeHmrUpdate({
        filePath: options.file,
        root: config.root,
        source,
      })
      if (resumableUpdate.isResumable) {
        if (resumableUpdate.update) {
          this.environment.hot.send(RESUME_HMR_EVENT, resumableUpdate.update)
        }
        return preserveNonJsHotModules(options.modules)
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
      return preserveNonJsHotModules(options.modules)
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
