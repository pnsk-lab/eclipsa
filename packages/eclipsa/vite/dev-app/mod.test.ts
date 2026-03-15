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
        middlewares: [],
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
              getStreamingResumeBootstrapScriptContent() {
                return ''
              },
              renderSSRStream() {
                return {
                  chunks: (async function* () {})(),
                  html: '<html><head></head><body></body></html>',
                  payload: {},
                }
              },
              RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
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
        middlewares: [],
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
        middlewares: [],
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
              getStreamingResumeBootstrapScriptContent() {
                return ''
              },
              renderSSRStream(renderDocument: () => any) {
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
                  chunks: (async function* () {})(),
                  html: JSON.stringify(resolveNode(renderDocument())),
                  payload: {},
                }
              },
              RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
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
                return {
                  props: {
                    children: [
                      {
                        props: {
                          children: props.head,
                        },
                        type: 'head',
                      },
                      {
                        props: {
                          children: props.body,
                        },
                        type: 'body',
                      },
                    ],
                  },
                  type: 'html',
                }
              },
            }
          }
          if (id === 'eclipsa') {
            return {
              escapeJSONScriptText(value: string) {
                return value
              },
              getStreamingResumeBootstrapScriptContent() {
                return ''
              },
              renderSSRStream(renderDocument: () => any) {
                return {
                  chunks: (async function* () {})(),
                  html: JSON.stringify(renderDocument()),
                  payload: {},
                }
              },
              RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
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

  it('injects the suspense streaming bootstrap script without escaping it', async () => {
    const bootstrapScript = '(()=>window.__eclipsa_stream_boot=1)()'
    const renderNode = (value: any): string => {
      if (value === false || value === null || value === undefined) {
        return ''
      }
      if (Array.isArray(value)) {
        return value.map((entry) => renderNode(entry)).join('')
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
      }
      if (typeof value.type === 'function') {
        return renderNode(value.type(value.props ?? {}))
      }
      const props = value.props ?? {}
      const attrs = Object.entries(props)
        .filter(([name]) => name !== 'children' && name !== 'dangerouslySetInnerHTML')
        .map(([name, attrValue]) => `${name}="${String(attrValue)}"`)
        .join(' ')
      const children =
        props.dangerouslySetInnerHTML !== undefined
          ? String(props.dangerouslySetInnerHTML ?? '')
          : renderNode(props.children)
      return `<${value.type}${attrs ? ` ${attrs}` : ''}>${children}</${value.type}>`
    }
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
                return {
                  props: {
                    children: [
                      {
                        props: {
                          children: props.head,
                        },
                        type: 'head',
                      },
                      {
                        props: {
                          children: props.body,
                        },
                        type: 'body',
                      },
                    ],
                  },
                  type: 'html',
                }
              },
            }
          }
          if (id === 'eclipsa') {
            return {
              RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
              escapeJSONScriptText(value: string) {
                return value
              },
              getStreamingResumeBootstrapScriptContent() {
                return bootstrapScript
              },
              renderSSRStream(renderDocument: () => any) {
                return {
                  chunks: (async function* () {})(),
                  html: renderNode(renderDocument()),
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

    expect(html).toContain(`<script>${bootstrapScript}</script>`)
    expect(html).not.toContain('&gt;')
    expect(html).toContain(
      '<script id="eclipsa-resume-final" type="application/eclipsa-resume+json">',
    )
  })

  it('runs route middleware through the preflight endpoint before client navigation', async () => {
    routes = [
      {
        error: null,
        layouts: [],
        loading: null,
        middlewares: [
          {
            entryName: 'special__guarded__middleware',
            filePath: '/tmp/app/guarded/+middleware.ts',
          },
        ],
        notFound: null,
        page: {
          entryName: 'route__guarded__page',
          filePath: '/tmp/app/guarded/+page.tsx',
        },
        routePath: '/guarded',
        segments: [{ kind: 'static', value: 'guarded' }],
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
          if (id === '/tmp/app/guarded/+middleware.ts') {
            return {
              default(c: any) {
                return c.redirect('/counter')
              },
            }
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
              getStreamingResumeBootstrapScriptContent() {
                return ''
              },
              renderSSRStream() {
                return {
                  chunks: (async function* () {})(),
                  html: '<html><head></head><body></body></html>',
                  payload: {},
                }
              },
              RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
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

    const response = await devFetch.fetch(
      new Request(
        'http://localhost/__eclipsa/route-preflight?href=http%3A%2F%2Flocalhost%2Fguarded',
      ),
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
      location: 'http://localhost/counter',
      ok: false,
    })
  })

  it('accepts response-like redirect values from route middleware preflight', async () => {
    routes = [
      {
        error: null,
        layouts: [],
        loading: null,
        middlewares: [
          {
            entryName: 'special__guarded__middleware',
            filePath: '/tmp/app/guarded/+middleware.ts',
          },
        ],
        notFound: null,
        page: {
          entryName: 'route__guarded__page',
          filePath: '/tmp/app/guarded/+page.tsx',
        },
        routePath: '/guarded',
        segments: [{ kind: 'static', value: 'guarded' }],
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
          if (id === '/tmp/app/guarded/+middleware.ts') {
            return {
              default() {
                return {
                  headers: {
                    get(name: string) {
                      return name === 'location' ? '/counter' : null
                    },
                  },
                  status: 302,
                }
              },
            }
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
              getStreamingResumeBootstrapScriptContent() {
                return ''
              },
              renderSSRStream() {
                return {
                  chunks: (async function* () {})(),
                  html: '<html><head></head><body></body></html>',
                  payload: {},
                }
              },
              RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
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

    const response = await devFetch.fetch(
      new Request(
        'http://localhost/__eclipsa/route-preflight?href=http%3A%2F%2Flocalhost%2Fguarded',
      ),
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
      location: 'http://localhost/counter',
      ok: false,
    })
  })

  it('evaluates middleware against the target preflight URL', async () => {
    routes = [
      {
        error: null,
        layouts: [],
        loading: null,
        middlewares: [
          {
            entryName: 'special__guarded__middleware',
            filePath: '/tmp/app/guarded/+middleware.ts',
          },
        ],
        notFound: null,
        page: {
          entryName: 'route__guarded__page',
          filePath: '/tmp/app/guarded/+page.tsx',
        },
        routePath: '/guarded',
        segments: [{ kind: 'static', value: 'guarded' }],
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
          if (id === '/tmp/app/guarded/+middleware.ts') {
            return {
              default(c: any, next: any) {
                if (new URL(c.req.url).searchParams.get('allow') === '1') {
                  return next()
                }
                return c.redirect('/counter')
              },
            }
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
              getStreamingResumeBootstrapScriptContent() {
                return ''
              },
              renderSSRStream() {
                return {
                  chunks: (async function* () {})(),
                  html: '<html><head></head><body></body></html>',
                  payload: {},
                }
              },
              RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
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

    const response = await devFetch.fetch(
      new Request(
        'http://localhost/__eclipsa/route-preflight?href=http%3A%2F%2Flocalhost%2Fguarded%3Fallow%3D1',
      ),
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
      ok: true,
    })
  })
})

describe('shouldInvalidateDevApp', () => {
  it('tracks app tsx edits and server-entry changes', () => {
    expect(shouldInvalidateDevApp('/tmp', '/tmp/app/hello/+page.tsx', 'add')).toBe(true)
    expect(shouldInvalidateDevApp('/tmp', '/tmp/app/+server-entry.ts', 'change')).toBe(true)
    expect(shouldInvalidateDevApp('/tmp', '/tmp/src/hello/+page.tsx', 'add')).toBe(false)
  })
})
