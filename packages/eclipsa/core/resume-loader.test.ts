import { describe, expect, it, vi } from 'vitest'
import { installResumeLoader, needsFullResumeOnStart } from './resume-loader.ts'
import type { ResumePayload } from './runtime/types.ts'

class FakeElement {
  readonly nodeType = 1
  ownerDocument: FakeDocument
  parentElement: FakeElement | null = null
  target = ''
  private readonly attrs = new Map<string, string>()

  constructor(
    ownerDocument: FakeDocument,
    readonly tagName = 'div',
  ) {
    this.ownerDocument = ownerDocument
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  hasAttribute(name: string) {
    return this.attrs.has(name)
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }
}

class FakeDocument {
  readonly listeners = new Map<string, Set<(event: Event) => void>>()
  readonly body = new FakeElement(this)
  readonly location = {
    href: 'http://example.com/',
    origin: 'http://example.com',
  }

  addEventListener(eventName: string, listener: (event: Event) => void) {
    let listeners = this.listeners.get(eventName)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(eventName, listeners)
    }
    listeners.add(listener)
  }

  removeEventListener(eventName: string, listener: (event: Event) => void) {
    this.listeners.get(eventName)?.delete(listener)
  }

  dispatch(event: Event) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event)
    }
  }
}

const createEvent = (type: string, target: FakeElement) =>
  ({
    cancelable: true,
    currentTarget: null,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
    stopImmediatePropagation: vi.fn(),
    target,
    type,
  }) as unknown as Event & { defaultPrevented: boolean; stopImmediatePropagation: () => void }

const createPayload = (overrides: Partial<ResumePayload>): ResumePayload => ({
  actions: {},
  components: {},
  loaders: {},
  scopes: {},
  signals: {},
  subscriptions: {},
  symbols: {},
  visibles: {},
  watches: {},
  ...overrides,
})

describe('resume loader', () => {
  it('runs primitive scoped event symbols without loading the full runtime', async () => {
    const doc = new FakeDocument()
    const button = new FakeElement(doc)
    button.parentElement = doc.body
    button.setAttribute('data-e-onclick', 'click-symbol:sc0')
    const calls: unknown[] = []
    ;(globalThis as { __eclipsaResumeLoaderCalls?: unknown[] }).__eclipsaResumeLoaderCalls = calls

    const payload = createPayload({
      scopes: {
        sc0: ['payload'],
      },
      symbols: {
        'click-symbol': new URL('./resume-loader-symbol.fixture.ts', import.meta.url).href,
      },
    })
    const loadFullResume = vi.fn()

    installResumeLoader(doc.body as unknown as HTMLElement, payload, { loadFullResume })
    button.setAttribute('id', 'button')
    doc.dispatch(createEvent('click', button))
    for (let attempt = 0; attempt < 100 && calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    expect(loadFullResume).not.toHaveBeenCalled()
    expect(calls).toEqual([[['payload'], 'button']])
  })

  it('promotes to full resume when captured scope needs runtime references', () => {
    const doc = new FakeDocument()
    const button = new FakeElement(doc)
    button.parentElement = doc.body
    button.setAttribute('data-e-onclick', 'click-symbol:sc0')
    const payload = createPayload({
      scopes: {
        sc0: [{ __eclipsa_type: 'ref', kind: 'signal', token: 's0' }],
      },
      symbols: {
        'click-symbol': '/symbol.js',
      },
    })
    const loadFullResume = vi.fn()

    installResumeLoader(doc.body as unknown as HTMLElement, payload, { loadFullResume })
    const event = createEvent('click', button)
    doc.dispatch(event)

    expect(loadFullResume).toHaveBeenCalledWith(event)
    expect(event.defaultPrevented).toBe(true)
    expect(event.stopImmediatePropagation).toHaveBeenCalled()
  })

  it('promotes to full resume when captured scope uses an unknown serialized type', () => {
    const doc = new FakeDocument()
    const button = new FakeElement(doc)
    button.parentElement = doc.body
    button.setAttribute('data-e-onclick', 'click-symbol:sc0')
    const payload = createPayload({
      scopes: {
        sc0: [{ __eclipsa_type: 'future-type' } as any],
      },
      symbols: {
        'click-symbol': '/symbol.js',
      },
    })
    const loadFullResume = vi.fn()

    installResumeLoader(doc.body as unknown as HTMLElement, payload, { loadFullResume })
    const event = createEvent('click', button)
    doc.dispatch(event)

    expect(loadFullResume).toHaveBeenCalledWith(event)
    expect(event.defaultPrevented).toBe(true)
    expect(event.stopImmediatePropagation).toHaveBeenCalled()
  })

  it('captures route link navigation before promoting to full resume', () => {
    const previousPending = (globalThis as Record<string, unknown>).__epl
    const doc = new FakeDocument()
    const link = new FakeElement(doc, 'a')
    link.parentElement = doc.body
    link.setAttribute('data-e-link', '')
    link.setAttribute('href', '/counter')
    const payload = createPayload({})
    const loadFullResume = vi.fn()

    try {
      delete (globalThis as Record<string, unknown>).__epl

      installResumeLoader(doc.body as unknown as HTMLElement, payload, { loadFullResume })
      const event = createEvent('click', link)
      doc.dispatch(event)

      expect(loadFullResume).toHaveBeenCalledWith(event)
      expect((globalThis as Record<string, unknown>).__epl).toEqual({
        href: 'http://example.com/counter',
        replace: false,
      })
      expect(event.defaultPrevented).toBe(true)
    } finally {
      if (previousPending === undefined) {
        delete (globalThis as Record<string, unknown>).__epl
      } else {
        ;(globalThis as Record<string, unknown>).__epl = previousPending
      }
    }
  })

  it('keeps startup on the lightweight loader when no full-runtime feature is present', () => {
    expect(needsFullResumeOnStart(createPayload({}), { client: null })).toBe(false)
  })

  it('requires full resume when client hooks are present', () => {
    expect(needsFullResumeOnStart(createPayload({}), { client: '/hooks.js' })).toBe(true)
  })

  it('requires full resume when visible or watch callbacks are serialized', () => {
    expect(
      needsFullResumeOnStart(
        createPayload({
          visibles: {
            v0: {} as any,
          },
        }),
        { client: null },
      ),
    ).toBe(true)
    expect(
      needsFullResumeOnStart(
        createPayload({
          watches: {
            w0: {} as any,
          },
        }),
        { client: null },
      ),
    ).toBe(true)
  })

  it('requires full resume when external components are serialized', () => {
    expect(
      needsFullResumeOnStart(
        createPayload({
          components: {
            c0: {
              external: {} as any,
            } as any,
          },
        }),
        { client: null },
      ),
    ).toBe(true)
  })
})
