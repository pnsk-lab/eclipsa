import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  collectRouteModules,
  collectRouteServerModules,
  createBuildModuleUrl,
  createDevModuleUrl,
  createRouteManifest,
  createRoutes,
  matchRoute,
  normalizeRoutePath,
  type RouteEntry,
} from './routing.ts'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      fs.rm(dir, {
        force: true,
        recursive: true,
      }),
    ),
  )
})

const createTempApp = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eclipsa-routing-'))
  tempDirs.push(root)
  await fs.mkdir(path.join(root, 'app'), { recursive: true })
  return root
}

describe('routing helpers', () => {
  it('normalizes route paths with a leading slash', () => {
    expect(normalizeRoutePath('counter')).toBe('/counter')
    expect(normalizeRoutePath('/counter/')).toBe('/counter')
    expect(normalizeRoutePath('/')).toBe('/')
  })

  it('collects ancestor layouts and special files for grouped and dynamic routes', async () => {
    const root = await createTempApp()
    await Promise.all([
      fs.mkdir(path.join(root, 'app', '(app)', 'blog', '[slug]'), { recursive: true }),
      fs.mkdir(path.join(root, 'app', '(app)'), { recursive: true }),
    ])
    await Promise.all([
      fs.writeFile(path.join(root, 'app', '+layout.tsx'), 'export default () => null;'),
      fs.writeFile(
        path.join(root, 'app', '+middleware.ts'),
        'export default async (_, next) => { await next(); };',
      ),
      fs.writeFile(path.join(root, 'app', '+not-found.tsx'), 'export default () => null;'),
      fs.writeFile(path.join(root, 'app', '(app)', '+layout.tsx'), 'export default () => null;'),
      fs.writeFile(
        path.join(root, 'app', '(app)', 'blog', '+middleware.ts'),
        'export default async (_, next) => { await next(); };',
      ),
      fs.writeFile(
        path.join(root, 'app', '(app)', 'blog', '+loading.tsx'),
        'export default () => null;',
      ),
      fs.writeFile(
        path.join(root, 'app', '(app)', 'blog', '[slug]', '+page.tsx'),
        "export const render = 'static';\nexport default () => null;",
      ),
      fs.writeFile(
        path.join(root, 'app', '(app)', 'blog', '[slug]', '+server.ts'),
        'export default { fetch() {} };',
      ),
    ])

    const routes = await createRoutes(root)
    const blogRoute = routes.find((route) => route.routePath === '/blog/[slug]')

    expect(blogRoute).toMatchObject({
      error: null,
      layouts: [
        {
          entryName: 'layout___layout',
          filePath: path.join(root, 'app', '+layout.tsx'),
        },
        {
          entryName: 'layout___app____layout',
          filePath: path.join(root, 'app', '(app)', '+layout.tsx'),
        },
      ],
      loading: {
        entryName: 'special___app___blog___loading',
        filePath: path.join(root, 'app', '(app)', 'blog', '+loading.tsx'),
      },
      middlewares: [
        {
          entryName: 'special___middleware',
          filePath: path.join(root, 'app', '+middleware.ts'),
        },
        {
          entryName: 'special___app___blog___middleware',
          filePath: path.join(root, 'app', '(app)', 'blog', '+middleware.ts'),
        },
      ],
      notFound: {
        entryName: 'special___not_found',
        filePath: path.join(root, 'app', '+not-found.tsx'),
      },
      page: {
        entryName: 'route___app___blog___slug____page',
        filePath: path.join(root, 'app', '(app)', 'blog', '[slug]', '+page.tsx'),
      },
      renderMode: 'static',
      routePath: '/blog/[slug]',
      server: {
        entryName: 'server___app___blog___slug____server',
        filePath: path.join(root, 'app', '(app)', 'blog', '[slug]', '+server.ts'),
      },
    })
  })

  it('rejects unsupported page render modes', async () => {
    const root = await createTempApp()
    await fs.mkdir(path.join(root, 'app'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'app', '+page.tsx'),
      "export const render = 'streaming';\nexport default () => null;",
    )

    await expect(createRoutes(root)).rejects.toThrow(/Unsupported render mode "streaming"/)
  })

  it('supports dynamic, optional, and catch-all params with route groups removed from the path', () => {
    const routes: RouteEntry[] = [
      {
        error: null,
        layouts: [],
        loading: null,
        middlewares: [],
        notFound: null,
        page: null,
        routePath: '/blog/[slug]',
        segments: [
          { kind: 'static', value: 'blog' },
          { kind: 'required', value: 'slug' },
        ],
        server: null,
      },
      {
        error: null,
        layouts: [],
        loading: null,
        middlewares: [],
        notFound: null,
        page: null,
        routePath: '/docs/[...rest]',
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'rest', value: 'rest' },
        ],
        server: null,
      },
      {
        error: null,
        layouts: [],
        loading: null,
        middlewares: [],
        notFound: null,
        page: null,
        routePath: '/[[lang]]/about',
        segments: [
          { kind: 'optional', value: 'lang' },
          { kind: 'static', value: 'about' },
        ],
        server: null,
      },
    ]

    expect(matchRoute(routes, '/blog/hello')).toMatchObject({
      params: { slug: 'hello' },
      route: routes[0],
    })
    expect(matchRoute(routes, '/docs/a/b')).toMatchObject({
      params: { rest: ['a', 'b'] },
      route: routes[1],
    })
    expect(matchRoute(routes, '/docs')).toBeNull()
    expect(matchRoute(routes, '/about')).toMatchObject({
      params: { lang: undefined },
      route: routes[2],
    })
    expect(matchRoute(routes, '/ja/about')).toMatchObject({
      params: { lang: 'ja' },
      route: routes[2],
    })
  })

  it('creates module manifests for dev and build route loading', () => {
    const routes: RouteEntry[] = [
      {
        error: null,
        layouts: [
          {
            entryName: 'layout___layout',
            filePath: '/tmp/app/+layout.tsx',
          },
        ],
        loading: {
          entryName: 'special__counter__loading',
          filePath: '/tmp/app/counter/+loading.tsx',
        },
        middlewares: [
          {
            entryName: 'special__middleware',
            filePath: '/tmp/app/+middleware.ts',
          },
        ],
        notFound: null,
        page: {
          entryName: 'route__counter__page',
          filePath: '/tmp/app/counter/+page.tsx',
        },
        routePath: '/counter/[id]',
        segments: [
          { kind: 'static', value: 'counter' },
          { kind: 'required', value: 'id' },
        ],
        server: {
          entryName: 'server__counter__server',
          filePath: '/tmp/app/counter/+server.ts',
        },
      },
    ]

    expect(createDevModuleUrl('/tmp', routes[0]!.page!)).toBe('/app/counter/+page.tsx')
    expect(createBuildModuleUrl(routes[0]!.page!)).toBe('/entries/route__counter__page.js')
    expect(createRouteManifest(routes, createBuildModuleUrl)).toEqual([
      {
        error: null,
        hasMiddleware: true,
        layouts: ['/entries/layout___layout.js'],
        loading: '/entries/special__counter__loading.js',
        notFound: null,
        page: '/entries/route__counter__page.js',
        routePath: '/counter/[id]',
        segments: [
          { kind: 'static', value: 'counter' },
          { kind: 'required', value: 'id' },
        ],
        server: '/entries/server__counter__server.js',
      },
    ])
    expect(collectRouteModules(routes)).toEqual([
      {
        entryName: 'route__counter__page',
        filePath: '/tmp/app/counter/+page.tsx',
      },
      {
        entryName: 'layout___layout',
        filePath: '/tmp/app/+layout.tsx',
      },
      {
        entryName: 'special__counter__loading',
        filePath: '/tmp/app/counter/+loading.tsx',
      },
    ])
    expect(collectRouteServerModules(routes)).toEqual([
      {
        entryName: 'special__middleware',
        filePath: '/tmp/app/+middleware.ts',
      },
      {
        entryName: 'server__counter__server',
        filePath: '/tmp/app/counter/+server.ts',
      },
    ])
  })
})
