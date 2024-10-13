import {
  createServerModuleRunner,
  DevEnvironment,
  type Plugin,
  type ResolvedConfig,
} from 'vite'
import { createDevFetch } from './dev-app/mod.ts'
import {
  incomingMessageToRequest,
  responseForServerResponse,
} from '../utils/node-connect.ts'
import { transformJSX } from './transformer/mod.ts'

export const eclipsa = (): Plugin => {
  let config: ResolvedConfig
  return {
    name: 'vite-plugin-eclipsa',
    config() {
      return {
        esbuild: {
          jsxFactory: 'jsx',
          jsxImportSource: '@xely/eclipsa',
          jsx: 'automatic',
        },
        environments: {
          ssr: {
            dev: {
              createEnvironment(name, config, context) {
                context.ws
                return new DevEnvironment(name, config, {
                  hot: false,
                })
              },
            },
          },
        },
      }
    },
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
          responseForServerResponse(await devFetch(webReq), res)
          return
        }
        next()
      })
    },
    transform(code, id) {
      if (id.endsWith('.tsx')) {
        return {
          code: transformJSX(code),
        }
      }
    },
  }
}
