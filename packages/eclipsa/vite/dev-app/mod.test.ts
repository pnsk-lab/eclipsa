import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteEntry } from '../utils/routing.ts'

var createRoutes = vi.fn<() => Promise<RouteEntry[]>>()
var collectAppActions = vi.fn<() => Promise<{ id: string; filePath: string }[]>>()
var collectAppLoaders = vi.fn<() => Promise<{ id: string; filePath: string }[]>>()
var collectAppSymbols = vi.fn<() => Promise<{ id: string; filePath: string }[]>>()
var createDevSymbolUrl = vi.fn<(root: string, filePath: string, symbolId: string) => string>()

import { createDevFetch, shouldInvalidateDevApp } from './mod.ts'

const createDevModuleUrl = (root: string, entry: { filePath: string }) =>
  entry.filePath.replace(root, '')

describe('createDevFetch', () => {
  let routes: RouteEntry[]
  let serverEntryImports: number
  let userApp: Hono

  beforeEach(() => {
    routes = [
      {
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
      },
    ]
    serverEntryImports = 0
    userApp = new Hono()
    userApp.get('/api', (c) => c.text('api'))
    createRoutes.mockImplementation(async () => routes)
    collectAppActions.mockResolvedValue([])
    collectAppLoaders.mockResolvedValue([])
    collectAppSymbols.mockResolvedValue([])
    createDevSymbolUrl.mockReturnValue('/symbol.js')
  })

  it('rebuilds the dev app after invalidation so newly added routes are served without mutating the shared user app', async () => {
    const devFetch = createDevFetch({
      resolvedConfig: {
        root: '/tmp',
      } as any,
      devServer: {} as any,
      deps: {
        collectAppActions,
        collectAppLoaders,
        collectAppSymbols,
        createDevModuleUrl,
        createDevSymbolUrl,
        createRoutes,
      },
      runner: {
        async import(id: string) {
          if (id === '/app/+server-entry.ts') {
            serverEntryImports += 1
            return { default: userApp }
          }
          if (id === '/app/+ssr-root.tsx') {
            return {
              default(props: unknown) {
                return props
              },
            }
          }
          if (id === 'eclipsa') {
            return {
              escapeJSONScriptText(value: string) {
                return value
              },
              renderSSRAsync() {
                return {
                  html: '<html><head></head><body></body></html>',
                  payload: {},
                }
              },
              resolvePendingLoaders: vi.fn(),
              serializeResumePayload() {
                return '{}'
              },
            }
          }
          return {
            default() {
              return null
            },
          }
        },
      } as any,
      ssrEnv: {} as any,
    })

    expect((await devFetch.fetch(new Request('http://localhost/api')))?.status).toBe(200)
    expect(await devFetch.fetch(new Request('http://localhost/hello'))).toBeUndefined()
    expect(serverEntryImports).toBe(1)

    routes = [
      ...routes,
      {
        error: null,
        layouts: [],
        loading: null,
        notFound: null,
        page: {
          entryName: 'route__hello__page',
          filePath: '/tmp/app/hello/+page.tsx',
        },
        routePath: '/hello',
        segments: [{ kind: 'static', value: 'hello' }],
        server: null,
      },
    ]
    devFetch.invalidate()

    const response = await devFetch.fetch(new Request('http://localhost/hello'))

    expect(response?.status).toBe(200)
    expect((await devFetch.fetch(new Request('http://localhost/api')))?.status).toBe(200)
    expect(serverEntryImports).toBe(2)
    expect(createRoutes).toHaveBeenCalledTimes(2)
    expect(collectAppSymbols).toHaveBeenCalledTimes(2)
  })

  it('renders ancestor layouts around the page component', async () => {
    routes = [
      {
        error: null,
        layouts: [
          {
            entryName: 'layout__layout',
            filePath: '/tmp/app/+layout.tsx',
          },
        ],
        loading: null,
        notFound: null,
        page: {
          entryName: 'route__page',
          filePath: '/tmp/app/+page.tsx',
        },
        routePath: '/',
        segments: [],
        server: null,
      },
    ]

    const devFetch = createDevFetch({
      resolvedConfig: {
        root: '/tmp',
      } as any,
      devServer: {} as any,
      deps: {
        collectAppActions,
        collectAppLoaders,
        collectAppSymbols,
        createDevModuleUrl,
        createDevSymbolUrl,
        createRoutes,
      },
      runner: {
        async import(id: string) {
          if (id === '/app/+server-entry.ts') {
            return { default: userApp }
          }
          if (id === '/app/+ssr-root.tsx') {
            return {
              default(props: any) {
                return props
              },
            }
          }
          if (id === 'eclipsa') {
            return {
              escapeJSONScriptText(value: string) {
                return value
              },
              renderSSRAsync(renderDocument: () => any) {
                const resolveNode = (value: any): any => {
                  if (!value || typeof value !== 'object') {
                    return value
                  }
                  if (typeof value.type === 'function') {
                    return resolveNode(value.type(value.props ?? {}))
                  }
                  return Object.fromEntries(
                    Object.entries(value).map(([key, child]) => [key, resolveNode(child)]),
                  )
                }
                return {
                  html: JSON.stringify(resolveNode(renderDocument())),
                  payload: {},
                }
              },
              resolvePendingLoaders: vi.fn(),
              serializeResumePayload() {
                return '{}'
              },
            }
          }
          if (id === '/tmp/app/+layout.tsx') {
            return {
              default(props: any) {
                return {
                  type: 'layout',
                  props,
                }
              },
            }
          }
          return {
            default(props: any) {
              return {
                params: props.__eclipsa_route_params,
                type: 'page',
              }
            },
          }
        },
      } as any,
      ssrEnv: {} as any,
    })

    const response = await devFetch.fetch(new Request('http://localhost/'))

    expect(response?.status).toBe(200)
    const html = await response?.text()
    expect(html).toContain('"type":"layout"')
    expect(html).toContain('"__eclipsa_type":"route-slot"')
    expect(html).toContain('"pathname":"/"')
  })

  it('renders resume metadata through SSRRoot head props', async () => {
    const devFetch = createDevFetch({
      resolvedConfig: {
        root: '/tmp',
      } as any,
      devServer: {} as any,
      deps: {
        collectAppActions,
        collectAppLoaders,
        collectAppSymbols,
        createDevModuleUrl,
        createDevSymbolUrl,
        createRoutes,
      },
      runner: {
        async import(id: string) {
          if (id === '/app/+server-entry.ts') {
            return { default: userApp }
          }
          if (id === '/app/+ssr-root.tsx') {
            return {
              default(props: any) {
                return props
              },
            }
          }
          if (id === 'eclipsa') {
            return {
              escapeJSONScriptText(value: string) {
                return value
              },
              renderSSRAsync(renderDocument: () => any) {
                return {
                  html: JSON.stringify(renderDocument()),
                  payload: {},
                }
              },
              resolvePendingLoaders: vi.fn(),
              serializeResumePayload() {
                return '{}'
              },
            }
          }
          return {
            default() {
              return null
            },
          }
        },
      } as any,
      ssrEnv: {} as any,
    })

    const response = await devFetch.fetch(new Request('http://localhost/'))
    const html = await response?.text()

    expect(html).toContain('"id":"eclipsa-resume"')
    expect(html).toContain(`"id":"${'eclipsa-route-manifest'}"`)
    expect(html).not.toContain('__ECLIPSA_RESUME_PAYLOAD__')
    expect(html).not.toContain('__ECLIPSA_ROUTE_MANIFEST__')
  })
})

describe('shouldInvalidateDevApp', () => {
  it('tracks app tsx edits and server-entry changes', () => {
    expect(shouldInvalidateDevApp('/tmp', '/tmp/app/hello/+page.tsx', 'add')).toBe(true)
    expect(shouldInvalidateDevApp('/tmp', '/tmp/app/+server-entry.ts', 'change')).toBe(true)
    expect(shouldInvalidateDevApp('/tmp', '/tmp/src/hello/+page.tsx', 'add')).toBe(false)
  })
})
