import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createResumePayload = () => ({
  actions: {},
  components: {},
  loaders: {},
  scopes: {},
  signals: {},
  subscriptions: {},
  symbols: {},
  visibles: {},
  watches: {},
})

describe('resumeContainer interactivity bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('installs the lightweight resume loader without importing the full runtime first', async () => {
    const OriginalDocument = globalThis.Document
    class FakeDocument {}

    const installResumeLoader = vi.fn()
    const needsFullResumeOnStart = vi.fn(() => false)
    const fullResumeContainer = vi.fn()

    vi.doMock('./resume-loader.ts', () => ({
      installResumeLoader,
      needsFullResumeOnStart,
    }))
    vi.doMock('./resume-full.ts', () => ({
      resumeContainer: fullResumeContainer,
    }))

    const { resumeContainer } = await import('./resume.ts')

    const root = {
      ownerDocument: undefined as Document | undefined,
      setAttribute: vi.fn(),
    } as unknown as HTMLElement & { ownerDocument?: Document }
    const doc = Object.assign(new FakeDocument(), {
      body: root,
      location: {
        href: 'http://example.com/',
        origin: 'http://example.com',
        pathname: '/',
      },
      getElementById(id: string) {
        if (id === 'eclipsa-resume') {
          return { textContent: JSON.stringify(createResumePayload()) }
        }
        if (id === 'eclipsa-app-hooks') {
          return { textContent: JSON.stringify({ client: null, routeDataEndpoint: false }) }
        }
        if (id === 'eclipsa-route-manifest') {
          return { textContent: JSON.stringify([]) }
        }
        return null
      },
    }) as unknown as Document
    root.ownerDocument = doc

    globalThis.Document = FakeDocument as unknown as typeof Document
    try {
      await resumeContainer(doc)

      expect(needsFullResumeOnStart).toHaveBeenCalledWith(expect.any(Object), {
        client: null,
        routeDataEndpoint: false,
      })
      expect(installResumeLoader).toHaveBeenCalledWith(root, expect.any(Object), {
        loadFullResume: expect.any(Function),
      })
      expect(root.setAttribute).toHaveBeenCalledWith('data-e-resume', 'resumed')
      expect(fullResumeContainer).not.toHaveBeenCalled()
    } finally {
      globalThis.Document = OriginalDocument
    }
  })

  it('falls back to full resume when startup features require it', async () => {
    const OriginalDocument = globalThis.Document
    class FakeDocument {}

    const installResumeLoader = vi.fn()
    const needsFullResumeOnStart = vi.fn(() => true)
    const fullResumeContainer = vi.fn()

    vi.doMock('./resume-loader.ts', () => ({
      installResumeLoader,
      needsFullResumeOnStart,
    }))
    vi.doMock('./resume-full.ts', () => ({
      resumeContainer: fullResumeContainer,
    }))

    const { resumeContainer } = await import('./resume.ts')

    const root = {
      ownerDocument: undefined as Document | undefined,
      setAttribute: vi.fn(),
    } as unknown as HTMLElement & { ownerDocument?: Document }
    const doc = Object.assign(new FakeDocument(), {
      body: root,
      location: {
        href: 'http://example.com/',
        origin: 'http://example.com',
        pathname: '/',
      },
      getElementById(id: string) {
        if (id === 'eclipsa-resume') {
          return { textContent: JSON.stringify(createResumePayload()) }
        }
        if (id === 'eclipsa-app-hooks') {
          return { textContent: JSON.stringify({ client: '/hooks.js' }) }
        }
        return null
      },
    }) as unknown as Document
    root.ownerDocument = doc

    globalThis.Document = FakeDocument as unknown as typeof Document
    try {
      await resumeContainer(doc)

      expect(installResumeLoader).not.toHaveBeenCalled()
      expect(fullResumeContainer).toHaveBeenCalledWith(doc, undefined)
      expect(root.setAttribute).not.toHaveBeenCalled()
    } finally {
      globalThis.Document = OriginalDocument
    }
  })

  it('replays the event that promoted full resume before releasing queued events', async () => {
    const OriginalDocument = globalThis.Document
    class FakeDocument {}

    vi.doUnmock('./resume-full.ts')
    const order: string[] = []
    const replayEvent = { type: 'input' } as Event
    const root = {
      ownerDocument: undefined as Document | undefined,
      setAttribute: vi.fn(),
    } as unknown as HTMLElement & { ownerDocument?: Document }
    const doc = Object.assign(new FakeDocument(), {
      body: root,
      getElementById(id: string) {
        if (id === 'eclipsa-resume') {
          return { textContent: JSON.stringify(createResumePayload()) }
        }
        if (id === 'eclipsa-app-hooks') {
          return { textContent: JSON.stringify({ client: null, routeDataEndpoint: false }) }
        }
        if (id === 'eclipsa-route-manifest') {
          return { textContent: JSON.stringify([]) }
        }
        return null
      },
    }) as unknown as Document
    root.ownerDocument = doc

    vi.doMock('./runtime.ts', () => ({
      RESUME_FINAL_STATE_ELEMENT_ID: 'eclipsa-resume-final',
      RESUME_STATE_ELEMENT_ID: 'eclipsa-resume',
      applyResumeHmrUpdateToRegisteredContainers: vi.fn(),
      createResumeContainer: vi.fn((_root, _payload, options) => ({
        doc,
        options,
        resumeReadyPromise: null,
      })),
      dispatchDocumentEvent: vi.fn(async (_container, event) => {
        expect(event).toBe(replayEvent)
        order.push('replay')
      }),
      installResumeListeners: vi.fn((container) => {
        container.resumeReadyPromise?.then(() => {
          order.push('ready')
        })
      }),
      primeRouteModules: vi.fn(),
      refreshRegisteredRouteContainers: vi.fn(),
      registerResumeContainer: vi.fn(),
      restoreRegisteredRpcHandles: vi.fn(),
      restoreResumedExternalComponents: vi.fn(),
      restoreResumedLocalSignalEffects: vi.fn(),
    }))
    vi.doMock('./hooks.ts', () => ({
      APP_HOOKS_ELEMENT_ID: 'eclipsa-app-hooks',
      registerClientHooks: vi.fn(),
    }))
    vi.doMock('./router-shared.ts', () => ({
      ROUTE_MANIFEST_ELEMENT_ID: 'eclipsa-route-manifest',
    }))
    vi.doMock('./resume-hmr.ts', () => ({
      RESUME_HMR_EVENT: 'eclipsa:resume-update',
    }))

    globalThis.Document = FakeDocument as unknown as typeof Document
    try {
      const { resumeContainer } = await import('./resume-full.ts')

      await resumeContainer(doc, { replayEvent })
      await Promise.resolve()

      expect(order).toEqual(['replay', 'ready'])
    } finally {
      globalThis.Document = OriginalDocument
    }
  })
})
