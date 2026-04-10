import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { RouteEntry } from './utils/routing.ts'

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  collectAppActions: vi.fn<() => Promise<Array<{ filePath: string; id: string }>>>(),
  collectAppLoaders: vi.fn<() => Promise<Array<{ filePath: string; id: string }>>>(),
  collectAppSymbols: vi.fn<() => Promise<Array<{ filePath: string; id: string }>>>(),
  collectRouteModules: vi.fn(),
  collectRouteServerModules: vi.fn(),
  createRoutes: vi.fn<() => Promise<RouteEntry[]>>(),
}))

vi.mock('./build/mod.ts', () => ({
  build: mocks.build,
}))

vi.mock('./compiler.ts', () => ({
  collectAppActions: mocks.collectAppActions,
  collectAppLoaders: mocks.collectAppLoaders,
  collectAppSymbols: mocks.collectAppSymbols,
}))

vi.mock('./utils/routing.ts', () => ({
  collectRouteModules: mocks.collectRouteModules,
  collectRouteServerModules: mocks.collectRouteServerModules,
  createRoutes: mocks.createRoutes,
}))

import { createConfig } from './config.ts'

describe('createConfig', () => {
  it('passes the resolved output target through to buildApp', async () => {
    const userConfig = {
      root: '/tmp/app',
    }
    const builder = {
      environments: {
        client: {},
        ssr: {},
      },
    }

    mocks.createRoutes.mockResolvedValue([])
    mocks.collectRouteModules.mockReturnValue([])
    mocks.collectRouteServerModules.mockReturnValue([])
    mocks.collectAppActions.mockResolvedValue([])
    mocks.collectAppLoaders.mockResolvedValue([])
    mocks.collectAppSymbols.mockResolvedValue([])

    const hook = createConfig({ output: 'ssg' })
    if (typeof hook !== 'function') {
      throw new Error('Expected createConfig() to return a config hook function')
    }
    const config = await hook.call({} as any, userConfig as any, {} as any)
    if (!config?.builder?.buildApp) {
      throw new Error('Expected builder.buildApp to be defined')
    }

    await config.builder.buildApp(builder as any)

    expect(mocks.build).toHaveBeenCalledWith(builder, userConfig, {
      output: 'ssg',
    })
  })

  it('injects Nitro entry configuration when a Nitro plugin is present', async () => {
    const userConfig = {
      plugins: [[{ name: 'nitro:main' }]],
      root: '/tmp/app',
    }

    mocks.createRoutes.mockResolvedValue([])
    mocks.collectRouteModules.mockReturnValue([])
    mocks.collectRouteServerModules.mockReturnValue([])
    mocks.collectAppActions.mockResolvedValue([])
    mocks.collectAppLoaders.mockResolvedValue([])
    mocks.collectAppSymbols.mockResolvedValue([])

    const hook = createConfig({ output: 'node' })
    if (typeof hook !== 'function') {
      throw new Error('Expected createConfig() to return a config hook function')
    }

    const config = await hook.call({} as any, userConfig as any, {} as any)

    expect((config as Record<string, any>).nitro).toMatchObject({
      entry: '#eclipsa/nitro-entry',
      publicAssets: [
        {
          baseURL: '/',
          dir: '/tmp/app/dist/client',
        },
      ],
      virtual: {
        '#eclipsa/nitro-entry': expect.stringContaining('eclipsa_app.mjs'),
      },
    })
  })

  it('resolves the SSR runtime entry from the package instead of the app root', async () => {
    const userConfig = {
      root: '/tmp/app',
    }

    mocks.createRoutes.mockResolvedValue([])
    mocks.collectRouteModules.mockReturnValue([])
    mocks.collectRouteServerModules.mockReturnValue([])
    mocks.collectAppActions.mockResolvedValue([])
    mocks.collectAppLoaders.mockResolvedValue([])
    mocks.collectAppSymbols.mockResolvedValue([])

    const hook = createConfig({ output: 'node' })
    if (typeof hook !== 'function') {
      throw new Error('Expected createConfig() to return a config hook function')
    }

    const config = await hook.call({} as any, userConfig as any, {} as any)
    const ssrInput = (config as Record<string, any>).environments?.ssr?.build?.rollupOptions?.input

    expect(ssrInput?.eclipsa_runtime).toBe(
      fileURLToPath(import.meta.resolve('eclipsa/vite/build/runtime')),
    )
    expect(ssrInput?.eclipsa_runtime).not.toBe(
      path.join(userConfig.root, '../packages/eclipsa/vite/build/runtime.ts'),
    )
  })

  it('bundles eclipsa package imports into the SSR environment to avoid split runtimes', async () => {
    const userConfig = {
      root: '/tmp/app',
    }

    mocks.createRoutes.mockResolvedValue([])
    mocks.collectRouteModules.mockReturnValue([])
    mocks.collectRouteServerModules.mockReturnValue([])
    mocks.collectAppActions.mockResolvedValue([])
    mocks.collectAppLoaders.mockResolvedValue([])
    mocks.collectAppSymbols.mockResolvedValue([])

    const hook = createConfig({ output: 'node' })
    if (typeof hook !== 'function') {
      throw new Error('Expected createConfig() to return a config hook function')
    }

    const config = await hook.call({} as any, userConfig as any, {} as any)
    const noExternal = (config as Record<string, any>).environments?.ssr?.resolve?.noExternal

    expect(noExternal).toEqual([/^eclipsa(?:\/|$)/])
  })
})
