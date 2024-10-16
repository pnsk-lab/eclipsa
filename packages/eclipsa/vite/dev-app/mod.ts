import { Hono, type Context } from 'hono'
import type { DevEnvironment, ResolvedConfig, ViteDevServer } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'
import { renderToString } from '../../jsx/mod.ts'
import type { SSRRootProps } from '../../core/types.ts'
import { Fragment } from '../../jsx/jsx-dev-runtime.ts'
import { createRoutes, type RouteEntry } from '../utils/routing.ts'
import type { DevClientInfo } from '../../core/dev-client/types.ts'

interface DevAppInit {
  resolvedConfig: ResolvedConfig
  devServer: ViteDevServer
  runner: ModuleRunner
  ssrEnv: DevEnvironment
}

const createDevApp = async (init: DevAppInit) => {
  const app = new Hono()

  const createHandler = (entry: RouteEntry) => async (c: Context) => {
    const [
      { default: Page },
      { default: SSRRoot }
    ] = await Promise.all([
      await init.runner.import(entry.filePath),
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
              isStatic: true,
              props: {
                children: 'import("/@vite/client")'
              } 
            },
            {
              type: 'script',
              props: {
                type: 'module',
                src: '/app/+client.dev.tsx'
              }
            },
            {
              type: 'script',
              isStatic: true,
              props: {
                type: 'text/eclipsa+devinfo',
                id: 'eclipsa-devinfo',
                children: JSON.stringify({
                  filePath: entry.filePath
                } satisfies DevClientInfo)
              }
            }
          ]
        }
      }
    } satisfies SSRRootProps)
  
    return c.html(renderToString(parent))
  }

  for (const entry of await createRoutes(init.resolvedConfig.root)) {
    app.get(entry.honoPath, createHandler(entry))
  }

  return app
}
export const createDevFetch = (
  init: DevAppInit,
): (req: Request) => Promise<Response | undefined> => {
  let app = createDevApp(init)

  return async (req) => {
    const fetched = await (await app).fetch(req)
    if (fetched.status === 404) {
      return
    }
    return fetched
  }
}
