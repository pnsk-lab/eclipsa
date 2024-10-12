import { Hono } from 'hono'
import type { ResolvedConfig, ViteDevServer } from 'vite'

interface DevAppInit {
  resolvedConfig: ResolvedConfig
  devServer: ViteDevServer
}

const createDevApp = (init: DevAppInit) => {
  
}
export const createDevFetch = (init: DevAppInit): ((req: Request) => Promise<Response>) => {
  let app = new Hono()

  return async req => {
    return await app.fetch(req)
  }
}
