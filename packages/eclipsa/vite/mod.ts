import {
  createServerModuleRunner,
  DevEnvironment,
  type PluginOption,
  type ResolvedConfig,
  type Plugin
} from 'vite'
import { createDevFetch } from './dev-app/mod.ts'
import {
  incomingMessageToRequest,
  responseForServerResponse,
} from '../utils/node-connect.ts'
import { transformJSXDevSSR } from '../transformers/dev-ssr/mod.ts'
import { transformClientDevJSX } from '../transformers/dev-client/mod.ts'
import { createConfig } from './config.ts'
import { vitePluginEclipsaBuild } from './build/plugin.ts'

const eclipsaCore = (): Plugin => {
  let config: ResolvedConfig

  return {
    name: 'vite-plugin-eclipsa',
    config: createConfig,

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    configureServer(server) {
      const ssrEnv = server.environments.ssr
      const runner = createServerModuleRunner(ssrEnv, {
        hmr: false,
      })
      const devFetch = createDevFetch({
        resolvedConfig: config,
        devServer: server,
        runner,
        ssrEnv,
      })
      server.middlewares.use(async (req, res, next) => {
        const webReq = incomingMessageToRequest(req)
        const webRes = await devFetch(webReq)
        if (webRes) {
          responseForServerResponse(webRes, res)
          return
        }
        next()
      })
    },
    hotUpdate(options) {
      if (this.environment.name !== 'client') {
        return
      }
      const module = options.modules[0]
      options.server.hot.send({
        type: 'custom',
        event: 'update-client',
        data: {
          url: module.url,
        },
      })
      return []
    },
    transform(code, id) {
      if (this.environment.mode !== 'dev') {
        return
      }
      if (id.endsWith('.tsx')) {
        const result = (
          this.environment.name === 'ssr'
            ? transformJSXDevSSR
            : transformClientDevJSX
        )(code, id)
        return {
          code: result,
        }
      }
      return
    },
  }
}

export const eclipsa = (): PluginOption => {
  return [
    eclipsaCore(),
    vitePluginEclipsaBuild()
  ]
}
