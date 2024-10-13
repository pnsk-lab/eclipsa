import { Hono } from 'hono'
import type { DevEnvironment, ResolvedConfig, ViteDevServer } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'
import { renderToString } from '../../jsx/mod.ts'
import type { SSRRootProps } from '../../core/types.ts'
import { Fragment } from '../../jsx/jsx-dev-runtime.ts'

interface DevAppInit {
  resolvedConfig: ResolvedConfig
  devServer: ViteDevServer
  runner: ModuleRunner
  ssrEnv: DevEnvironment
}

const createDevApp = (init: DevAppInit) => {
  const app = new Hono()

  app.get('/', async (c) => {
    const [
      { default: Page },
      { default: SSRRoot }
    ] = await Promise.all([
      await init.runner.import('/app/+page.tsx'),
      await init.runner.import('/app/+ssr-root.tsx')
    ])

    const page = Page()
    const parent = SSRRoot({
      children: page,
      head: {
        type: Fragment,
        isStatic: true,
        props: {
          children: [
            {
              type: 'script',
              isStatic: false,
              props: {
                children: 'import("/@vite/client")'
              } 
            },
          ]
        }
      }
    } satisfies SSRRootProps)
  
    return c.html(renderToString(parent))
  })
  return app
}
export const createDevFetch = (
  init: DevAppInit,
): (req: Request) => Promise<Response | undefined> => {
  let app = createDevApp(init)

  return async (req) => {
    const fetched = await app.fetch(req)
    if (fetched.status === 404) {
      return
    }
    return fetched
  }
}
