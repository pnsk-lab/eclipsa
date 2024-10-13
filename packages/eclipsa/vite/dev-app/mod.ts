import { Hono } from 'hono'
import type { ResolvedConfig, ViteDevServer, DevEnvironment } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'

interface DevAppInit {
  resolvedConfig: ResolvedConfig
  devServer: ViteDevServer
  runner: ModuleRunner
  ssrEnv: DevEnvironment
}

const createDevApp = ({ runner }: DevAppInit) => {
  const app = new Hono()
  
  app.get('/', async c => {
    const imported = await runner.import('/app/+page.tsx')
    return c.html(imported.default().toString())
  })
  return app
}
export const createDevFetch = (init: DevAppInit): ((req: Request) => Promise<Response>) => {
  let app = createDevApp(init)

  return async req => {
    return await app.fetch(req)
  }
}
