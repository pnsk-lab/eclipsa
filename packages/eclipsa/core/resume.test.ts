import { describe, expect, it, vi } from 'vitest'
import {
  applyResumeHmrSymbolReplacements,
  applyResumeHmrUpdate,
  bustRuntimeSymbolUrls,
  collectResumeHmrBoundaryIds,
  createResumeContainer,
  invalidateRuntimeSymbolCaches,
  markResumeHmrBoundaryDirty,
  refreshRouteContainer,
  type RuntimeContainer,
} from './runtime.ts'

const createContainer = (overrides?: Partial<RuntimeContainer>) =>
  ({
    actionStates: new Map(),
    actions: new Map(),
    asyncSignalSnapshotCache: new Map(),
    asyncSignalStates: new Map(),
    components: new Map(),
    dirty: new Set(),
    doc: undefined,
    id: 'rt-test',
    imports: new Map(),
    loaderStates: new Map(),
    loaders: new Map(),
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
    pendingSuspensePromises: new Set(),
    router: null,
    rootChildCursor: 0,
    rootElement: undefined,
    scopes: new Map(),
    signals: new Map(),
    symbols: new Map(),
    visibilityCheckQueued: false,
    visibilityListenersCleanup: null,
    visibles: new Map(),
    watches: new Map(),
    ...overrides,
  }) as RuntimeContainer

const withFakeResumeDocument = <T>(
  options: {
    pathname?: string
    comments?: string[]
  },
  fn: (doc: Document) => T,
) => {
  const OriginalComment = globalThis.Comment
  const OriginalDocument = globalThis.Document
  const OriginalNode = globalThis.Node
  const originalNodeFilter = globalThis.NodeFilter

  class FakeNode {}
  class FakeComment extends FakeNode {
    constructor(readonly data: string) {
      super()
    }
  }
  class FakeDocument {
    body: HTMLElement
    location = { pathname: options.pathname ?? '/' } as Location
    #comments: FakeComment[]

    constructor() {
      this.#comments = (options.comments ?? []).map((data) => new FakeComment(data))
      this.body = { ownerDocument: this } as unknown as HTMLElement
    }

    createTreeWalker() {
      let index = -1
      return {
        currentNode: null as FakeComment | null,
        nextNode() {
          index += 1
          const node = (this.currentNode = (options.comments ?? [])[index]
            ? new FakeComment((options.comments ?? [])[index]!)
            : null)
          return node
        },
      }
    }
  }

  globalThis.Comment = FakeComment as unknown as typeof Comment
  globalThis.Document = FakeDocument as unknown as typeof Document
  globalThis.Node = FakeNode as unknown as typeof Node
  globalThis.NodeFilter = { SHOW_COMMENT: 128 } as typeof NodeFilter
  try {
    return fn(new FakeDocument() as unknown as Document)
  } finally {
    globalThis.Comment = OriginalComment
    globalThis.Document = OriginalDocument
    globalThis.Node = OriginalNode
    globalThis.NodeFilter = originalNodeFilter
  }
}

describe('resume HMR runtime helpers', () => {
  it('updates both old and next symbol ids when applying URL replacements', () => {
    const container = createContainer({
      imports: new Map([
        ['old-symbol', Promise.resolve({ default: () => null })],
        ['next-symbol', Promise.resolve({ default: () => null })],
      ]),
      symbols: new Map([['old-symbol', '/app/+page.tsx?eclipsa-symbol=old-symbol']]),
    })

    applyResumeHmrSymbolReplacements(container, {
      'old-symbol': '/app/+page.tsx?eclipsa-symbol=next-symbol',
    })

    expect(container.symbols.get('old-symbol')).toBe('/app/+page.tsx?eclipsa-symbol=next-symbol')
    expect(container.symbols.get('next-symbol')).toBe('/app/+page.tsx?eclipsa-symbol=next-symbol')
    expect(container.imports.has('old-symbol')).toBe(false)
    expect(container.imports.has('next-symbol')).toBe(false)
  })

  it('keeps historical symbol aliases pointed at the latest URL across repeated updates', () => {
    const container = createContainer({
      components: new Map([
        [
          'c0',
          {
            active: true,
            didMount: false,
            end: {} as Comment,
            id: 'c0',
            mountCleanupSlots: [],
            parentId: '$root',
            props: {},
            projectionSlots: null,
            scopeId: 'scope-root',
            signalIds: [],
            start: {} as Comment,
            symbol: 'old-symbol',
            visibleCount: 0,
            watchCount: 0,
          },
        ],
      ]),
      imports: new Map([
        ['old-symbol', Promise.resolve({ default: () => null })],
        ['mid-symbol', Promise.resolve({ default: () => null })],
      ]),
      symbols: new Map([['old-symbol', '/app/+page.tsx?eclipsa-symbol=old-symbol']]),
      visibles: new Map([
        [
          'v0',
          {
            cleanupSlot: { callbacks: [] },
            componentId: 'c0',
            done: false,
            id: 'v0',
            pending: null,
            run: null,
            scopeId: 'scope-root',
            symbol: 'old-symbol',
          },
        ],
      ]),
      watches: new Map([
        [
          'w0',
          {
            cleanupSlot: { callbacks: [] },
            componentId: 'c0',
            effect: {
              fn: () => {},
              signals: new Set(),
            },
            id: 'w0',
            mode: 'dynamic',
            pending: null,
            run: null,
            scopeId: 'scope-root',
            symbol: 'old-symbol',
            track: null,
          },
        ],
      ]),
    })

    expect(collectResumeHmrBoundaryIds(container, ['old-symbol'])).toEqual(['c0'])

    applyResumeHmrSymbolReplacements(container, {
      'old-symbol': '/app/+page.tsx?eclipsa-symbol=mid-symbol',
    })
    expect(container.components.get('c0')?.symbol).toBe('mid-symbol')
    expect(container.visibles.get('v0')?.symbol).toBe('mid-symbol')
    expect(container.watches.get('w0')?.symbol).toBe('mid-symbol')
    expect(collectResumeHmrBoundaryIds(container, ['mid-symbol'])).toEqual(['c0'])

    applyResumeHmrSymbolReplacements(container, {
      'mid-symbol': '/app/+page.tsx?eclipsa-symbol=next-symbol',
    })

    expect(container.symbols.get('old-symbol')).toBe('/app/+page.tsx?eclipsa-symbol=next-symbol')
    expect(container.symbols.get('mid-symbol')).toBe('/app/+page.tsx?eclipsa-symbol=next-symbol')
    expect(container.symbols.get('next-symbol')).toBe('/app/+page.tsx?eclipsa-symbol=next-symbol')
    expect(container.components.get('c0')?.symbol).toBe('next-symbol')
    expect(container.visibles.get('v0')?.symbol).toBe('next-symbol')
    expect(container.watches.get('w0')?.symbol).toBe('next-symbol')
    expect(collectResumeHmrBoundaryIds(container, ['next-symbol'])).toEqual(['c0'])
    expect(container.imports.has('old-symbol')).toBe(false)
    expect(container.imports.has('mid-symbol')).toBe(false)
    expect(container.imports.has('next-symbol')).toBe(false)
  })

  it('rerenders the nearest mounted boundary for nested active components', () => {
    const container = createContainer({
      components: new Map([
        [
          'c0',
          {
            active: true,
            didMount: false,
            end: {} as Comment,
            id: 'c0',
            mountCleanupSlots: [],
            parentId: '$root',
            props: {},
            projectionSlots: null,
            scopeId: 'scope-root',
            signalIds: [],
            start: {} as Comment,
            symbol: 'page-symbol',
            visibleCount: 0,
            watchCount: 0,
          },
        ],
        [
          'c0.0',
          {
            active: true,
            didMount: false,
            id: 'c0.0',
            mountCleanupSlots: [],
            parentId: 'c0',
            props: {},
            projectionSlots: null,
            scopeId: 'scope-header',
            signalIds: [],
            symbol: 'header-symbol',
            visibleCount: 0,
            watchCount: 0,
          },
        ],
      ]),
    })

    expect(collectResumeHmrBoundaryIds(container, ['header-symbol'])).toEqual(['c0'])
  })

  it('treats client-side route roots with the page component symbol as HMR boundaries', () => {
    const container = createContainer({
      components: new Map([
        [
          'c0',
          {
            active: true,
            didMount: false,
            end: {} as Comment,
            id: 'c0',
            mountCleanupSlots: [],
            parentId: '$root',
            props: {},
            projectionSlots: null,
            scopeId: 'scope-root',
            signalIds: [],
            start: {} as Comment,
            symbol: 'page-symbol',
            visibleCount: 0,
            watchCount: 0,
          },
        ],
      ]),
    })

    expect(collectResumeHmrBoundaryIds(container, ['page-symbol'])).toEqual(['c0'])
  })

  it('applies replacement-only payloads without requiring DOM rerender', async () => {
    const container = createContainer({
      imports: new Map([['old-symbol', Promise.resolve({ default: () => null })]]),
      symbols: new Map([['old-symbol', '/app/+page.tsx?eclipsa-symbol=old-symbol']]),
    })

    const result = await applyResumeHmrUpdate(container, {
      fileUrl: '/app/+page.tsx',
      fullReload: false,
      rerenderComponentSymbols: [],
      rerenderOwnerSymbols: [],
      symbolUrlReplacements: {
        'old-symbol': '/app/+page.tsx?eclipsa-symbol=next-symbol',
      },
    })

    expect(result).toBe('updated')
    expect(container.symbols.get('next-symbol')).toBe('/app/+page.tsx?eclipsa-symbol=next-symbol')
  })

  it('forces HMR boundary remounts to rebuild slot content instead of reusing old DOM', () => {
    const container = createContainer({
      components: new Map([
        [
          'c0',
          {
            active: true,
            didMount: false,
            end: {} as Comment,
            id: 'c0',
            mountCleanupSlots: [],
            parentId: '$root',
            props: {},
            projectionSlots: { children: 1 },
            reuseExistingDomOnActivate: true,
            reuseProjectionSlotDomOnActivate: true,
            scopeId: 'scope-root',
            signalIds: [],
            start: {} as Comment,
            symbol: 'layout-symbol',
            visibleCount: 0,
            watchCount: 0,
          },
        ],
      ]),
    })

    expect(markResumeHmrBoundaryDirty(container, 'c0')).toBe(true)
    expect(container.components.get('c0')?.active).toBe(false)
    expect(container.components.get('c0')?.reuseExistingDomOnActivate).toBe(false)
    expect(container.components.get('c0')?.reuseProjectionSlotDomOnActivate).toBe(false)
    expect(container.dirty).toEqual(new Set(['c0']))
  })

  it('invalidates cached modules for rerendered symbols even when the symbol id stays stable', () => {
    const container = createContainer({
      imports: new Map([
        ['stable-symbol', Promise.resolve({ default: () => null })],
        ['other-symbol', Promise.resolve({ default: () => null })],
      ]),
    })

    invalidateRuntimeSymbolCaches(container, ['stable-symbol'])

    expect(container.imports.has('stable-symbol')).toBe(false)
    expect(container.imports.has('other-symbol')).toBe(true)
  })

  it('cache-busts stable symbol URLs before rerendering unchanged symbol ids', () => {
    const container = createContainer({
      symbols: new Map([
        ['stable-symbol', '/app/+page.tsx?eclipsa-symbol=stable-symbol'],
      ]),
    })

    bustRuntimeSymbolUrls(container, ['stable-symbol'], 123)

    expect(container.symbols.get('stable-symbol')).toBe(
      '/app/+page.tsx?eclipsa-symbol=stable-symbol&t=123',
    )
  })

  it('registers freshly added symbol URLs when the payload includes direct additions', () => {
    const container = createContainer({
      imports: new Map([['new-symbol', Promise.resolve({ default: () => null })]]),
    })

    applyResumeHmrSymbolReplacements(container, {
      'new-symbol': '/app/+page.tsx?eclipsa-symbol=new-symbol',
    })

    expect(container.symbols.get('new-symbol')).toBe('/app/+page.tsx?eclipsa-symbol=new-symbol')
    expect(container.imports.has('new-symbol')).toBe(false)
  })

  it('advances signal and scope cursors when restoring a resumed container', () => {
    withFakeResumeDocument({}, (doc) => {
      const container = createResumeContainer(doc, {
        actions: {},
        components: {},
        loaders: {},
        scopes: {
          sc0: [],
          sc3: [],
        },
        signals: {
          s0: 1,
          s2: 2,
          '$router:isNavigating': false,
          '$router:path': '/',
        },
        subscriptions: {},
        symbols: {},
        visibles: {},
        watches: {},
      })

      expect(container.nextScopeId).toBe(4)
      expect(container.nextSignalId).toBe(3)
    })
  })

  it('restores mounted boundary markers and keeps resumed components dirty-trackable', () => {
    withFakeResumeDocument(
      {
        comments: ['ec:c:c0:start', 'ec:c:c0:end'],
      },
      (doc) => {
        const container = createResumeContainer(doc, {
          actions: {},
          components: {
            c0: {
              props: {
                __eclipsa_type: 'object',
                entries: [],
              },
              scope: 'sc0',
              signalIds: ['s0'],
              symbol: 'page-symbol',
              visibleCount: 0,
              watchCount: 0,
            },
          },
          loaders: {},
          scopes: {
            sc0: [],
          },
          signals: {
            s0: 1,
            '$router:isNavigating': false,
            '$router:path': '/',
          },
          subscriptions: {
            s0: ['c0'],
            '$router:isNavigating': [],
            '$router:path': [],
          },
          symbols: {},
          visibles: {},
          watches: {},
        })

        const component = container.components.get('c0')
        expect(component?.active).toBe(false)
        expect(component?.start).toBeDefined()
        expect(component?.end).toBeDefined()

        container.signals.get('s0')!.handle.value = 2
        expect(container.dirty).toEqual(new Set(['c0']))
      },
    )
  })

  it('restores ref signals without requiring a global Element constructor', () => {
    const globalRecord = globalThis as Record<PropertyKey, unknown>
    const OriginalComment = globalThis.Comment
    const OriginalDocument = globalThis.Document
    const OriginalElement = globalRecord.Element
    const OriginalHTMLElement = globalThis.HTMLElement
    const OriginalNode = globalThis.Node
    const originalNodeFilter = globalThis.NodeFilter

    class FakeNode {}
    class FakeComment extends FakeNode {}
    class FakeElement extends FakeNode {
      ownerDocument: FakeDocument
      #attributes = new Map<string, string>()

      constructor(ownerDocument: FakeDocument) {
        super()
        this.ownerDocument = ownerDocument
      }

      getAttribute(name: string) {
        return this.#attributes.get(name) ?? null
      }

      querySelectorAll() {
        return [] as unknown as NodeListOf<Element>
      }

      setAttribute(name: string, value: string) {
        this.#attributes.set(name, value)
      }
    }

    class FakeDocument {
      body: FakeElement
      defaultView = {
        HTMLElement: FakeElement,
      } as unknown as Window
      location = { pathname: '/' } as Location

      constructor() {
        this.body = new FakeElement(this)
      }

      createTreeWalker() {
        return {
          currentNode: null,
          nextNode() {
            return null
          },
        }
      }
    }

    globalThis.Comment = FakeComment as unknown as typeof Comment
    globalThis.Document = FakeDocument as unknown as typeof Document
    globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement
    globalThis.Node = FakeNode as unknown as typeof Node
    globalThis.NodeFilter = { SHOW_COMMENT: 128 } as typeof NodeFilter
    globalRecord.Element = undefined

    try {
      const doc = new FakeDocument() as unknown as Document
      ;(doc.body as unknown as FakeElement).setAttribute('data-e-ref', 's0')

      const container = createResumeContainer(doc, {
        actions: {},
        components: {},
        loaders: {},
        scopes: {},
        signals: {
          s0: null,
          '$router:isNavigating': false,
          '$router:path': '/',
        },
        subscriptions: {
          s0: [],
          '$router:isNavigating': [],
          '$router:path': [],
        },
        symbols: {},
        visibles: {},
        watches: {},
      })

      expect(container.signals.get('s0')?.value).toBe(doc.body)
    } finally {
      globalThis.Comment = OriginalComment
      globalThis.Document = OriginalDocument
      globalThis.HTMLElement = OriginalHTMLElement
      globalThis.Node = OriginalNode
      globalThis.NodeFilter = originalNodeFilter
      globalRecord.Element = OriginalElement
    }
  })

  it('forces current-route refreshes even when the href has not changed', async () => {
    const replace = vi.fn()
    const container = createContainer({
      doc: {
        defaultView: {
          location: {
            assign() {},
            replace,
          },
        },
        location: {
          hash: '',
          href: 'http://example.com/docs/getting-started',
          origin: 'http://example.com',
          pathname: '/docs/getting-started',
          search: '',
        },
        title: 'Docs',
      } as unknown as Document,
      rootElement: {
        firstChild: null,
      } as unknown as HTMLElement,
    })

    await refreshRouteContainer(container)

    expect(replace).toHaveBeenCalledWith('http://example.com/docs/getting-started')
  })
})
