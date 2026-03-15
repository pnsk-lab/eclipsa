import { Hono, type Context } from 'hono'
import type { MiddlewareHandler, Next } from 'hono/types'
import type { DevEnvironment, ResolvedConfig, ViteDevServer } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'
import {
  ROUTE_MANIFEST_ELEMENT_ID,
  ROUTE_PREFLIGHT_ENDPOINT,
  ROUTE_PREFLIGHT_REQUEST_HEADER,
  type RouteParams,
} from '../../core/router-shared.ts'
import type { SSRRootProps } from '../../core/types.ts'
import { Fragment, jsxDEV } from '../../jsx/jsx-dev-runtime.ts'
import {
  composeRouteMetadata,
  renderRouteMetadataHead,
  type RouteMetadataExport,
} from '../../core/metadata.ts'
import {
  createDevModuleUrl,
  createRouteManifest,
  createRoutes,
  matchRoute,
  normalizeRoutePath,
  type RouteEntry,
} from '../utils/routing.ts'
import * as path from 'node:path'
import {
  collectAppActions,
  collectAppLoaders,
  collectAppSymbols,
  createDevSymbolUrl,
} from '../compiler.ts'

const ROUTE_PARAMS_PROP = '__eclipsa_route_params'
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

const RESUME_PAYLOAD_PLACEHOLDER = '__ECLIPSA_RESUME_PAYLOAD__'
const ROUTE_MANIFEST_PLACEHOLDER = '__ECLIPSA_ROUTE_MANIFEST__'

const replaceHeadPlaceholder = (html: string, placeholder: string, value: string) =>
  html.replace(placeholder, value)

const splitHtmlForStreaming = (html: string) => {
  const bodyCloseIndex = html.lastIndexOf('</body>')
  if (bodyCloseIndex >= 0) {
    return {
      prefix: html.slice(0, bodyCloseIndex),
      suffix: html.slice(bodyCloseIndex),
    }
  }
  const htmlCloseIndex = html.lastIndexOf('</html>')
  if (htmlCloseIndex >= 0) {
    return {
      prefix: html.slice(0, htmlCloseIndex),
      suffix: html.slice(htmlCloseIndex),
    }
  }
  return {
    prefix: html,
    suffix: '',
  }
}

const ROUTE_SLOT_ROUTE_KEY = Symbol.for('eclipsa.route-slot-route')

const createRouteSlot = (
  route: {
    layouts: Array<{ renderer: (props: unknown) => unknown }>
    page: { renderer: (props: unknown) => unknown }
    params: RouteParams
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

const createRouteProps = (params: RouteParams, props: Record<string, unknown>) => {
  const nextProps = {
    ...props,
  }
  Object.defineProperty(nextProps, ROUTE_PARAMS_PROP, {
    configurable: true,
    enumerable: false,
    value: params,
    writable: true,
  })
  return nextProps
}

const createRouteElement = (
  pathname: string,
  params: RouteParams,
  Page: (props: unknown) => unknown,
  Layouts: Array<(props: unknown) => unknown>,
): any => {
  if (Layouts.length === 0) {
    return jsxDEV(Page as any, createRouteProps(params, {}), null, false, {})
  }

  const route = {
    layouts: Layouts.map((renderer) => ({
      renderer,
    })),
    page: {
      renderer: Page,
    },
    params,
    pathname,
  }
  let children: unknown = null
  for (let index = Layouts.length - 1; index >= 0; index -= 1) {
    const Layout = Layouts[index]!
    children = jsxDEV(
      Layout as any,
      createRouteProps(params, {
        children: createRouteSlot(route, index + 1),
      }),
      null,
      false,
      {},
    )
  }
  return children
}

const scoreSpecialRoute = (route: RouteEntry, pathname: string) => {
  const pathnameSegments = normalizeRoutePath(pathname).split('/').filter(Boolean)
  let score = 0
  for (
    let index = 0;
    index < route.segments.length && index < pathnameSegments.length;
    index += 1
  ) {
    const segment = route.segments[index]!
    const pathnameSegment = pathnameSegments[index]
    if (segment.kind === 'static') {
      if (segment.value !== pathnameSegment) {
        break
      }
      score += 10
      continue
    }
    score += segment.kind === 'rest' ? 1 : 2
    if (segment.kind === 'rest') {
      break
    }
  }
  return score
}

const findSpecialRoute = (
  routes: RouteEntry[],
  pathname: string,
  kind: 'error' | 'notFound',
): { params: RouteParams; route: RouteEntry } | null => {
  const matched = matchRoute(routes, pathname)
  if (matched?.route[kind]) {
    return matched
  }

  let best: { params: RouteParams; route: RouteEntry } | null = null
  let bestScore = -1
  for (const route of routes) {
    if (!route[kind]) {
      continue
    }
    const score = scoreSpecialRoute(route, pathname)
    if (score > bestScore) {
      best = {
        params: {},
        route,
      }
      bestScore = score
    }
  }
  return best
}

const applyRequestParams = (c: Context, params: RouteParams) => {
  const req = c.req as any
  req.param = (name?: string) => {
    if (!name) {
      return params
    }
    return params[name]
  }
}

const isNotFoundError = (error: unknown) =>
  !!error &&
  typeof error === 'object' &&
  (error as { __eclipsa_not_found__?: boolean }).__eclipsa_not_found__ === true

const isRedirectResponse = (
  response: unknown,
): response is { headers: { get(name: string): string | null }; status: number } =>
  !!response &&
  typeof response === 'object' &&
  typeof (response as { status?: unknown }).status === 'number' &&
  !!(response as { headers?: { get?: unknown } }).headers &&
  typeof (response as { headers: { get?: unknown } }).headers.get === 'function' &&
  (response as { status: number }).status >= 300 &&
  (response as { status: number }).status < 400 &&
  !!(response as { headers: { get(name: string): string | null } }).headers.get('location')

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
  const symbolUrls = Object.fromEntries(
    allSymbols.map((symbol) => [
      symbol.id,
      deps.createDevSymbolUrl(init.resolvedConfig.root, symbol.filePath, symbol.id),
    ]),
  )
  const routeManifest = createRouteManifest(routes, (entry) =>
    deps.createDevModuleUrl(init.resolvedConfig.root, entry),
  )

  const loadRouteMiddlewares = async (route: RouteEntry): Promise<MiddlewareHandler[]> =>
    await Promise.all(
      route.middlewares.map(async (middleware) => {
        const mod = await init.runner.import(middleware.filePath)
        if (typeof mod.default !== 'function') {
          throw new TypeError(
            `Route middleware "${middleware.filePath}" must default export a middleware function.`,
          )
        }
        return mod.default as MiddlewareHandler
      }),
    )

  const composeRouteMiddlewares = async <T>(
    route: RouteEntry,
    c: Context,
    params: RouteParams,
    handler: () => Promise<T>,
  ): Promise<T | Response> => {
    applyRequestParams(c, params)
    const middlewares = await loadRouteMiddlewares(route)
    let index = -1
    const dispatch = async (nextIndex: number): Promise<T | Response> => {
      if (nextIndex <= index) {
        throw new Error('Route middleware called next() multiple times.')
      }
      index = nextIndex
      const middleware = middlewares[nextIndex]
      if (!middleware) {
        return handler()
      }
      let nextResult: T | Response | undefined = undefined
      const result = await middleware(c, (async () => {
        nextResult = await dispatch(nextIndex + 1)
      }) as Next)
      if (result !== undefined) {
        return result as Response
      }
      return nextResult as T | Response
    }
    return dispatch(0)
  }

  const resolvePreflightTarget = (pathname: string) => {
    const match = matchRoute(routes, pathname)
    if (match?.route.page) {
      return match
    }
    if (!match) {
      const fallback = findSpecialRoute(routes, pathname, 'notFound')
      if (fallback?.route.notFound) {
        return fallback
      }
    }
    return null
  }

  const invokeRouteServer = async (filePath: string, c: Context, params: RouteParams) => {
    applyRequestParams(c, params)
    const mod = await init.runner.import(filePath)
    const methodHandler = mod[c.req.method] as
      | ((context: Context) => Response | Promise<Response>)
      | undefined
    if (typeof methodHandler === 'function') {
      return methodHandler(c)
    }
    const serverApp = mod.default as
      | { fetch?: (request: Request, env?: unknown, ctx?: unknown) => Response | Promise<Response> }
      | undefined
    if (serverApp && typeof serverApp.fetch === 'function') {
      return serverApp.fetch(c.req.raw)
    }
    return c.text('Not Found', 404)
  }

  const renderRouteResponse = async (
    route: RouteEntry,
    pathname: string,
    params: RouteParams,
    c: Context,
    modulePath: string,
    status = 200,
    options?: {
      prepare?: (container: any) => void | Promise<void>
    },
  ) => {
    const [
      modules,
      { default: SSRRoot },
      {
        escapeJSONScriptText,
        getStreamingResumeBootstrapScriptContent,
        renderSSRStream,
        resolvePendingLoaders,
        serializeResumePayload,
        RESUME_FINAL_STATE_ELEMENT_ID,
      },
    ] = await Promise.all([
      Promise.all([
        init.runner.import(modulePath),
        ...route.layouts.map((layout) => init.runner.import(layout.filePath)),
      ]),
      init.runner.import('/app/+ssr-root.tsx'),
      init.runner.import('eclipsa'),
    ])
    const [pageModule, ...layoutModules] = modules as Array<{
      default: (props: unknown) => unknown
      metadata?: RouteMetadataExport
    }>
    const { default: Page } = pageModule
    const Layouts = layoutModules.map((module) => module.default)
    const metadata = composeRouteMetadata(
      [...layoutModules.map((module) => module.metadata ?? null), pageModule.metadata ?? null],
      {
        params,
        url: new URL(c.req.url),
      },
    )

    const document = SSRRoot({
      children: createRouteElement(pathname, params, Page, Layouts) as SSRRootProps['children'],
      head: {
        type: Fragment,
        isStatic: true,
        props: {
          children: [
            ...renderRouteMetadataHead(metadata),
            {
              type: 'script',
              isStatic: true,
              props: {
                children: RESUME_PAYLOAD_PLACEHOLDER,
                id: 'eclipsa-resume',
                type: 'application/eclipsa-resume+json',
              },
            },
            {
              type: 'script',
              isStatic: true,
              props: {
                children: ROUTE_MANIFEST_PLACEHOLDER,
                id: ROUTE_MANIFEST_ELEMENT_ID,
                type: 'application/eclipsa-route-manifest+json',
              },
            },
            {
              type: 'script',
              isStatic: true,
              props: {
                dangerouslySetInnerHTML: getStreamingResumeBootstrapScriptContent(),
              },
            },
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

    applyRequestParams(c, params)
    const { html, payload, chunks } = await renderSSRStream(() => document, {
      prepare: options?.prepare,
      resolvePendingLoaders: async (container: any) => resolvePendingLoaders(container, c),
      symbols: symbolUrls,
    })
    const shellHtml = replaceHeadPlaceholder(
      replaceHeadPlaceholder(html, RESUME_PAYLOAD_PLACEHOLDER, serializeResumePayload(payload)),
      ROUTE_MANIFEST_PLACEHOLDER,
      escapeJSONScriptText(JSON.stringify(routeManifest)),
    )
    const { prefix, suffix } = splitHtmlForStreaming(shellHtml)
    const encoder = new TextEncoder()

    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(prefix))
          void (async () => {
            let latestPayload = payload

            for await (const chunk of chunks) {
              latestPayload = chunk.payload
              const templateId = `eclipsa-suspense-template-${chunk.boundaryId}`
              const payloadId = `eclipsa-suspense-payload-${chunk.boundaryId}`
              controller.enqueue(
                encoder.encode(
                  `<template id="${templateId}">${chunk.html}</template>` +
                    `<script id="${payloadId}" type="application/eclipsa-resume+json">${serializeResumePayload(chunk.payload)}</script>` +
                    `<script>window.__eclipsa_stream.enqueue({boundaryId:${JSON.stringify(chunk.boundaryId)},payloadScriptId:${JSON.stringify(payloadId)},templateId:${JSON.stringify(templateId)}})</script>`,
                ),
              )
            }

            controller.enqueue(
              encoder.encode(
                `<script id="${RESUME_FINAL_STATE_ELEMENT_ID}" type="application/eclipsa-resume+json">${serializeResumePayload(latestPayload)}</script>${suffix}`,
              ),
            )
            controller.close()
          })().catch((error) => {
            controller.error(error)
          })
        },
      }),
      { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }

  const renderMatchedPage = async (
    match: { params: RouteParams; route: RouteEntry },
    c: Context,
    options?: {
      prepare?: (container: any) => void | Promise<void>
    },
  ) => {
    try {
      return await renderRouteResponse(
        match.route,
        normalizeRoutePath(new URL(c.req.url).pathname),
        match.params,
        c,
        match.route.page!.filePath,
        200,
        options,
      )
    } catch (error) {
      const fallback = isNotFoundError(error)
        ? findSpecialRoute(routes, normalizeRoutePath(new URL(c.req.url).pathname), 'notFound')
        : findSpecialRoute(routes, normalizeRoutePath(new URL(c.req.url).pathname), 'error')
      const module = fallback?.route[isNotFoundError(error) ? 'notFound' : 'error']
      if (!fallback || !module) {
        return c.text(
          isNotFoundError(error) ? 'Not Found' : 'Internal Server Error',
          isNotFoundError(error) ? 404 : 500,
        )
      }
      return renderRouteResponse(
        fallback.route,
        normalizeRoutePath(new URL(c.req.url).pathname),
        fallback.params,
        c,
        module.filePath,
        isNotFoundError(error) ? 404 : 500,
        options,
      )
    }
  }

  const resolveRoutePreflight = async (href: string, c: Context) => {
    const requestUrl = new URL(c.req.url)
    const targetUrl = new URL(href, requestUrl)
    if (targetUrl.origin !== requestUrl.origin) {
      return c.json({ document: true, ok: false })
    }

    const target = resolvePreflightTarget(normalizeRoutePath(targetUrl.pathname))
    if (!target) {
      return c.json({ ok: true })
    }

    const headers = new Headers(c.req.raw.headers)
    headers.set(ROUTE_PREFLIGHT_REQUEST_HEADER, '1')
    let response: Response
    try {
      response = await fetch(targetUrl.href, {
        headers,
        redirect: 'manual',
      })
    } catch {
      response = await app.fetch(
        new Request(targetUrl.href, {
          headers,
          method: 'GET',
          redirect: 'manual',
        }),
      )
    }

    if (response.status >= 200 && response.status < 300) {
      return c.json({ ok: true })
    }
    if (isRedirectResponse(response)) {
      return c.json({
        location: new URL(response.headers.get('location')!, requestUrl).href,
        ok: false,
      })
    }
    return c.json({ document: true, ok: false })
  }

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

  app.get(ROUTE_PREFLIGHT_ENDPOINT, async (c) => {
    const href = c.req.query('href')
    if (!href) {
      return c.json({ document: true, ok: false }, 400)
    }
    return resolveRoutePreflight(href, c)
  })

  app.all('*', async (c) => {
    const pathname = normalizeRoutePath(new URL(c.req.url).pathname)
    const match = matchRoute(routes, pathname)

    if (!match) {
      const fallback = findSpecialRoute(routes, pathname, 'notFound')
      if (fallback?.route.notFound) {
        return composeRouteMiddlewares(fallback.route, c, fallback.params, async () =>
          c.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === '1'
            ? c.body(null, 204)
            : renderRouteResponse(
                fallback.route,
                pathname,
                fallback.params,
                c,
                fallback.route.notFound!.filePath,
                404,
              ),
        )
      }
      return c.text('Not Found', 404)
    }

    if ((c.req.method === 'GET' || c.req.method === 'HEAD') && match.route.page) {
      return composeRouteMiddlewares(match.route, c, match.params, async () =>
        c.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === '1'
          ? c.body(null, 204)
          : renderMatchedPage(match, c),
      )
    }

    if (c.req.method === 'POST' && match.route.page) {
      return composeRouteMiddlewares(match.route, c, match.params, async () => {
        const [
          {
            ACTION_CONTENT_TYPE,
            deserializeValue,
            executeAction,
            getNormalizedActionInput,
            getActionFormSubmissionId,
            hasAction,
            primeActionState,
          },
        ] = await Promise.all([init.runner.import('eclipsa')])
        const actionId = await getActionFormSubmissionId(c)
        if (!actionId) {
          return match.route.server
            ? invokeRouteServer(match.route.server.filePath, c, match.params)
            : renderMatchedPage(match, c)
        }
        const modulePath = actionModules.get(actionId)
        if (!modulePath) {
          return c.text('Not Found', 404)
        }
        if (!hasAction(actionId)) {
          await init.runner.import(modulePath)
        }
        const input = await getNormalizedActionInput(c)
        const response = await executeAction(actionId, c)
        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.startsWith(ACTION_CONTENT_TYPE)) {
          return response
        }
        const body = (await response.json()) as
          | { error: unknown; ok: false }
          | { ok: true; value: unknown }
        return renderMatchedPage(match, c, {
          prepare(container) {
            primeActionState(container, actionId, {
              error: body.ok ? undefined : deserializeValue(body.error),
              input,
              result: body.ok ? deserializeValue(body.value) : undefined,
            })
          },
        })
      })
    }

    if (match.route.server) {
      return composeRouteMiddlewares(match.route, c, match.params, async () =>
        invokeRouteServer(match.route.server!.filePath, c, match.params),
      )
    }

    if (match.route.page) {
      return composeRouteMiddlewares(match.route, c, match.params, async () =>
        c.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === '1'
          ? c.body(null, 204)
          : renderMatchedPage(match, c),
      )
    }

    return c.text('Not Found', 404)
  })

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
