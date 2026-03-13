import { Hono, type Context } from 'hono'
import type { DevEnvironment, ResolvedConfig, ViteDevServer } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'
import { ROUTE_MANIFEST_ELEMENT_ID } from '../../core/router-shared.ts'
import type { SSRRootProps } from '../../core/types.ts'
import { Fragment, jsxDEV } from '../../jsx/jsx-dev-runtime.ts'
import {
  createDevModuleUrl,
  createRouteManifest,
  createRoutes,
  type RouteEntry,
} from '../utils/routing.ts'
import * as path from 'node:path'
import {
  collectAppActions,
  collectAppLoaders,
  collectAppSymbols,
  createDevSymbolUrl,
} from '../compiler.ts'

interface DevAppDeps {
  collectAppActions(root: string): Promise<{ id: string; filePath: string }[]>
  collectAppLoaders(root: string): Promise<{ id: string; filePath: string }[]>
  collectAppSymbols(root: string): Promise<{ id: string; filePath: string }[]>
  createDevModuleUrl(root: string, entry: { filePath: string }): string
  createDevSymbolUrl(root: string, filePath: string, symbolId: string): string
  createRoutes(root: string): Promise<RouteEntry[]>
}

interface DevAppInit {
  deps?: DevAppDeps
  resolvedConfig: ResolvedConfig
  devServer: ViteDevServer
  runner: ModuleRunner
  ssrEnv: DevEnvironment
}

export interface DevFetchController {
  fetch(req: Request): Promise<Response | undefined>
  invalidate(): void
}

const toAppRelativePath = (root: string, filePath: string) => {
  const relativePath = path.relative(path.join(root, 'app'), filePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null
  }
  return relativePath.replaceAll('\\', '/')
}

export const shouldInvalidateDevApp = (
  root: string,
  filePath: string,
  event: 'add' | 'change' | 'unlink',
) => {
  const relativePath = toAppRelativePath(root, filePath)
  if (!relativePath) {
    return false
  }
  if (relativePath === '+server-entry.ts') {
    return true
  }
  if (relativePath.endsWith('.ts') || relativePath.endsWith('.tsx')) {
    return event === 'add' || event === 'change' || event === 'unlink'
  }
  return false
}

const injectHeadScripts = (html: string, ...scripts: string[]) => {
  const scriptMarkup = scripts.join('')
  return html.includes('</head>')
    ? html.replace('</head>', `${scriptMarkup}</head>`)
    : `${scriptMarkup}${html}`
}

const ROUTE_SLOT_ROUTE_KEY = Symbol.for('eclipsa.route-slot-route')

const createRouteSlot = (
  route: {
    layouts: Array<{ renderer: (props: unknown) => unknown }>
    page: { renderer: (props: unknown) => unknown }
    pathname: string
  },
  startLayoutIndex: number,
) => {
  const slot = {
    __eclipsa_type: 'route-slot',
    pathname: route.pathname,
    startLayoutIndex,
  }
  Object.defineProperty(slot, ROUTE_SLOT_ROUTE_KEY, {
    configurable: true,
    enumerable: false,
    value: route,
    writable: true,
  })
  return slot
}

const createRouteElement = (
  pathname: string,
  Page: (props: unknown) => unknown,
  Layouts: Array<(props: unknown) => unknown>,
): any => {
  if (Layouts.length === 0) {
    return jsxDEV(Page as any, {}, null, false, {})
  }

  const route = {
    layouts: Layouts.map((renderer) => ({
      renderer,
    })),
    page: {
      renderer: Page,
    },
    pathname,
  }
  let children: unknown = null
  for (let index = Layouts.length - 1; index >= 0; index -= 1) {
    const Layout = Layouts[index]!
    children = jsxDEV(
      Layout as any,
      {
        children: createRouteSlot(route, index + 1),
      },
      null,
      false,
      {},
    )
  }
  return children
}

const createDevApp = async (init: DevAppInit) => {
  const deps = init.deps ?? {
    collectAppActions,
    collectAppLoaders,
    collectAppSymbols,
    createDevModuleUrl,
    createDevSymbolUrl,
    createRoutes,
  }
  const { default: userApp } = await init.runner.import('/app/+server-entry.ts')
  const app = new Hono()
  app.route('/', userApp)
  const actions = await deps.collectAppActions(init.resolvedConfig.root)
  const loaders = await deps.collectAppLoaders(init.resolvedConfig.root)
  const routes = await deps.createRoutes(init.resolvedConfig.root)
  const allSymbols = await deps.collectAppSymbols(init.resolvedConfig.root)
  const actionModules = new Map(actions.map((action) => [action.id, action.filePath]))
  const loaderModules = new Map(loaders.map((loader) => [loader.id, loader.filePath]))
  const loaderIdsByFilePath = new Map<string, string[]>()
  for (const loader of loaders) {
    const ids = loaderIdsByFilePath.get(loader.filePath) ?? []
    ids.push(loader.id)
    loaderIdsByFilePath.set(loader.filePath, ids)
  }
  const symbolUrls = Object.fromEntries(
    allSymbols.map((symbol) => [
      symbol.id,
      deps.createDevSymbolUrl(init.resolvedConfig.root, symbol.filePath, symbol.id),
    ]),
  )
  const routeManifest = createRouteManifest(routes, (entry) =>
    deps.createDevModuleUrl(init.resolvedConfig.root, entry),
  )

  app.post('/__eclipsa/action/:id', async (c) => {
    const [{ executeAction, hasAction }] = await Promise.all([init.runner.import('eclipsa')])
    const id = c.req.param('id')
    const modulePath = actionModules.get(id)
    if (!modulePath) {
      return c.text('Not Found', 404)
    }
    if (!hasAction(id)) {
      await init.runner.import(modulePath)
    }
    return executeAction(id, c)
  })

  app.get('/__eclipsa/loader/:id', async (c) => {
    const [{ executeLoader, hasLoader }] = await Promise.all([init.runner.import('eclipsa')])
    const id = c.req.param('id')
    const modulePath = loaderModules.get(id)
    if (!modulePath) {
      return c.text('Not Found', 404)
    }
    if (!hasLoader(id)) {
      await init.runner.import(modulePath)
    }
    return executeLoader(id, c)
  })

  const createHandler = (entry: RouteEntry) => async (c: Context) => {
    const [
      modules,
      { default: SSRRoot },
      { primeLoaderState, renderSSRAsync, serializeResumePayload },
    ] =
      await Promise.all([
        Promise.all([
          init.runner.import(entry.page.filePath),
          ...entry.layouts.map((layout) => init.runner.import(layout.filePath)),
        ]),
        init.runner.import('/app/+ssr-root.tsx'),
        init.runner.import('eclipsa'),
      ])
    const [{ default: Page }, ...layoutModules] = modules
    const Layouts = layoutModules.map((module) => module.default)
    const loaderIds = [entry.page.filePath, ...entry.layouts.map((layout) => layout.filePath)].flatMap(
      (filePath) => loaderIdsByFilePath.get(filePath) ?? [],
    )

    const document = SSRRoot({
      children: createRouteElement(entry.honoPath, Page, Layouts) as SSRRootProps['children'],
      head: {
        type: Fragment,
        isStatic: true,
        props: {
          children: [
            {
              type: 'script',
              isStatic: true,
              props: {
                children: 'import("/@vite/client")',
              },
            },
            {
              type: 'script',
              props: {
                src: '/app/+client.dev.tsx',
                type: 'module',
              },
            },
          ],
        },
      },
    } satisfies SSRRootProps)

    const { html, payload } = await renderSSRAsync(() => document, {
      prepare: async (container: any) => {
        await Promise.all(loaderIds.map((id) => primeLoaderState(container, id, c)))
      },
      symbols: symbolUrls,
    })
    const payloadScript = `<script type="application/eclipsa-resume+json" id="eclipsa-resume">${serializeResumePayload(
      payload,
    )}</script>`
    const routeManifestScript = `<script type="application/eclipsa-route-manifest+json" id="${ROUTE_MANIFEST_ELEMENT_ID}">${JSON.stringify(
      routeManifest,
    )}</script>`

    return c.html(injectHeadScripts(html, payloadScript, routeManifestScript))
  }

  for (const entry of routes) {
    app.get(entry.honoPath, createHandler(entry))
  }

  return app
}

export const createDevFetch = (init: DevAppInit): DevFetchController => {
  let app: ReturnType<typeof createDevApp> | null = null
  const getApp = () => {
    app ??= createDevApp(init)
    return app
  }

  return {
    invalidate() {
      app = null
    },
    async fetch(req) {
      const fetched = await (await getApp()).fetch(req)
      if (fetched.status === 404) {
        return
      }
      return fetched
    },
  }
}
