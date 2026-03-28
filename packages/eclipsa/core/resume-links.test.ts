import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resumeContainer interactivity bootstrap', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('binds resumable listeners before route priming finishes', async () => {
    const container = {} as object
    let resolvePrime: (() => void) | null = null
    const OriginalDocument = globalThis.Document

    class FakeDocument {}

    const createResumeContainer = vi.fn(() => container)
    const installResumeListeners = vi.fn()
    const primeRouteModules = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePrime = resolve
        }),
    )
    const registerResumeContainer = vi.fn()
    const restoreRegisteredRpcHandles = vi.fn()
    const restoreResumedLocalSignalEffects = vi.fn()
    const registerClientHooks = vi.fn()

    vi.doMock('./runtime.ts', () => ({
      RESUME_FINAL_STATE_ELEMENT_ID: 'resume-final',
      RESUME_STATE_ELEMENT_ID: 'resume',
      applyResumeHmrUpdateToRegisteredContainers: vi.fn(),
      createResumeContainer,
      installResumeListeners,
      primeRouteModules,
      refreshRegisteredRouteContainers: vi.fn(),
      registerResumeContainer,
      restoreRegisteredRpcHandles,
      restoreResumedLocalSignalEffects,
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
      expect(installResumeListeners).toHaveBeenCalledWith(container)
      expect(registerResumeContainer).not.toHaveBeenCalled()

      ;(resolvePrime as (() => void) | null)?.()
      await resumePromise

      expect(registerClientHooks).toHaveBeenCalledWith({})
      expect(restoreRegisteredRpcHandles).toHaveBeenCalledWith(container)
      expect(restoreResumedLocalSignalEffects).toHaveBeenCalledWith(container)
      expect(registerResumeContainer).toHaveBeenCalledWith(container)
      expect(root.setAttribute).toHaveBeenCalledWith('data-e-resume', 'resumed')
      expect(installResumeListeners).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.Document = OriginalDocument
    }
  })

  it('does not wait for local signal restoration before binding resumable listeners', async () => {
    const container = {} as object
    let resolveRestore: (() => void) | null = null
    const OriginalDocument = globalThis.Document

    class FakeDocument {}

    const createResumeContainer = vi.fn(() => container)
    const installResumeListeners = vi.fn()
    const primeRouteModules = vi.fn(async () => {})
    const registerResumeContainer = vi.fn()
    const restoreRegisteredRpcHandles = vi.fn()
    const restoreResumedLocalSignalEffects = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRestore = resolve
        }),
    )
    const registerClientHooks = vi.fn()

    vi.doMock('./runtime.ts', () => ({
      RESUME_FINAL_STATE_ELEMENT_ID: 'resume-final',
      RESUME_STATE_ELEMENT_ID: 'resume',
      applyResumeHmrUpdateToRegisteredContainers: vi.fn(),
      createResumeContainer,
      installResumeListeners,
      primeRouteModules,
      refreshRegisteredRouteContainers: vi.fn(),
      registerResumeContainer,
      restoreRegisteredRpcHandles,
      restoreResumedLocalSignalEffects,
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

      expect(installResumeListeners).toHaveBeenCalledWith(container)
      expect(registerResumeContainer).not.toHaveBeenCalled()
      expect(root.setAttribute).not.toHaveBeenCalled()

      ;(resolveRestore as (() => void) | null)?.()
      await resumePromise

      expect(registerResumeContainer).toHaveBeenCalledWith(container)
      expect(root.setAttribute).toHaveBeenCalledWith('data-e-resume', 'resumed')
      expect(installResumeListeners).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.Document = OriginalDocument
    }
  })
})
