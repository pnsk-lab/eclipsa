import { type Plugin, type ResolvedConfig, DevEnvironment } from 'vite'
import * as path from 'node:path'
import { createDevFetch } from './dev-app/mod.ts'
import { incomingMessageToRequest, responseForServerResponse } from '../utils/node-connect.ts'

export const eclipsa = (): Plugin => {
  let config: ResolvedConfig
  return {
    name: 'vite-plugin-eclipsa',
    config(config, env) {
      return {
        environments: {
          edge: {
            dev: {
              createEnvironment(name, config, context) {
                return new DevEnvironment(name, config, {
                  hot: false
                })
              },
            }
          }
        }
      }
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    configureServer(server) {
      const devFetch = createDevFetch({
        resolvedConfig: config,
        devServer: server
      })
      server.middlewares.use(async (req, res, next) => {
        console.log(await server.environments.edge.fetchModule('./app/+page.tsx'))
        const webReq = incomingMessageToRequest(req)
        const webRes = await devFetch(webReq)
        if (webRes) {
          responseForServerResponse(await devFetch(webReq), res)
          return
        }
        next()
      })
    }
  }
}
