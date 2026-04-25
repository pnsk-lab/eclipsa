import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteEntry } from '../utils/routing.ts'
import { ROUTE_RPC_URL_HEADER } from '../../core/router-shared.ts'

const mocks = vi.hoisted(() => ({
  collectAppActions: vi.fn<() => Promise<Array<{ filePath: string; id: string }>>>(),
  collectAppLoaders: vi.fn<() => Promise<Array<{ filePath: string; id: string }>>>(),
  collectAppSymbols: vi.fn<() => Promise<Array<{ filePath: string; id: string }>>>(),
  collectReachableAnalyzableFiles: vi.fn<(entryFiles: readonly string[]) => Promise<string[]>>(),
  createRouteManifest: vi.fn(),
  createRoutes: vi.fn<() => Promise<RouteEntry[]>>(),
  toSSG: vi.fn(),
}))

vi.mock('hono/ssg', () => ({
  toSSG: mocks.toSSG,
}))

vi.mock('../utils/routing.ts', () => ({
  createBuildModuleUrl: vi.fn((entry: { entryName: string }) => `/entries/${entry.entryName}.js`),
  createBuildServerModuleUrl: vi.fn(
    (entry: { entryName: string }) => `./entries/${entry.entryName}.mjs`,
  ),
  createRouteManifest: mocks.createRouteManifest,
  createRoutes: mocks.createRoutes,
  normalizeRoutePath: vi.fn((pathname: string) => {
    const normalizedPath = pathname.trim() || '/'
    const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
    return withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')
      ? withLeadingSlash.slice(0, -1)
      : withLeadingSlash
  }),
}))

vi.mock('../compiler.ts', () => ({
  collectAppActions: mocks.collectAppActions,
  collectAppLoaders: mocks.collectAppLoaders,
  collectAppSymbols: mocks.collectAppSymbols,
  collectReachableAnalyzableFiles: mocks.collectReachableAnalyzableFiles,
  createBuildServerActionUrl: vi.fn((id: string) => `/__eclipsa/action/${id}`),
  createBuildServerLoaderUrl: vi.fn((id: string) => `/__eclipsa/loader/${id}`),
  createBuildSymbolUrl: vi.fn((id: string) => `/entries/symbol__${id}.js`),
}))

import { build, resolveStaticPathInfo, toHonoRoutePaths } from './mod.ts'

const createBuilder = () =>
  ({
    build: vi.fn(async () => undefined),
    environments: {
      client: { name: 'client' },
      ssr: { name: 'ssr' },
    },
  }) as any

const writeMinimalRuntimeEntry = async (
  root: string,
  options?: {
    applyActionCsrfCookieSource?: string
    attachRequestFetchSource?: string
    createRequestFetchSource?: string
    executeActionSource?: string
    executeLoaderSource?: string
    escapeInlineScriptTextSource?: string
    escapeJSONScriptTextSource?: string
    ensureActionCsrfTokenSource?: string
    injectMissingActionCsrfInputsSource?: string
    getActionFormSubmissionIdSource?: string
    getNormalizedActionInputSource?: string
    hasActionSource?: string
    hasLoaderSource?: string
    jsxDEVSource?: string
    renderSSRAsyncSource?: string
    renderSSRStreamSource?: string
    serializeResumePayloadSource?: string
  },
) => {
  const entriesDir = path.join(root, 'dist/ssr/entries')
  await fs.mkdir(entriesDir, { recursive: true })
  await fs.writeFile(
    path.join(entriesDir, 'eclipsa_runtime.mjs'),
    [
      'export const Fragment = Symbol.for("fragment");',
      options?.applyActionCsrfCookieSource ??
        'export const applyActionCsrfCookie = (response) => response;',
      options?.attachRequestFetchSource ?? 'export const attachRequestFetch = () => undefined;',
      options?.createRequestFetchSource ?? 'export const createRequestFetch = () => undefined;',
      options?.executeActionSource ??
        'export const executeAction = async () => new Response(null, { status: 204 });',
      options?.executeLoaderSource ??
        'export const executeLoader = async () => new Response(null, { status: 204 });',
      options?.escapeInlineScriptTextSource ??
        'export const escapeInlineScriptText = (value) => value;',
      options?.escapeJSONScriptTextSource ??
        'export const escapeJSONScriptText = (value) => value;',
      options?.ensureActionCsrfTokenSource ?? 'export const ensureActionCsrfToken = () => "csrf";',
      options?.injectMissingActionCsrfInputsSource ??
        'export const injectMissingActionCsrfInputs = (html) => html;',
      options?.hasActionSource ?? 'export const hasAction = () => false;',
      options?.hasLoaderSource ?? 'export const hasLoader = () => false;',
      options?.jsxDEVSource ?? 'export const jsxDEV = () => ({});',
      options?.renderSSRAsyncSource ??
        'export const renderSSRAsync = async () => ({ html: "<html><head></head><body></body></html>", payload: {} });',
      options?.renderSSRStreamSource ??
        'export const renderSSRStream = async () => ({ chunks: (async function* () {})(), html: "<html><head></head><body></body></html>", payload: {} });',
      'export const resolvePendingLoaders = async () => undefined;',
      options?.serializeResumePayloadSource ?? 'export const serializeResumePayload = () => "{}";',
      'export const composeRouteMetadata = () => null;',
      'export const renderRouteMetadataHead = () => [];',
      'export const deserializePublicValue = (value) => value;',
      options?.getActionFormSubmissionIdSource ??
        'export const getActionFormSubmissionId = async () => null;',
      options?.getNormalizedActionInputSource ??
        'export const getNormalizedActionInput = async () => null;',
      'export const getStreamingResumeBootstrapScriptContent = () => "";',
      'export const markPublicError = (_, value) => value;',
      'export const primeActionState = () => undefined;',
      'export const primeLocationState = () => undefined;',
      'export const resolveReroute = (_, __, pathname) => pathname;',
      'export const runHandleError = async () => ({ message: "error" });',
      'export const withServerRequestContext = (_, __, fn) => fn();',
      'export const APP_HOOKS_ELEMENT_ID = "e-app-hooks";',
      'export const RESUME_FINAL_STATE_ELEMENT_ID = "e-resume-final";',
      'export const ACTION_CONTENT_TYPE = "application/eclipsa-action+json";',
      '',
    ].join('\n'),
  )
}

const writeMinimalSsrEntries = async (root: string) => {
  const entriesDir = path.join(root, 'dist/ssr/entries')
  const assetsDir = path.join(root, 'dist/client/assets')
  const clientEntriesDir = path.join(root, 'dist/client/entries')
  const clientChunksDir = path.join(root, 'dist/client/chunks')

  await fs.mkdir(entriesDir, { recursive: true })
  await fs.mkdir(assetsDir, { recursive: true })
  await fs.mkdir(clientEntriesDir, { recursive: true })
  await fs.mkdir(clientChunksDir, { recursive: true })
  await fs.writeFile(
    path.join(entriesDir, 'server_entry.mjs'),
    'import { Hono } from "hono"; const app = new Hono(); export default app;\n',
  )
  await fs.writeFile(path.join(entriesDir, 'ssr_root.mjs'), 'export default (props) => props;\n')
  await fs.writeFile(path.join(clientEntriesDir, 'client_boot.js'), 'console.log("boot");\n')
  await fs.writeFile(path.join(clientChunksDir, 'shared.js'), 'export const shared = true;\n')
  await writeMinimalRuntimeEntry(root)
}

const writeBuiltPageModule = async (root: string, entryName: string, source: string) => {
  const entriesDir = path.join(root, 'dist/ssr/entries')
  await fs.mkdir(entriesDir, { recursive: true })
  await fs.writeFile(path.join(entriesDir, `${entryName}.mjs`), source)
}

const createRootRoute = (): RouteEntry => ({
  error: null,
  layouts: [],
  loading: null,
  middlewares: [],
  notFound: null,
  page: {
    entryName: 'route__page',
    filePath: '/tmp/app/+page.tsx',
  },
  routePath: '/',
  segments: [],
  server: null,
})

const writeAppSource = async (
  root: string,
  relativePath: string,
  source = 'export default () => null;\n',
) => {
  const filePath = path.join(root, 'app', relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, source)
  return filePath
}

describe('toHonoRoutePaths', () => {
  it('expands optional segments into concrete Hono paths', () => {
    expect(
      toHonoRoutePaths([
        { kind: 'optional', value: 'lang' },
        { kind: 'static', value: 'docs' },
        { kind: 'required', value: 'slug' },
      ]),
    ).toEqual(['/docs/:slug', '/:lang/docs/:slug'])
  })
})

describe('resolveStaticPathInfo', () => {
  it('builds concrete paths for catch-all params', () => {
    expect(
      resolveStaticPathInfo(
        '/docs/[...slug]',
        [
          { kind: 'static', value: 'docs' },
          { kind: 'rest', value: 'slug' },
        ],
        { slug: ['guide', 'getting-started'] },
      ),
    ).toEqual({
      concretePath: '/docs/guide/getting-started',
      honoParams: {
        slug: 'guide/getting-started',
      },
      honoPatternPath: '/docs/:slug{.+}',
    })
  })
})

describe('build', () => {
  beforeEach(() => {
    mocks.collectAppActions.mockResolvedValue([])
    mocks.collectAppLoaders.mockResolvedValue([])
    mocks.collectAppSymbols.mockResolvedValue([])
    mocks.collectReachableAnalyzableFiles.mockImplementation(
      async (entryFiles: readonly string[]) => [...entryFiles],
    )
    mocks.createRouteManifest.mockReturnValue([])
    mocks.createRoutes.mockResolvedValue([createRootRoute()])
    mocks.toSSG.mockReset()
  })

  it('keeps node output on the existing server bundle path', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-node-'))
    const builder = createBuilder()

    await build(builder, { root }, { output: 'node' })

    expect(builder.build).toHaveBeenCalledTimes(2)
    expect(await fs.readFile(path.join(root, 'dist/server/index.mjs'), 'utf8')).toContain(
      '../ssr/eclipsa_app.mjs',
    )
    expect(await fs.readFile(path.join(root, 'dist/ssr/eclipsa_app.mjs'), 'utf8')).toContain(
      'const pageRouteEntries = [{"path":"/","routeIndex":0}];',
    )
    expect(mocks.toSSG).not.toHaveBeenCalled()
  })

  it('renders the built SSR root through jsxDEV instead of calling the component directly', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-root-jsx-'))
    const builder = createBuilder()

    await build(builder, { root }, { output: 'node' })

    const appSource = await fs.readFile(path.join(root, 'dist/ssr/eclipsa_app.mjs'), 'utf8')

    expect(appSource).toContain('const document = jsxDEV(SSRRoot, {')
    expect(appSource).not.toContain('const document = SSRRoot({')
  })

  it('replaces every built app-shell placeholder occurrence before responding', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-placeholder-replace-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root, {
      renderSSRStreamSource: [
        'export const renderSSRStream = async () => ({',
        '  chunks: (async function* () {})(),',
        '  html: "<html><head>" +',
        '    "<script type=\\"application/eclipsa-resume+json\\">__ECLIPSA_RESUME_PAYLOAD__</script>" +',
        '    "<script type=\\"application/eclipsa-route-manifest+json\\">__ECLIPSA_ROUTE_MANIFEST__</script>" +',
        '    "<script type=\\"application/eclipsa-app-hooks+json\\">__ECLIPSA_APP_HOOKS__</script>" +',
        '    "<script>__ECLIPSA_CHUNK_CACHE__</script>" +',
        '    "<script type=\\"application/eclipsa-resume+json\\">__ECLIPSA_RESUME_PAYLOAD__</script>" +',
        '    "<script type=\\"application/eclipsa-route-manifest+json\\">__ECLIPSA_ROUTE_MANIFEST__</script>" +',
        '    "<script type=\\"application/eclipsa-app-hooks+json\\">__ECLIPSA_APP_HOOKS__</script>" +',
        '    "<script>__ECLIPSA_CHUNK_CACHE__</script>" +',
        '    "</head><body></body></html>",',
        '  payload: {},',
        '});',
      ].join('\n'),
    })
    await writeBuiltPageModule(root, 'route__page', 'export default () => null;\n')

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const response = await app.fetch(new Request('http://localhost/'))
    const html = await response.text()

    expect(html).not.toContain('__ECLIPSA_RESUME_PAYLOAD__')
    expect(html).not.toContain('__ECLIPSA_ROUTE_MANIFEST__')
    expect(html).not.toContain('__ECLIPSA_APP_HOOKS__')
    expect(html).not.toContain('__ECLIPSA_CHUNK_CACHE__')
  })

  it('replaces finite head placeholders inside serialized built resume payloads', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-payload-placeholder-replace-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root, {
      renderSSRStreamSource: [
        'export const renderSSRStream = async () => ({',
        '  chunks: (async function* () {})(),',
        '  html: "<html><head></head><body></body></html>",',
        '  payload: {',
        '    components: {',
        '      c0: {',
        '        props: {',
        '          head: {',
        '            children: [',
        '              { props: { children: "__ECLIPSA_ROUTE_MANIFEST__" }, type: "script" },',
        '              { props: { children: "__ECLIPSA_APP_HOOKS__" }, type: "script" },',
        '              { props: { dangerouslySetInnerHTML: "__ECLIPSA_CHUNK_CACHE__" }, type: "script" },',
        '            ],',
        '            type: "fragment",',
        '          },',
        '        },',
        '      },',
        '    },',
        '  },',
        '});',
      ].join('\n'),
      serializeResumePayloadSource:
        'export const serializeResumePayload = (payload) => JSON.stringify(payload);',
    })
    await writeBuiltPageModule(root, 'route__page', 'export default () => null;\n')

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const response = await app.fetch(new Request('http://localhost/'))
    const html = await response.text()

    expect(html).not.toContain('__ECLIPSA_ROUTE_MANIFEST__')
    expect(html).not.toContain('__ECLIPSA_APP_HOOKS__')
    expect(html).not.toContain('__ECLIPSA_CHUNK_CACHE__')
    expect(html).toContain('"children":"[]"')
    expect(html).toContain('{\\"client\\":null,\\"routeDataEndpoint\\":true}')
    expect(html).toContain('eclipsa-chunk-cache-sw.js')
  })

  it('serves route-data loader snapshots from the built node app', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-route-data-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root, {
      renderSSRAsyncSource:
        'export const renderSSRAsync = async () => ({ html: "<html></html>", payload: { loaders: { profile: { data: { name: "Ada" }, error: null, loaded: true } } } });',
    })
    await writeBuiltPageModule(root, 'route__page', 'export default () => null;\n')

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const response = await app.fetch(
      new Request(
        'http://127.0.0.1:4173/__eclipsa/route-data?href=http%3A%2F%2F127.0.0.1%3A4173%2F',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      finalHref: 'http://127.0.0.1:4173/',
      finalPathname: '/',
      kind: 'page',
      loaders: {
        profile: {
          data: { name: 'Ada' },
          error: null,
          loaded: true,
        },
      },
      ok: true,
    })
  })

  it('returns middleware redirects from the built route-data endpoint', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-route-data-redirect-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeBuiltPageModule(root, 'route__guarded__page', 'export default () => null;\n')
    await writeBuiltPageModule(
      root,
      'special__guarded__middleware',
      'export default (c) => c.redirect("/counter");\n',
    )
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        middlewares: [
          {
            entryName: 'special__guarded__middleware',
            filePath: '/tmp/app/guarded/+middleware.ts',
          },
        ],
        page: {
          entryName: 'route__guarded__page',
          filePath: '/tmp/app/guarded/+page.tsx',
        },
        routePath: '/guarded',
        segments: [{ kind: 'static', value: 'guarded' }],
      },
    ])

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const response = await app.fetch(
      new Request('http://localhost/__eclipsa/route-data?href=http%3A%2F%2Flocalhost%2Fguarded'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      location: 'http://localhost/counter',
      ok: false,
    })
  })

  it('keeps built route-preflight dispatches in-process even when the host header is spoofed', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-route-preflight-ssrf-'))
    const builder = createBuilder()
    const originalFetch = globalThis.fetch
    const externalFetch = vi.fn(async () => new Response(null, { status: 204 }))
    globalThis.fetch = externalFetch as typeof fetch

    try {
      await writeMinimalSsrEntries(root)
      await writeMinimalRuntimeEntry(root, {
        attachRequestFetchSource:
          'export const attachRequestFetch = (c, fetchImpl) => c.set("fetch", fetchImpl);',
        createRequestFetchSource: 'export const createRequestFetch = () => globalThis.fetch;',
      })
      await writeBuiltPageModule(root, 'route__guarded__page', 'export default () => null;\n')
      await writeBuiltPageModule(
        root,
        'special__guarded__middleware',
        [
          'export default (c, next) => {',
          '  if (new URL(c.req.url).searchParams.get("allow") === "1") {',
          '    return next();',
          '  }',
          '  return c.redirect("/counter");',
          '};',
        ].join('\n'),
      )
      mocks.createRoutes.mockResolvedValue([
        {
          ...createRootRoute(),
          middlewares: [
            {
              entryName: 'special__guarded__middleware',
              filePath: '/tmp/app/guarded/+middleware.ts',
            },
          ],
          page: {
            entryName: 'route__guarded__page',
            filePath: '/tmp/app/guarded/+page.tsx',
          },
          routePath: '/guarded',
          segments: [{ kind: 'static', value: 'guarded' }],
        },
      ])

      await build(builder, { root }, { output: 'node' })

      const { default: app } = (await import(
        `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
      )) as {
        default: { fetch(request: Request): Promise<Response> }
      }

      const response = await app.fetch(
        new Request(
          'http://localhost/__eclipsa/route-preflight?href=http%3A%2F%2F169.254.169.254%2Fguarded%3Fallow%3D1',
          {
            headers: {
              host: '169.254.169.254',
            },
          },
        ),
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        ok: true,
      })
      expect(externalFetch).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('runs server hooks and route middleware for built action and loader rpc requests', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-rpc-route-'))
    const builder = createBuilder()
    const securePagePath = await writeAppSource(root, 'secure/[id]/+page.tsx')
    const publicPagePath = await writeAppSource(root, 'public/+page.tsx')
    await writeAppSource(
      root,
      '+hooks.server.ts',
      'export const handle = async (_c, resolve) => resolve(_c);\n',
    )
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root, {
      executeActionSource: [
        'export const executeAction = async (_id, c) =>',
        '  c.json({',
        '    guard: c.get("guard") ?? null,',
        '    handled: c.get("fromHandle") ?? null,',
        '    id: c.req.param("id") ?? null,',
        '  });',
      ].join('\n'),
      executeLoaderSource: [
        'export const executeLoader = async (_id, c) =>',
        '  c.json({',
        '    guard: c.get("guard") ?? null,',
        '    handled: c.get("fromHandle") ?? null,',
        '    id: c.req.param("id") ?? null,',
        '  });',
      ].join('\n'),
      hasActionSource: 'export const hasAction = () => true;',
      hasLoaderSource: 'export const hasLoader = () => true;',
    })
    await writeBuiltPageModule(root, 'route__secure___id___page', 'export default () => null;\n')
    await writeBuiltPageModule(root, 'route__public__page', 'export default () => null;\n')
    await writeBuiltPageModule(
      root,
      'special__secure__middleware',
      'export default async (c, next) => { c.set("guard", "secure"); await next(); };\n',
    )
    await writeBuiltPageModule(
      root,
      'server_hooks',
      'export const handle = async (c, resolve) => { c.set("fromHandle", "yes"); return resolve(c); };\n',
    )
    mocks.collectAppActions.mockResolvedValue([{ filePath: securePagePath, id: 'secure-action' }])
    mocks.collectAppLoaders.mockResolvedValue([{ filePath: securePagePath, id: 'secure-loader' }])
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        middlewares: [
          {
            entryName: 'special__secure__middleware',
            filePath: path.join(root, 'app/secure/+middleware.ts'),
          },
        ],
        page: {
          entryName: 'route__secure___id___page',
          filePath: securePagePath,
        },
        routePath: '/secure/[id]',
        segments: [
          { kind: 'static', value: 'secure' },
          { kind: 'required', value: 'id' },
        ],
      },
      {
        ...createRootRoute(),
        page: {
          entryName: 'route__public__page',
          filePath: publicPagePath,
        },
        routePath: '/public',
        segments: [{ kind: 'static', value: 'public' }],
      },
    ])

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const actionResponse = await app.fetch(
      new Request('http://localhost/__eclipsa/action/secure-action', {
        headers: {
          [ROUTE_RPC_URL_HEADER]: 'http://localhost/secure/123',
        },
        method: 'POST',
      }),
    )
    expect(actionResponse.status).toBe(200)
    await expect(actionResponse.json()).resolves.toEqual({
      guard: 'secure',
      handled: 'yes',
      id: '123',
    })

    const loaderResponse = await app.fetch(
      new Request('http://localhost/__eclipsa/loader/secure-loader', {
        headers: {
          [ROUTE_RPC_URL_HEADER]: 'http://localhost/secure/123',
        },
      }),
    )
    expect(loaderResponse.status).toBe(200)
    await expect(loaderResponse.json()).resolves.toEqual({
      guard: 'secure',
      handled: 'yes',
      id: '123',
    })

    const blockedResponse = await app.fetch(
      new Request('http://localhost/__eclipsa/action/secure-action', {
        headers: {
          [ROUTE_RPC_URL_HEADER]: 'http://localhost/public',
        },
        method: 'POST',
      }),
    )
    expect(blockedResponse.status).toBe(404)
  })

  it('runs server hooks for built page route requests', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-page-hooks-'))
    const builder = createBuilder()
    const secureServerPath = await writeAppSource(root, 'secure/[id]/+server.ts')
    await writeAppSource(
      root,
      '+hooks.server.ts',
      'export const handle = async (_c, resolve) => resolve(_c);\n',
    )
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root)
    await writeBuiltPageModule(
      root,
      'route__secure___id___server',
      'export const GET = (c) => c.json({ guard: c.get("guard") ?? null, handled: c.get("fromHandle") ?? null, id: c.req.param("id") ?? null });\n',
    )
    await writeBuiltPageModule(
      root,
      'special__secure__middleware',
      'export default async (c, next) => { c.set("guard", "secure"); await next(); };\n',
    )
    await writeBuiltPageModule(
      root,
      'server_hooks',
      'export const handle = async (c, resolve) => { c.set("fromHandle", "yes"); return resolve(c); };\n',
    )
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        middlewares: [
          {
            entryName: 'special__secure__middleware',
            filePath: path.join(root, 'app/secure/+middleware.ts'),
          },
        ],
        page: null,
        routePath: '/secure/[id]',
        segments: [
          { kind: 'static', value: 'secure' },
          { kind: 'required', value: 'id' },
        ],
        server: {
          entryName: 'route__secure___id___server',
          filePath: secureServerPath,
        },
      },
    ])

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const response = await app.fetch(new Request('http://localhost/secure/123'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      guard: 'secure',
      handled: 'yes',
      id: '123',
    })
  })

  it('rejects built form posts that target actions outside the current route graph', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-form-action-'))
    const builder = createBuilder()
    const securePagePath = await writeAppSource(root, 'secure/+page.tsx')
    const publicPagePath = await writeAppSource(root, 'public/+page.tsx')
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root, {
      executeActionSource:
        'export const executeAction = async () => new Response(null, { status: 204 });',
      getActionFormSubmissionIdSource: [
        'export const getActionFormSubmissionId = async (c) => {',
        '  const formData = await c.req.formData();',
        '  return formData.get("__e_action");',
        '};',
      ].join('\n'),
      hasActionSource: 'export const hasAction = () => true;',
    })
    await writeBuiltPageModule(root, 'route__secure__page', 'export default () => null;\n')
    await writeBuiltPageModule(root, 'route__public__page', 'export default () => null;\n')
    mocks.collectAppActions.mockResolvedValue([{ filePath: securePagePath, id: 'secure-action' }])
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        page: {
          entryName: 'route__secure__page',
          filePath: securePagePath,
        },
        routePath: '/secure',
        segments: [{ kind: 'static', value: 'secure' }],
      },
      {
        ...createRootRoute(),
        page: {
          entryName: 'route__public__page',
          filePath: publicPagePath,
        },
        routePath: '/public',
        segments: [{ kind: 'static', value: 'public' }],
      },
    ])

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const formData = new FormData()
    formData.set('__e_action', 'secure-action')
    const response = await app.fetch(
      new Request('http://localhost/public', {
        body: formData,
        method: 'POST',
      }),
    )

    expect(response.status).toBe(404)
  })

  it('serves not-found loader snapshots from the built route-data endpoint', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-route-data-not-found-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root, {
      renderSSRAsyncSource:
        'export const renderSSRAsync = async () => ({ html: "<html></html>", payload: { loaders: { missing: { data: null, error: { message: "missing" }, loaded: true } } } });',
    })
    await writeBuiltPageModule(root, 'route__page', 'export default () => null;\n')
    await writeBuiltPageModule(root, 'special___not_found', 'export default () => null;\n')
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        notFound: {
          entryName: 'special___not_found',
          filePath: '/tmp/app/+not-found.tsx',
        },
      },
    ])

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const response = await app.fetch(
      new Request('http://localhost/__eclipsa/route-data?href=http%3A%2F%2Flocalhost%2Fmissing'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      finalHref: 'http://localhost/missing',
      finalPathname: '/missing',
      kind: 'not-found',
      loaders: {
        missing: {
          data: null,
          error: { message: 'missing' },
          loaded: true,
        },
      },
      ok: true,
    })
  })

  it('keeps nearest dynamic params when built not-found route-data fallbacks resolve encoded paths', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-not-found-params-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root, {
      jsxDEVSource: 'export const jsxDEV = (type, props) => ({ type, props });',
      renderSSRAsyncSource: [
        'const resolveNode = (value) => {',
        '  if (!value || typeof value !== "object") return value;',
        '  if (typeof value.type === "function") return resolveNode(value.type(value.props ?? {}));',
        '  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveNode(entry)]));',
        '};',
        'export const renderSSRAsync = async (renderDocument) => ({',
        '  payload: {',
        '    loaders: {',
        '      params: {',
        '        data: resolveNode(renderDocument()).params,',
        '        error: null,',
        '        loaded: true,',
        '      },',
        '    },',
        '  },',
        '});',
      ].join('\n'),
    })
    await writeBuiltPageModule(
      root,
      'route__hello_world___slug____page',
      'export default () => null;\n',
    )
    await writeBuiltPageModule(
      root,
      'special__hello_world___slug____not_found',
      'export default (props) => ({ type: "not-found", params: props.__eclipsa_route_params });\n',
    )
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        notFound: {
          entryName: 'special__hello_world___slug____not_found',
          filePath: '/tmp/app/hello world/[slug]/+not-found.tsx',
        },
        page: {
          entryName: 'route__hello_world___slug____page',
          filePath: '/tmp/app/hello world/[slug]/+page.tsx',
        },
        routePath: '/hello world/[slug]',
        segments: [
          { kind: 'static', value: 'hello world' },
          { kind: 'required', value: 'slug' },
        ],
        server: null,
      },
    ])

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const response = await app.fetch(
      new Request(
        'http://localhost/__eclipsa/route-data?href=http%3A%2F%2Flocalhost%2Fhello%2520world%2Fada%2Fmissing',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      finalHref: 'http://localhost/hello%20world/ada/missing',
      finalPathname: '/hello%20world/ada/missing',
      kind: 'not-found',
      loaders: {
        params: {
          data: {
            slug: 'ada',
          },
          error: null,
          loaded: true,
        },
      },
      ok: true,
    })
  })

  it('returns document fallback when built route-data rendering throws notFound without a special route', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-route-data-document-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root, {
      renderSSRAsyncSource:
        'export const renderSSRAsync = async () => { throw { __eclipsa_not_found__: true }; };',
    })
    await writeBuiltPageModule(root, 'route__page', 'export default () => null;\n')

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const response = await app.fetch(
      new Request(
        'http://127.0.0.1:4173/__eclipsa/route-data?href=http%3A%2F%2F127.0.0.1%3A4173%2F',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      document: true,
      ok: false,
    })
  })

  it('prerenders static routes while keeping the node server bundle for dynamic routes', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-node-hybrid-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        renderMode: 'static',
      },
      {
        ...createRootRoute(),
        page: {
          entryName: 'route__dashboard__page',
          filePath: '/tmp/app/dashboard/+page.tsx',
        },
        renderMode: 'dynamic',
        routePath: '/dashboard',
        segments: [{ kind: 'static', value: 'dashboard' }],
      },
    ])
    mocks.toSSG.mockResolvedValue({
      files: ['index.html'],
      success: true,
    })

    await build(builder, { root }, { output: 'node' })

    expect(builder.build).toHaveBeenCalledTimes(2)
    expect(mocks.toSSG).toHaveBeenCalledTimes(1)
    const [, , options] = mocks.toSSG.mock.calls[0] as [
      { fetch(request: Request): Promise<Response> },
      typeof fs,
      {
        beforeRequestHook(request: Request): Request | false
        dir: string
      },
    ]
    expect(options.beforeRequestHook(new Request('http://localhost/'))).toBeInstanceOf(Request)
    expect(options.beforeRequestHook(new Request('http://localhost/dashboard'))).toBe(false)
    expect(await fs.readFile(path.join(root, 'dist/server/index.mjs'), 'utf8')).toContain(
      '../ssr/eclipsa_app.mjs',
    )
  })

  it('runs Hono toSSG for ssg output and skips non-page routes', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-ssg-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await fs.writeFile(path.join(root, 'dist/client/assets/layout.css'), 'body { color: white; }\n')
    mocks.toSSG.mockResolvedValue({
      files: ['index.html'],
      success: true,
    })

    await build(builder, { root }, { output: 'ssg' })

    expect(builder.build).toHaveBeenCalledTimes(2)
    expect(mocks.toSSG).toHaveBeenCalledTimes(1)
    const [app, fsModule, options] = mocks.toSSG.mock.calls[0] as [
      { fetch(request: Request): Promise<Response> },
      typeof fs,
      {
        beforeRequestHook(request: Request): Request | false
        dir: string
      },
    ]
    expect(typeof app.fetch).toBe('function')
    expect(typeof fsModule.writeFile).toBe('function')
    expect(options.dir).toBe(path.join(root, 'dist/client'))
    expect(options.beforeRequestHook(new Request('http://localhost/'))).toBeInstanceOf(Request)
    expect(options.beforeRequestHook(new Request('http://localhost/__eclipsa/loader/test'))).toBe(
      false,
    )
    expect(await fs.readFile(path.join(root, 'dist/ssr/eclipsa_app.mjs'), 'utf8')).toContain(
      'const stylesheetUrls = ["/assets/layout.css"];',
    )
    expect(await fs.readFile(path.join(root, 'dist/ssr/eclipsa_app.mjs'), 'utf8')).toContain(
      '"routeDataEndpoint":false',
    )
    await expect(fs.stat(path.join(root, 'dist/server'))).rejects.toThrow()
  })

  it('emits a chunk cache service worker and registers it from the built app shell', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-sw-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeBuiltPageModule(root, 'route__page', 'export default () => null;\n')

    await build(builder, { root }, { output: 'node' })

    await expect(
      fs.readFile(path.join(root, 'dist/client/eclipsa-chunk-cache-sw.js'), 'utf8'),
    ).resolves.toContain('const PATH_PREFIXES = ["/chunks/","/entries/"];')
    await expect(
      fs.readFile(path.join(root, 'dist/client/eclipsa-chunk-cache-sw.js'), 'utf8'),
    ).resolves.toContain('caches.open(CACHE_NAME)')
    await expect(
      fs.readFile(path.join(root, 'dist/client/eclipsa-chunk-cache-sw.js'), 'utf8'),
    ).resolves.toContain('isEntryRequest(event.request)')
    await expect(
      fs.readFile(path.join(root, 'dist/client/eclipsa-chunk-cache-sw.js'), 'utf8'),
    ).resolves.toContain('addEventListener("message"')
    await expect(
      fs.readFile(path.join(root, 'dist/ssr/eclipsa_app.mjs'), 'utf8'),
    ).resolves.toContain('/eclipsa-chunk-cache-sw.js')
    await expect(
      fs.readFile(path.join(root, 'dist/ssr/eclipsa_app.mjs'), 'utf8'),
    ).resolves.toContain('navigator.serviceWorker.register')
    await expect(
      fs.readFile(path.join(root, 'dist/ssr/eclipsa_app.mjs'), 'utf8'),
    ).resolves.toContain('eclipsa:chunk-cache-precache')
  })

  it('escapes chunk cache bootstrap scripts as inline javascript instead of json', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-sw-inline-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeMinimalRuntimeEntry(root, {
      escapeInlineScriptTextSource: [
        'export const escapeInlineScriptText = (value) =>',
        "  value.replaceAll('<', '\\\\u003C').replaceAll('&', '\\\\u0026').replaceAll('\\u2028', '\\\\u2028').replaceAll('\\u2029', '\\\\u2029');",
      ].join('\n'),
      escapeJSONScriptTextSource: [
        'export const escapeJSONScriptText = (value) =>',
        "  value.replaceAll('<', '\\\\u003C').replaceAll('>', '\\\\u003E').replaceAll('&', '\\\\u0026').replaceAll('\\u2028', '\\\\u2028').replaceAll('\\u2029', '\\\\u2029');",
      ].join('\n'),
      renderSSRAsyncSource: [
        'export const renderSSRAsync = async () => ({',
        '  html: "<html><head><script>__ECLIPSA_CHUNK_CACHE__</script><script id=\\"eclipsa-route-manifest\\" type=\\"application/eclipsa-route-manifest+json\\">__ECLIPSA_ROUTE_MANIFEST__</script><script id=\\"eclipsa-app-hooks\\" type=\\"application/eclipsa-app-hooks+json\\">__ECLIPSA_APP_HOOKS__</script></head><body><script id=\\"eclipsa-resume\\" type=\\"application/eclipsa-resume+json\\">__ECLIPSA_RESUME_PAYLOAD__</script></body></html>",',
        '  payload: {},',
        '});',
      ].join('\n'),
    })
    await writeBuiltPageModule(root, 'route__page', 'export default () => null;\n')

    await build(builder, { root }, { output: 'node' })

    const { default: app } = (await import(
      `${pathToFileURL(path.join(root, 'dist/ssr/eclipsa_app.mjs')).href}?t=${Date.now()}`
    )) as {
      default: { fetch(request: Request): Promise<Response> }
    }

    const response = await app.fetch(new Request('http://localhost/'))

    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('eclipsa:chunk-cache-precache')
    expect(html).toContain('(()=>{const message=')
    expect(html).toContain('=>navigator.serviceWorker.ready')
    expect(html).not.toContain('\\u003E')
  })

  it('rejects ssg output when route middleware is present', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-ssg-middleware-'))
    const builder = createBuilder()
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        middlewares: [
          {
            entryName: 'special__middleware',
            filePath: '/tmp/app/+middleware.ts',
          },
        ],
      },
    ])

    await expect(build(builder, { root }, { output: 'ssg' })).rejects.toThrow(
      /Route middleware is not supported with output "ssg"/,
    )
  })

  it('rejects ssg output when a page is marked dynamic', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-ssg-dynamic-'))
    const builder = createBuilder()
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        renderMode: 'dynamic',
      },
    ])

    await expect(build(builder, { root }, { output: 'ssg' })).rejects.toThrow(
      /render = "dynamic".*output "ssg"/,
    )
  })

  it('prerenders dynamic static routes from getStaticPaths entries', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-ssg-dynamic-static-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeBuiltPageModule(
      root,
      'route__docs___slug____page',
      [
        'export const getStaticPaths = () => [{ params: { slug: ["getting-started"] } }];',
        'export default () => null;',
        '',
      ].join('\n'),
    )
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        page: {
          entryName: 'route__docs___slug____page',
          filePath: '/tmp/app/docs/[...slug]/+page.tsx',
        },
        renderMode: 'static',
        routePath: '/docs/[...slug]',
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'rest', value: 'slug' },
        ],
      },
    ])
    mocks.toSSG.mockResolvedValue({
      files: ['docs/getting-started.html'],
      success: true,
    })

    await build(builder, { root }, { output: 'ssg' })

    expect(mocks.toSSG).toHaveBeenCalledTimes(1)
    const [, , options] = mocks.toSSG.mock.calls[0] as [
      { fetch(request: Request): Promise<Response> },
      typeof fs,
      {
        beforeRequestHook(request: Request): Request | false
        dir: string
      },
    ]
    const request = options.beforeRequestHook(new Request('http://localhost/docs/:slug{.+}'))
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request)) {
      throw new Error('Expected dynamic static route to attach ssgParams.')
    }
    expect((request as Request & { ssgParams?: Record<string, string>[] }).ssgParams).toEqual([
      {
        slug: 'getting-started',
      },
    ])
  })

  it('rejects dynamic static routes without getStaticPaths', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-static-missing-paths-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeBuiltPageModule(root, 'route__docs___slug____page', 'export default () => null;\n')
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        page: {
          entryName: 'route__docs___slug____page',
          filePath: '/tmp/app/docs/[...slug]/+page.tsx',
        },
        renderMode: 'static',
        routePath: '/docs/[...slug]',
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'rest', value: 'slug' },
        ],
      },
    ])

    await expect(build(builder, { root }, { output: 'ssg' })).rejects.toThrow(
      /export getStaticPaths/,
    )
  })

  it('rejects invalid getStaticPaths params', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-static-invalid-paths-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeBuiltPageModule(
      root,
      'route__docs___slug____page',
      [
        'export const getStaticPaths = () => [{ params: { slug: "getting-started" } }];',
        'export default () => null;',
        '',
      ].join('\n'),
    )
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        page: {
          entryName: 'route__docs___slug____page',
          filePath: '/tmp/app/docs/[...slug]/+page.tsx',
        },
        renderMode: 'static',
        routePath: '/docs/[...slug]',
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'rest', value: 'slug' },
        ],
      },
    ])

    await expect(build(builder, { root }, { output: 'ssg' })).rejects.toThrow(
      /rest param "slug" must be a string array/,
    )
  })

  it('rejects duplicate concrete paths across static routes', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-static-duplicate-paths-'))
    const builder = createBuilder()
    await writeMinimalSsrEntries(root)
    await writeBuiltPageModule(
      root,
      'route__docs___slug____page',
      [
        'export const getStaticPaths = () => [{ params: { slug: ["about"] } }];',
        'export default () => null;',
        '',
      ].join('\n'),
    )
    mocks.createRoutes.mockResolvedValue([
      {
        ...createRootRoute(),
        page: {
          entryName: 'route__docs__about__page',
          filePath: '/tmp/app/docs/about/+page.tsx',
        },
        renderMode: 'static',
        routePath: '/docs/about',
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'static', value: 'about' },
        ],
      },
      {
        ...createRootRoute(),
        page: {
          entryName: 'route__docs___slug____page',
          filePath: '/tmp/app/docs/[...slug]/+page.tsx',
        },
        renderMode: 'static',
        routePath: '/docs/[...slug]',
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'rest', value: 'slug' },
        ],
      },
    ])

    await expect(build(builder, { root }, { output: 'ssg' })).rejects.toThrow(
      /duplicate concrete path "\/docs\/about"/,
    )
  })
})
