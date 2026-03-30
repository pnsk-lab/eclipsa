import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteEntry } from '../utils/routing.ts'

const mocks = vi.hoisted(() => ({
  collectAppActions: vi.fn<() => Promise<Array<{ filePath: string; id: string }>>>(),
  collectAppLoaders: vi.fn<() => Promise<Array<{ filePath: string; id: string }>>>(),
  collectAppSymbols: vi.fn<() => Promise<Array<{ filePath: string; id: string }>>>(),
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
    renderSSRAsyncSource?: string
  },
) => {
  const entriesDir = path.join(root, 'dist/ssr/entries')
  await fs.mkdir(entriesDir, { recursive: true })
  await fs.writeFile(
    path.join(entriesDir, 'eclipsa_runtime.mjs'),
    [
      'export const Fragment = Symbol.for("fragment");',
      'export const executeAction = async () => new Response(null, { status: 204 });',
      'export const executeLoader = async () => new Response(null, { status: 204 });',
      'export const escapeJSONScriptText = (value) => value;',
      'export const hasAction = () => false;',
      'export const hasLoader = () => false;',
      'export const jsxDEV = () => ({});',
      options?.renderSSRAsyncSource ??
        'export const renderSSRAsync = async () => ({ html: "<html><head></head><body></body></html>", payload: {} });',
      'export const renderSSRStream = async () => ({ chunks: (async function* () {})(), html: "<html><head></head><body></body></html>", payload: {} });',
      'export const resolvePendingLoaders = async () => undefined;',
      'export const serializeResumePayload = () => "{}";',
      'export const composeRouteMetadata = () => null;',
      'export const renderRouteMetadataHead = () => [];',
      'export const attachRequestFetch = () => undefined;',
      'export const createRequestFetch = () => undefined;',
      'export const deserializePublicValue = (value) => value;',
      'export const getActionFormSubmissionId = async () => null;',
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
    await expect(fs.readFile(path.join(root, 'dist/ssr/eclipsa_app.mjs'), 'utf8')).resolves.toContain(
      '/eclipsa-chunk-cache-sw.js',
    )
    await expect(fs.readFile(path.join(root, 'dist/ssr/eclipsa_app.mjs'), 'utf8')).resolves.toContain(
      'navigator.serviceWorker.register',
    )
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
