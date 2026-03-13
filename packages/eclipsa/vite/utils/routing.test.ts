import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  collectRouteModules,
  createBuildModuleUrl,
  createDevModuleUrl,
  createRouteManifest,
  createRoutes,
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
  await fs.mkdir(path.join(root, 'app', 'counter'), {
    recursive: true,
  })
  return root
}

describe('routing helpers', () => {
  it('normalizes route paths with a leading slash', () => {
    expect(normalizeRoutePath('counter')).toBe('/counter')
    expect(normalizeRoutePath('/counter/')).toBe('/counter')
    expect(normalizeRoutePath('/')).toBe('/')
  })

  it('collects ancestor layouts for each page', async () => {
    const root = await createTempApp()
    await Promise.all([
      fs.writeFile(path.join(root, 'app', '+layout.tsx'), 'export default () => null;'),
      fs.writeFile(path.join(root, 'app', '+page.tsx'), 'export default () => null;'),
      fs.writeFile(path.join(root, 'app', 'counter', '+layout.tsx'), 'export default () => null;'),
      fs.writeFile(path.join(root, 'app', 'counter', '+page.tsx'), 'export default () => null;'),
    ])

    const routes = await createRoutes(root)
    const counterRoute = routes.find((route) => route.honoPath === '/counter')

    expect(counterRoute).toMatchObject({
      honoPath: '/counter',
      layouts: [
        {
          entryName: 'layout__layout',
          filePath: path.join(root, 'app', '+layout.tsx'),
        },
        {
          entryName: 'layout__counter__layout',
          filePath: path.join(root, 'app', 'counter', '+layout.tsx'),
        },
      ],
      page: {
        entryName: 'route__counter__page',
        filePath: path.join(root, 'app', 'counter', '+page.tsx'),
      },
    })
  })

  it('creates module manifests for dev and build route loading', () => {
    const routes: RouteEntry[] = [
      {
        honoPath: '/',
        layouts: [
          {
            entryName: 'layout__layout',
            filePath: '/tmp/app/+layout.tsx',
          },
        ],
        page: {
          entryName: 'route__page',
          filePath: '/tmp/app/+page.tsx',
        },
      },
      {
        honoPath: '/counter',
        layouts: [
          {
            entryName: 'layout__layout',
            filePath: '/tmp/app/+layout.tsx',
          },
        ],
        page: {
          entryName: 'route__counter__page',
          filePath: '/tmp/app/counter/+page.tsx',
        },
      },
    ]

    expect(createDevModuleUrl('/tmp', routes[1]!.page)).toBe('/app/counter/+page.tsx')
    expect(createBuildModuleUrl(routes[1]!.page)).toBe('/entries/route__counter__page.js')
    expect(createRouteManifest(routes, createBuildModuleUrl)).toEqual({
      '/': {
        layouts: ['/entries/layout__layout.js'],
        page: '/entries/route__page.js',
      },
      '/counter': {
        layouts: ['/entries/layout__layout.js'],
        page: '/entries/route__counter__page.js',
      },
    })
    expect(collectRouteModules(routes)).toEqual([
      {
        entryName: 'route__page',
        filePath: '/tmp/app/+page.tsx',
      },
      {
        entryName: 'layout__layout',
        filePath: '/tmp/app/+layout.tsx',
      },
      {
        entryName: 'route__counter__page',
        filePath: '/tmp/app/counter/+page.tsx',
      },
    ])
  })
})
