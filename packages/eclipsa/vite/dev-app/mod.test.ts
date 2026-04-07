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

  it('defers SSRRoot execution to the render pipeline', async () => {
    const callOrder: string[] = []
    const resolveNode = (value: any): any => {
      if (!value || typeof value !== 'object') {
        return value
      }
      if (typeof value.type === 'function') {
        return resolveNode(value.type(value.props ?? {}))
      }
      return {
        ...value,
        ...(value.props ? { props: resolveNode(value.props) } : {}),
      }
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
                callOrder.push('ssr-root')
                return {
                  props,
                  type: 'html',
                }
              },
            }
          }
          if (id === 'eclipsa') {
            return {
              Fragment: Symbol.for('fragment'),
              RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
              escapeJSONScriptText(value: string) {
                return value
              },
              getStreamingResumeBootstrapScriptContent() {
                return ''
              },
              renderSSRStream(renderDocument: () => any) {
                callOrder.push('render-stream:start')
                const rendered = resolveNode(renderDocument())
                callOrder.push('render-stream:end')
                return {
                  chunks: (async function* () {})(),
                  html: JSON.stringify(rendered),
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

    expect(response?.status).toBe(200)
    expect(callOrder).toEqual(['render-stream:start', 'ssr-root', 'render-stream:end'])
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
    expect(html).toContain(`"id":"${'eclipsa-app-hooks'}"`)
    expect(html).not.toContain('__ECLIPSA_RESUME_PAYLOAD__')
    expect(html).not.toContain('__ECLIPSA_ROUTE_MANIFEST__')
    expect(html).not.toContain('__ECLIPSA_APP_HOOKS__')
  })

  it('replaces repeated resume placeholders across serialized head output', async () => {
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
              Fragment: Symbol.for('fragment'),
              RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
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
                  return {
                    ...value,
                    ...(value.props ? { props: resolveNode(value.props) } : {}),
                  }
                }

                return {
                  chunks: (async function* () {})(),
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

    expect(html).toContain('"children":"{}"')
    expect(html).toContain('"id":"eclipsa-route-manifest"')
    expect(html).toContain('"routePath":"/"')
    expect(html).toContain('"id":"eclipsa-app-hooks"')
    expect(html).toContain('"client":null')
    expect(html).not.toContain('__ECLIPSA_RESUME_PAYLOAD__')
    expect(html).not.toContain('__ECLIPSA_ROUTE_MANIFEST__')
    expect(html).not.toContain('__ECLIPSA_APP_HOOKS__')
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

  it('returns prefetched loader snapshots from the route-data endpoint', async () => {
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
          if (id === '/tmp/app/+page.tsx') {
            return {
              default() {
                return null
              },
            }
          }
          if (id === 'eclipsa') {
            return {
              renderSSRAsync: async () => ({
                payload: {
                  loaders: {
                    profile: {
                      data: { name: 'Ada' },
                      error: null,
                      loaded: true,
                    },
                  },
                },
              }),
              resolvePendingLoaders: vi.fn(),
            }
          }
          return {
            default(props: any) {
              return props ?? null
            },
          }
        },
      } as any,
      ssrEnv: {} as any,
    })

    const response = await devFetch.fetch(
      new Request(
        'http://127.0.0.1:4173/__eclipsa/route-data?href=http%3A%2F%2F127.0.0.1%3A4173%2F',
      ),
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
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

  it('returns middleware redirects from the route-data endpoint without HTML', async () => {
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
          if (id === 'eclipsa') {
            return {
              renderSSRAsync: vi.fn(),
              resolvePendingLoaders: vi.fn(),
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
      new Request('http://localhost/__eclipsa/route-data?href=http%3A%2F%2Flocalhost%2Fguarded'),
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
      location: 'http://localhost/counter',
      ok: false,
    })
  })

  it('returns not-found loader snapshots from the route-data endpoint', async () => {
    routes = [
      {
        error: null,
        layouts: [],
        loading: null,
        middlewares: [],
        notFound: {
          entryName: 'special___not_found',
          filePath: '/tmp/app/+not-found.tsx',
        },
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
          if (id === '/tmp/app/+not-found.tsx') {
            return {
              default() {
                return null
              },
            }
          }
          if (id === 'eclipsa') {
            return {
              renderSSRAsync: async () => ({
                payload: {
                  loaders: {
                    missing: {
                      data: null,
                      error: { message: 'missing' },
                      loaded: true,
                    },
                  },
                },
              }),
              resolvePendingLoaders: vi.fn(),
            }
          }
          return {
            default(props: any) {
              return props ?? null
            },
          }
        },
      } as any,
      ssrEnv: {} as any,
    })

    const response = await devFetch.fetch(
      new Request('http://localhost/__eclipsa/route-data?href=http%3A%2F%2Flocalhost%2Fmissing'),
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
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

  it('returns document fallback when route-data loader rendering throws notFound without a special route', async () => {
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
          if (id === '/tmp/app/+page.tsx') {
            return {
              default() {
                return null
              },
            }
          }
          if (id === 'eclipsa') {
            return {
              renderSSRAsync: async () => {
                throw {
                  __eclipsa_not_found__: true,
                }
              },
              resolvePendingLoaders: vi.fn(),
            }
          }
          return {
            default(props: any) {
              return props ?? null
            },
          }
        },
      } as any,
      ssrEnv: {} as any,
    })

    const response = await devFetch.fetch(
      new Request(
        'http://127.0.0.1:4173/__eclipsa/route-data?href=http%3A%2F%2F127.0.0.1%3A4173%2F',
      ),
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
      document: true,
      ok: false,
    })
  })

  it('logs route render failures with a fixed stack before returning a 500 response', async () => {
    const error = new Error('boom')
    const ssrFixStacktrace = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const devFetch = createDevFetch({
      resolvedConfig: {
        root: '/tmp',
      } as any,
      devServer: {
        ssrFixStacktrace,
      } as any,
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
            throw error
          }
          if (id === 'eclipsa') {
            return {}
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

    expect(response?.status).toBe(500)
    await expect(response?.text()).resolves.toBe('Internal Server Error')
    expect(ssrFixStacktrace).toHaveBeenCalledWith(error)
    expect(consoleError).toHaveBeenCalledWith(error)
    consoleError.mockRestore()
  })
})

describe('shouldInvalidateDevApp', () => {
  it('tracks app tsx edits and server-entry changes', () => {
    expect(shouldInvalidateDevApp('/tmp', '/tmp/app/hello/+page.tsx', 'add')).toBe(true)
    expect(shouldInvalidateDevApp('/tmp', '/tmp/app/+server-entry.ts', 'change')).toBe(true)
    expect(shouldInvalidateDevApp('/tmp', '/tmp/src/hello/+page.tsx', 'add')).toBe(false)
  })
})
