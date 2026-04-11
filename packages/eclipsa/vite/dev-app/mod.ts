import { Hono, type Context } from 'hono'
import type { MiddlewareHandler, Next } from 'hono/types'
import type { DevEnvironment, ResolvedConfig, ViteDevServer } from 'vite'
import type { ModuleRunner } from 'vite/module-runner'
import * as fs from 'node:fs/promises'
import {
  ROUTE_DATA_ENDPOINT,
  ROUTE_DATA_REQUEST_HEADER,
  ROUTE_MANIFEST_ELEMENT_ID,
  ROUTE_PREFLIGHT_ENDPOINT,
  ROUTE_PREFLIGHT_REQUEST_HEADER,
  ROUTE_RPC_URL_HEADER,
  type RouteParams,
} from '../../core/router-shared.ts'
import { applyActionCsrfCookie, ensureActionCsrfToken } from '../../core/action-csrf.ts'
import type { SSRRootProps } from '../../core/types.ts'
import {
  APP_HOOKS_ELEMENT_ID,
  attachRequestFetch,
  createRequestFetch,
  markPublicError,
  resolveReroute,
  runHandleError,
  type AppContext,
  type AppHooksModule,
  type ServerHooksModule,
  withServerRequestContext,
} from '../../core/hooks.ts'
import { Fragment, jsxDEV } from '../../jsx/jsx-dev-runtime.ts'
import {
  composeRouteMetadata,
  renderRouteMetadataHead,
  type RouteMetadataExport,
} from '../../core/metadata.ts'
import { primeLocationState } from '../../core/runtime.ts'
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
  collectReachableAnalyzableFiles,
  createDevSymbolUrl,
  primeCompilerCache,
} from '../compiler.ts'

const ROUTE_PARAMS_PROP = '__eclipsa_route_params'
const ROUTE_ERROR_PROP = '__eclipsa_route_error'
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

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const getRequestUrl = (request: Request) => {
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto')
  if (host) {
    url.host = host
  }
  if (proto) {
    url.protocol = `${proto}:`
  }
  return url
}

const createInternalRouteRequestUrl = (request: Request, targetUrl: URL) =>
  new URL(`${targetUrl.pathname}${targetUrl.search}`, request.url).href

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
const APP_HOOKS_PLACEHOLDER = '__ECLIPSA_APP_HOOKS__'

interface RouteDataResponse {
  finalHref: string
  finalPathname: string
  kind: 'page' | 'not-found'
  loaders: Record<string, unknown>
  ok: true
}

interface RouteServerAccessEntry {
  actionIds: Set<string>
  loaderIds: Set<string>
  route: RouteEntry
}

const replaceHeadPlaceholder = (html: string, placeholder: string, value: string) =>
  html.replaceAll(placeholder, value)

const replaceResumePayloadPlaceholderValue = (
  value: unknown,
  replacements: Record<string, string>,
): unknown => {
  if (typeof value === 'string') {
    return replacements[value] ?? value
  }
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((entry) => {
      const replaced = replaceResumePayloadPlaceholderValue(entry, replacements)
      if (replaced !== entry) {
        changed = true
      }
      return replaced
    })
    return changed ? next : value
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  let changed = false
  const next: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    const replaced = replaceResumePayloadPlaceholderValue(entry, replacements)
    if (replaced !== entry) {
      changed = true
    }
    next[key] = replaced
  }
  return changed ? next : value
}

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

const toIdsByFilePath = (entries: ReadonlyArray<{ filePath: string; id: string }>) => {
  const idsByFilePath = new Map<string, string[]>()
  for (const entry of entries) {
    const existing = idsByFilePath.get(entry.filePath)
    if (existing) {
      existing.push(entry.id)
      continue
    }
    idsByFilePath.set(entry.filePath, [entry.id])
  }
  return idsByFilePath
}

const getRouteReachableEntryFiles = (route: RouteEntry) =>
  [
    route.error?.filePath,
    ...route.layouts.map((layout) => layout.filePath),
    route.loading?.filePath,
    route.notFound?.filePath,
    route.page?.filePath,
  ].filter((filePath): filePath is string => typeof filePath === 'string')

const createRouteServerAccessEntries = async (
  routes: readonly RouteEntry[],
  actions: ReadonlyArray<{ filePath: string; id: string }>,
  loaders: ReadonlyArray<{ filePath: string; id: string }>,
) => {
  const actionIdsByFilePath = toIdsByFilePath(actions)
  const loaderIdsByFilePath = toIdsByFilePath(loaders)

  return await Promise.all(
    routes.map(async (route) => {
      const reachableFiles = await collectReachableAnalyzableFiles(
        getRouteReachableEntryFiles(route),
      )
      return {
        actionIds: new Set(
          reachableFiles.flatMap((filePath) => actionIdsByFilePath.get(filePath) ?? []),
        ),
        loaderIds: new Set(
          reachableFiles.flatMap((filePath) => loaderIdsByFilePath.get(filePath) ?? []),
        ),
        route,
      } satisfies RouteServerAccessEntry
    }),
  )
}

const ROUTE_SLOT_ROUTE_KEY = Symbol.for('eclipsa.route-slot-route')

const createRouteSlot = (
  route: {
    error?: unknown
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
  error?: unknown,
): any => {
  if (Layouts.length === 0) {
    const nextProps = createRouteProps(params, {})
    Object.defineProperty(nextProps, ROUTE_ERROR_PROP, {
      configurable: true,
      enumerable: false,
      value: error,
      writable: true,
    })
    return jsxDEV(Page as any, nextProps, null, false, {})
  }

  const route = {
    error,
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
    const nextProps = createRouteProps(params, {
      children: createRouteSlot(route, index + 1),
    })
    Object.defineProperty(nextProps, ROUTE_ERROR_PROP, {
      configurable: true,
      enumerable: false,
      value: error,
      writable: true,
    })
    children = jsxDEV(Layout as any, nextProps, null, false, {})
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

const logDevServerError = (devServer: ViteDevServer, error: unknown) => {
  if (error instanceof Error && typeof devServer.ssrFixStacktrace === 'function') {
    devServer.ssrFixStacktrace(error)
  }
  console.error(error)
}

const toPublicErrorValue = async (
  devServer: ViteDevServer,
  hooks: ServerHooksModule,
  c: AppContext,
  error: unknown,
  event: Parameters<typeof runHandleError>[1]['event'],
) => {
  const publicError = await runHandleError(
    {
      handleError: hooks.handleError,
    },
    {
      context: c,
      error,
      event,
    },
  )
  if (!isNotFoundError(error)) {
    logDevServerError(devServer, error)
  }
  return markPublicError(error, publicError)
}

const loadOptionalHookModule = async <T extends object>(
  runner: ModuleRunner,
  filePath: string,
): Promise<Partial<T>> => {
  if (!(await fileExists(filePath))) {
    return {}
  }
  return (await runner.import(filePath)) as Partial<T>
}

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
  const routeServerAccessEntries = await createRouteServerAccessEntries(routes, actions, loaders)
  const routeServerAccessByRoute = new Map(
    routeServerAccessEntries.map((entry) => [entry.route, entry] as const),
  )
  const symbolUrls = Object.fromEntries(
    allSymbols.map((symbol) => [
      symbol.id,
      deps.createDevSymbolUrl(init.resolvedConfig.root, symbol.filePath, symbol.id),
    ]),
  )
  const routeManifest = createRouteManifest(routes, (entry) =>
    deps.createDevModuleUrl(init.resolvedConfig.root, entry),
  )
  const appHooksPath = path.join(init.resolvedConfig.root, 'app/+hooks.ts')
  const serverHooksPath = path.join(init.resolvedConfig.root, 'app/+hooks.server.ts')
  const appHooks = (await loadOptionalHookModule<AppHooksModule>(
    init.runner,
    appHooksPath,
  )) as AppHooksModule
  const serverHooks = (await loadOptionalHookModule<ServerHooksModule>(
    init.runner,
    serverHooksPath,
  )) as ServerHooksModule
  const appHooksManifest = {
    client: (await fileExists(appHooksPath)) ? '/app/+hooks.ts' : null,
  }

  await serverHooks.init?.()

  const prepareRequestContext = <E extends Context>(c: E) => {
    attachRequestFetch(
      c as unknown as AppContext,
      createRequestFetch(c as unknown as AppContext, serverHooks.handleFetch),
    )
    return c as unknown as AppContext
  }

  const reroutePathname = (request: Request | null, pathname: string, baseUrl: string) =>
    normalizeRoutePath(resolveReroute(appHooks.reroute, request, pathname, baseUrl))

  const getRouteServerAccess = (route: RouteEntry) =>
    routeServerAccessByRoute.get(route) ?? {
      actionIds: new Set<string>(),
      loaderIds: new Set<string>(),
      route,
    }

  const resolveRouteForCurrentUrl = (request: Request | null, currentUrl: URL) => {
    const resolvedPathname = reroutePathname(
      request,
      normalizeRoutePath(currentUrl.pathname),
      currentUrl.href,
    )
    const match = matchRoute(routes, resolvedPathname)
    if (match?.route.page) {
      return match
    }
    const fallback = findSpecialRoute(routes, resolvedPathname, 'notFound')
    if (fallback?.route.notFound) {
      return fallback
    }
    return null
  }

  const getRpcCurrentRoute = (requestContext: AppContext) => {
    const requestUrl = getRequestUrl(requestContext.req.raw)
    const routeUrlHeader = requestContext.req.header(ROUTE_RPC_URL_HEADER)
    if (!routeUrlHeader) {
      return null
    }
    let currentUrl: URL
    try {
      currentUrl = new URL(routeUrlHeader, requestUrl)
    } catch {
      return null
    }
    if (currentUrl.origin !== requestUrl.origin) {
      return null
    }
    return resolveRouteForCurrentUrl(requestContext.req.raw, currentUrl)
  }

  const resolveRequest = async <E extends Context>(
    c: E,
    handler: (requestContext: AppContext) => Promise<Response>,
  ) => {
    const requestContext = prepareRequestContext(c)
    const execute = (nextContext = requestContext) =>
      withServerRequestContext(
        nextContext,
        {
          handleError: serverHooks.handleError,
          transport: appHooks.transport,
        },
        () => handler(nextContext),
      )

    if (!serverHooks.handle) {
      return execute(requestContext)
    }

    return withServerRequestContext(
      requestContext,
      {
        handleError: serverHooks.handleError,
        transport: appHooks.transport,
      },
      () =>
        serverHooks.handle!(requestContext, (nextContext) =>
          execute(nextContext ?? requestContext),
        ),
    )
  }

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
    c: AppContext,
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

  const invokeRouteServer = async (filePath: string, c: AppContext, params: RouteParams) => {
    applyRequestParams(c, params)
    const mod = await init.runner.import(filePath)
    const methodHandler = mod[c.req.method] as
      | ((context: AppContext) => Response | Promise<Response>)
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
    c: AppContext,
    modulePath: string,
    status = 200,
    options?: {
      prepare?: (container: any) => void | Promise<void>
      routeError?: unknown
    },
  ) => {
    ensureActionCsrfToken(c)
    const [
      _primedModules,
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
        fileExists(modulePath).then((exists) =>
          exists ? primeCompilerCache(modulePath) : undefined,
        ),
        ...route.layouts.map((layout) =>
          fileExists(layout.filePath).then((exists) =>
            exists ? primeCompilerCache(layout.filePath) : undefined,
          ),
        ),
      ]),
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
    const serializeAppResumePayload = (payload: unknown) =>
      serializeResumePayload(
        replaceResumePayloadPlaceholderValue(payload, {
          [ROUTE_MANIFEST_PLACEHOLDER]: JSON.stringify(routeManifest),
          [APP_HOOKS_PLACEHOLDER]: JSON.stringify(appHooksManifest),
        }) as Parameters<typeof serializeResumePayload>[0],
      )
    const metadata = composeRouteMetadata(
      [...layoutModules.map((module) => module.metadata ?? null), pageModule.metadata ?? null],
      {
        params,
        url: getRequestUrl(c.req.raw),
      },
    )

    const document = jsxDEV(
      SSRRoot as any,
      {
        children: createRouteElement(
          pathname,
          params,
          Page,
          Layouts,
          options?.routeError,
        ) as SSRRootProps['children'],
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
                  children: APP_HOOKS_PLACEHOLDER,
                  id: APP_HOOKS_ELEMENT_ID,
                  type: 'application/eclipsa-app-hooks+json',
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
      } satisfies SSRRootProps,
      null,
      false,
      {},
    )

    applyRequestParams(c, params)
    const { html, payload, chunks } = await renderSSRStream(() => document, {
      prepare(container: any) {
        primeLocationState(container, getRequestUrl(c.req.raw))
        return options?.prepare?.(container)
      },
      resolvePendingLoaders: async (container: any) => resolvePendingLoaders(container, c),
      symbols: symbolUrls,
    })
    const shellHtml = replaceHeadPlaceholder(
      replaceHeadPlaceholder(
        replaceHeadPlaceholder(
          html,
          RESUME_PAYLOAD_PLACEHOLDER,
          serializeAppResumePayload(payload),
        ),
        ROUTE_MANIFEST_PLACEHOLDER,
        escapeJSONScriptText(JSON.stringify(routeManifest)),
      ),
      APP_HOOKS_PLACEHOLDER,
      escapeJSONScriptText(JSON.stringify(appHooksManifest)),
    )
    const { prefix, suffix } = splitHtmlForStreaming(shellHtml)
    const encoder = new TextEncoder()

    return applyActionCsrfCookie(
      new Response(
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
                      `<script id="${payloadId}" type="application/eclipsa-resume+json">${serializeAppResumePayload(chunk.payload)}</script>` +
                      `<script>window.__eclipsa_stream.enqueue({boundaryId:${JSON.stringify(chunk.boundaryId)},payloadScriptId:${JSON.stringify(payloadId)},templateId:${JSON.stringify(templateId)}})</script>`,
                  ),
                )
              }

              controller.enqueue(
                encoder.encode(
                  `<script id="${RESUME_FINAL_STATE_ELEMENT_ID}" type="application/eclipsa-resume+json">${serializeAppResumePayload(latestPayload)}</script>${suffix}`,
                ),
              )
              controller.close()
            })().catch((error) => {
              controller.error(error)
            })
          },
        }),
        { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
      ),
      c,
    )
  }

  const renderMatchedPage = async (
    match: { params: RouteParams; route: RouteEntry },
    c: AppContext,
    options?: {
      prepare?: (container: any) => void | Promise<void>
      routeError?: unknown
    },
  ) => {
    const requestUrl = getRequestUrl(c.req.raw)
    const requestPathname = normalizeRoutePath(requestUrl.pathname)
    const resolvedPathname = reroutePathname(c.req.raw, requestPathname, requestUrl.href)
    try {
      return await renderRouteResponse(
        match.route,
        requestPathname,
        match.params,
        c,
        match.route.page!.filePath,
        200,
        options,
      )
    } catch (error) {
      const publicError = await toPublicErrorValue(init.devServer, serverHooks, c, error, 'page')
      const fallback = isNotFoundError(error)
        ? findSpecialRoute(routes, resolvedPathname, 'notFound')
        : findSpecialRoute(routes, resolvedPathname, 'error')
      const module = fallback?.route[isNotFoundError(error) ? 'notFound' : 'error']
      if (!fallback || !module) {
        return c.text(
          isNotFoundError(error) ? 'Not Found' : 'Internal Server Error',
          isNotFoundError(error) ? 404 : 500,
        )
      }
      return renderRouteResponse(
        fallback.route,
        requestPathname,
        fallback.params,
        c,
        module.filePath,
        isNotFoundError(error) ? 404 : 500,
        {
          ...options,
          routeError: publicError,
        },
      )
    }
  }

  const renderRouteDataResponse = async (
    route: RouteEntry,
    pathname: string,
    params: RouteParams,
    c: AppContext,
    modulePath: string,
    kind: RouteDataResponse['kind'],
  ) => {
    const [_primedModules, modules, { renderSSRAsync, resolvePendingLoaders }] = await Promise.all([
      Promise.all([
        fileExists(modulePath).then((exists) =>
          exists ? primeCompilerCache(modulePath) : undefined,
        ),
        ...route.layouts.map((layout) =>
          fileExists(layout.filePath).then((exists) =>
            exists ? primeCompilerCache(layout.filePath) : undefined,
          ),
        ),
      ]),
      Promise.all([
        init.runner.import(modulePath),
        ...route.layouts.map((layout) => init.runner.import(layout.filePath)),
      ]),
      init.runner.import('eclipsa'),
    ])
    const [pageModule, ...layoutModules] = modules as Array<{
      default: (props: unknown) => unknown
    }>
    const { default: Page } = pageModule
    const Layouts = layoutModules.map((module) => module.default)

    applyRequestParams(c, params)
    const { payload } = await renderSSRAsync(
      () => createRouteElement(pathname, params, Page, Layouts, undefined),
      {
        prepare(container: any) {
          primeLocationState(container, getRequestUrl(c.req.raw))
        },
        resolvePendingLoaders: async (container: any) => resolvePendingLoaders(container, c),
        symbols: symbolUrls,
      },
    )

    return c.json({
      finalHref: getRequestUrl(c.req.raw).href,
      finalPathname: pathname,
      kind,
      loaders: payload.loaders,
      ok: true,
    } satisfies RouteDataResponse)
  }

  const renderRouteData = async (
    route: RouteEntry,
    pathname: string,
    params: RouteParams,
    c: AppContext,
    modulePath: string,
    kind: RouteDataResponse['kind'],
  ) => {
    const requestUrl = getRequestUrl(c.req.raw)
    const requestPathname = normalizeRoutePath(requestUrl.pathname)
    const resolvedPathname = reroutePathname(c.req.raw, requestPathname, requestUrl.href)
    try {
      return await renderRouteDataResponse(route, pathname, params, c, modulePath, kind)
    } catch (error) {
      if (!isNotFoundError(error)) {
        return c.json({ document: true, ok: false })
      }

      const fallback = findSpecialRoute(routes, resolvedPathname, 'notFound')
      if (!fallback?.route.notFound) {
        return c.json({ document: true, ok: false })
      }

      try {
        return await renderRouteDataResponse(
          fallback.route,
          requestPathname,
          fallback.params,
          c,
          fallback.route.notFound.filePath,
          'not-found',
        )
      } catch {
        return c.json({ document: true, ok: false })
      }
    }
  }

  const resolveRouteData = async (href: string, c: AppContext) => {
    const requestUrl = getRequestUrl(c.req.raw)
    const targetUrl = new URL(href, requestUrl)
    if (targetUrl.origin !== requestUrl.origin) {
      return c.json({ document: true, ok: false })
    }
    const headers = new Headers(c.req.raw.headers)
    headers.set(ROUTE_DATA_REQUEST_HEADER, '1')
    const response = await app.fetch(
      new Request(createInternalRouteRequestUrl(c.req.raw, targetUrl), {
        headers,
        method: 'GET',
        redirect: 'manual',
      }),
    )
    if (response.status >= 200 && response.status < 300) {
      return response
    }
    if (isRedirectResponse(response)) {
      return c.json({
        location: new URL(response.headers.get('location')!, requestUrl).href,
        ok: false,
      })
    }
    return c.json({ document: true, ok: false })
  }

  const resolveRoutePreflight = async (href: string, c: AppContext) => {
    const requestUrl = getRequestUrl(c.req.raw)
    const targetUrl = new URL(href, requestUrl)
    if (targetUrl.origin !== requestUrl.origin) {
      return c.json({ document: true, ok: false })
    }

    const target = resolvePreflightTarget(
      reroutePathname(
        new Request(targetUrl.href),
        normalizeRoutePath(targetUrl.pathname),
        targetUrl.href,
      ),
    )
    if (!target) {
      return c.json({ ok: true })
    }

    const headers = new Headers(c.req.raw.headers)
    headers.set(ROUTE_PREFLIGHT_REQUEST_HEADER, '1')
    const response = await app.fetch(
      new Request(createInternalRouteRequestUrl(c.req.raw, targetUrl), {
        headers,
        method: 'GET',
        redirect: 'manual',
      }),
    )

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

  const resolveRequestRoute = (request: Request, url: string) => {
    const requestPathname = normalizeRoutePath(new URL(url).pathname)
    const resolvedPathname = reroutePathname(request, requestPathname, url)
    return {
      match: matchRoute(routes, resolvedPathname),
      requestPathname,
      resolvedPathname,
    }
  }

  app.post('/__eclipsa/action/:id', async (c) =>
    resolveRequest(c, async (requestContext) => {
      const { executeAction, hasAction } = await init.runner.import('eclipsa')
      const id = requestContext.req.param('id')
      if (!id) {
        return requestContext.text('Not Found', 404)
      }
      const routeMatch = getRpcCurrentRoute(requestContext)
      if (!routeMatch) {
        return requestContext.text('Bad Request', 400)
      }
      const routeAccess = getRouteServerAccess(routeMatch.route)
      if (!routeAccess.actionIds.has(id)) {
        return requestContext.text('Not Found', 404)
      }
      const modulePath = actionModules.get(id)
      if (!modulePath) {
        return requestContext.text('Not Found', 404)
      }
      if (!hasAction(id)) {
        await init.runner.import(modulePath)
      }
      return composeRouteMiddlewares(
        routeMatch.route,
        requestContext,
        routeMatch.params,
        async () => executeAction(id, requestContext),
      ) as Promise<Response>
    }),
  )

  app.get('/__eclipsa/loader/:id', async (c) =>
    resolveRequest(c, async (requestContext) => {
      const { executeLoader, hasLoader } = await init.runner.import('eclipsa')
      const id = requestContext.req.param('id')
      if (!id) {
        return requestContext.text('Not Found', 404)
      }
      const routeMatch = getRpcCurrentRoute(requestContext)
      if (!routeMatch) {
        return requestContext.text('Bad Request', 400)
      }
      const routeAccess = getRouteServerAccess(routeMatch.route)
      if (!routeAccess.loaderIds.has(id)) {
        return requestContext.text('Not Found', 404)
      }
      const modulePath = loaderModules.get(id)
      if (!modulePath) {
        return requestContext.text('Not Found', 404)
      }
      if (!hasLoader(id)) {
        await init.runner.import(modulePath)
      }
      return composeRouteMiddlewares(
        routeMatch.route,
        requestContext,
        routeMatch.params,
        async () => executeLoader(id, requestContext),
      ) as Promise<Response>
    }),
  )

  app.get(ROUTE_PREFLIGHT_ENDPOINT, async (c) =>
    resolveRequest(c, async (requestContext) => {
      const href = requestContext.req.query('href')
      if (!href) {
        return requestContext.json({ document: true, ok: false }, 400)
      }
      return resolveRoutePreflight(href, requestContext)
    }),
  )

  app.get(ROUTE_DATA_ENDPOINT, async (c) =>
    resolveRequest(c, async (requestContext) => {
      const href = requestContext.req.query('href')
      if (!href) {
        return requestContext.json({ document: true, ok: false }, 400)
      }
      return resolveRouteData(href, requestContext)
    }),
  )

  app.all('*', async (c) =>
    resolveRequest(c, async (requestContext) => {
      const { match, requestPathname, resolvedPathname } = resolveRequestRoute(
        requestContext.req.raw,
        requestContext.req.url,
      )

      if (!match) {
        const fallback = findSpecialRoute(routes, resolvedPathname, 'notFound')
        if (fallback?.route.notFound) {
          return composeRouteMiddlewares(
            fallback.route,
            requestContext,
            fallback.params,
            async () =>
              requestContext.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === '1'
                ? requestContext.body(null, 204)
                : requestContext.req.header(ROUTE_DATA_REQUEST_HEADER) === '1'
                  ? renderRouteData(
                      fallback.route,
                      requestPathname,
                      fallback.params,
                      requestContext,
                      fallback.route.notFound!.filePath,
                      'not-found',
                    )
                  : renderRouteResponse(
                      fallback.route,
                      requestPathname,
                      fallback.params,
                      requestContext,
                      fallback.route.notFound!.filePath,
                      404,
                    ),
          )
        }
        return requestContext.text('Not Found', 404)
      }

      if (
        (requestContext.req.method === 'GET' || requestContext.req.method === 'HEAD') &&
        match.route.page
      ) {
        const page = match.route.page
        return composeRouteMiddlewares(match.route, requestContext, match.params, async () =>
          requestContext.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === '1'
            ? requestContext.body(null, 204)
            : requestContext.req.header(ROUTE_DATA_REQUEST_HEADER) === '1'
              ? renderRouteData(
                  match.route,
                  requestPathname,
                  match.params,
                  requestContext,
                  page.filePath,
                  'page',
                )
              : renderMatchedPage(match, requestContext),
        )
      }

      if (requestContext.req.method === 'POST' && match.route.page) {
        return composeRouteMiddlewares(match.route, requestContext, match.params, async () => {
          const {
            ACTION_CONTENT_TYPE,
            deserializePublicValue,
            executeAction,
            getNormalizedActionInput,
            getActionFormSubmissionId,
            hasAction,
            primeActionState,
          } = await init.runner.import('eclipsa')
          const actionId = await getActionFormSubmissionId(requestContext)
          if (!actionId) {
            return match.route.server
              ? invokeRouteServer(match.route.server.filePath, requestContext, match.params)
              : renderMatchedPage(match, requestContext)
          }
          const routeAccess = getRouteServerAccess(match.route)
          if (!routeAccess.actionIds.has(actionId)) {
            return requestContext.text('Not Found', 404)
          }
          const modulePath = actionModules.get(actionId)
          if (!modulePath) {
            return requestContext.text('Not Found', 404)
          }
          if (!hasAction(actionId)) {
            await init.runner.import(modulePath)
          }
          const input = await getNormalizedActionInput(requestContext)
          const response = await executeAction(actionId, requestContext)
          const contentType = response.headers.get('content-type') ?? ''
          if (!contentType.startsWith(ACTION_CONTENT_TYPE)) {
            return response
          }
          const body = (await response.json()) as
            | { error: unknown; ok: false }
            | { ok: true; value: unknown }
          return renderMatchedPage(match, requestContext, {
            prepare(container) {
              primeActionState(container, actionId, {
                error: body.ok ? undefined : deserializePublicValue(body.error as any),
                input,
                result: body.ok ? deserializePublicValue(body.value as any) : undefined,
              })
            },
          })
        })
      }

      if (match.route.server) {
        return composeRouteMiddlewares(match.route, requestContext, match.params, async () =>
          invokeRouteServer(match.route.server!.filePath, requestContext, match.params),
        )
      }

      if (match.route.page) {
        return composeRouteMiddlewares(match.route, requestContext, match.params, async () =>
          requestContext.req.header(ROUTE_PREFLIGHT_REQUEST_HEADER) === '1'
            ? requestContext.body(null, 204)
            : renderMatchedPage(match, requestContext),
        )
      }

      return requestContext.text('Not Found', 404)
    }),
  )

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
