import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
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
  createBuildServerModuleUrl: vi.fn((entry: { entryName: string }) => `/entries/${entry.entryName}.mjs`),
  createRouteManifest: mocks.createRouteManifest,
  createRoutes: mocks.createRoutes,
}))

vi.mock('../compiler.ts', () => ({
  collectAppActions: mocks.collectAppActions,
  collectAppLoaders: mocks.collectAppLoaders,
  collectAppSymbols: mocks.collectAppSymbols,
  createBuildServerActionUrl: vi.fn((id: string) => `/__eclipsa/action/${id}`),
  createBuildServerLoaderUrl: vi.fn((id: string) => `/__eclipsa/loader/${id}`),
  createBuildSymbolUrl: vi.fn((id: string) => `/entries/symbol__${id}.js`),
}))

import { build, toHonoRoutePaths } from './mod.ts'

const createBuilder = () =>
  ({
    build: vi.fn(async () => undefined),
    environments: {
      client: { name: 'client' },
      ssr: { name: 'ssr' },
    },
  }) as any

const createRootRoute = (): RouteEntry => ({
  error: null,
  layouts: [],
  loading: null,
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

describe('build', () => {
  beforeEach(() => {
    mocks.collectAppActions.mockResolvedValue([])
    mocks.collectAppLoaders.mockResolvedValue([])
    mocks.collectAppSymbols.mockResolvedValue([])
    mocks.createRouteManifest.mockReturnValue({
      routes: [],
    })
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

  it('runs Hono toSSG for ssg output and skips non-page routes', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'eclipsa-build-ssg-'))
    const builder = createBuilder()
    const entriesDir = path.join(root, 'dist/ssr/entries')
    const assetsDir = path.join(root, 'dist/client/assets')

    await fs.mkdir(entriesDir, { recursive: true })
    await fs.mkdir(assetsDir, { recursive: true })
    await fs.writeFile(
      path.join(entriesDir, 'server_entry.mjs'),
      'import { Hono } from "hono"; const app = new Hono(); export default app;\n',
    )
    await fs.writeFile(path.join(assetsDir, 'layout.css'), 'body { color: white; }\n')
    await fs.writeFile(path.join(entriesDir, 'ssr_root.mjs'), 'export default (props) => props;\n')
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
        'export const renderSSRAsync = async () => ({ html: "<html><head></head><body></body></html>", payload: {} });',
        'export const resolvePendingLoaders = async () => undefined;',
        'export const serializeResumePayload = () => "{}";',
        '',
      ].join('\n'),
    )
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
})
