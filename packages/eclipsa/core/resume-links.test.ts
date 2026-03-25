import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resumeContainer route link bootstrap', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('binds resumable route links before route priming finishes', async () => {
    const container = {} as object
    let resolvePrime: (() => void) | null = null
    const OriginalDocument = globalThis.Document

    class FakeDocument {}

    const createResumeContainer = vi.fn(() => container)
    const installResumeLinkListeners = vi.fn()
    const installResumeListeners = vi.fn()
    const primeRouteModules = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePrime = resolve
        }),
    )
    const registerResumeContainer = vi.fn()
    const restoreRegisteredRpcHandles = vi.fn()
    const registerClientHooks = vi.fn()

    vi.doMock('./runtime.ts', () => ({
      RESUME_FINAL_STATE_ELEMENT_ID: 'resume-final',
      RESUME_STATE_ELEMENT_ID: 'resume',
      applyResumeHmrUpdateToRegisteredContainers: vi.fn(),
      createResumeContainer,
      installResumeLinkListeners,
      installResumeListeners,
      primeRouteModules,
      refreshRegisteredRouteContainers: vi.fn(),
      registerResumeContainer,
      restoreRegisteredRpcHandles,
    }))
    vi.doMock('./hooks.ts', () => ({
      APP_HOOKS_ELEMENT_ID: 'app-hooks',
      registerClientHooks,
    }))

    const { resumeContainer } = await import('./resume.ts')

    const root = {
      setAttribute: vi.fn(),
    } as unknown as HTMLElement & {
      ownerDocument?: Document
    }
    const doc = Object.assign(new FakeDocument(), {
      body: root,
      getElementById(id: string) {
        if (id === 'resume') {
          return {
            textContent: JSON.stringify({
              actions: {},
              components: {},
              loaders: {},
              scopes: {},
              signals: {},
              subscriptions: {},
              symbols: {},
              visibles: {},
              watches: {},
            }),
          }
        }
        if (id === 'eclipsa-route-manifest') {
          return {
            textContent: JSON.stringify([]),
          }
        }
        if (id === 'app-hooks') {
          return {
            textContent: JSON.stringify({
              client: null,
            }),
          }
        }
        return null
      },
    }) as unknown as Document
    root.ownerDocument = doc

    globalThis.Document = FakeDocument as unknown as typeof Document
    try {
      const resumePromise = resumeContainer(doc)
      await Promise.resolve()

      expect(createResumeContainer).toHaveBeenCalledWith(root, expect.any(Object), {
        routeManifest: [],
      })
      expect(installResumeLinkListeners).toHaveBeenCalledWith(container)
      expect(installResumeListeners).not.toHaveBeenCalled()
      expect(registerResumeContainer).not.toHaveBeenCalled()

      resolvePrime?.()
      await resumePromise

      expect(registerClientHooks).toHaveBeenCalledWith({})
      expect(restoreRegisteredRpcHandles).toHaveBeenCalledWith(container)
      expect(registerResumeContainer).toHaveBeenCalledWith(container)
      expect(root.setAttribute).toHaveBeenCalledWith('data-e-resume', 'resumed')
      expect(installResumeListeners).toHaveBeenCalledWith(container)
    } finally {
      globalThis.Document = OriginalDocument
    }
  })
})
