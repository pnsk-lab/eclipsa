import { describe, expect, it, vi } from 'vitest'

import { component$ } from './component.ts'
import { __eclipsaComponent, __eclipsaLazy } from './internal.ts'
import { createResumeContainer, installResumeListeners } from './runtime.ts'
import { onVisible } from './signal.ts'
import { renderSSR } from './ssr.ts'

class FakeNode {
  nextSibling: FakeNode | null = null
  parentNode: FakeElement | null = null
  previousSibling: FakeNode | null = null

  remove() {
    this.parentNode?.removeChild(this)
  }
}

class FakeComment extends FakeNode {
  constructor(
    readonly data: string,
    readonly ownerDocument: FakeDocument,
  ) {
    super()
  }
}

class FakeElement extends FakeNode {
  attributes = new Map<string, string>()
  childNodes: FakeNode[] = []

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {
    super()
  }

  appendChild(node: FakeNode) {
    return this.insertBefore(node, null)
  }

  insertBefore(node: FakeNode, referenceNode: FakeNode | null) {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
    const nextSibling = referenceNode
    const previousSibling = nextSibling ? nextSibling.previousSibling : this.childNodes.at(-1) ?? null
    node.parentNode = this
    node.previousSibling = previousSibling
    node.nextSibling = nextSibling
    if (previousSibling) {
      previousSibling.nextSibling = node
    }
    if (nextSibling) {
      nextSibling.previousSibling = node
      const index = this.childNodes.indexOf(nextSibling)
      this.childNodes.splice(index, 0, node)
    } else {
      this.childNodes.push(node)
    }
    return node
  }

  querySelectorAll() {
    return [] as unknown as NodeListOf<Element>
  }

  removeChild(node: FakeNode) {
    const index = this.childNodes.indexOf(node)
    if (index < 0) {
      return node
    }
    const previousSibling = node.previousSibling
    const nextSibling = node.nextSibling
    if (previousSibling) {
      previousSibling.nextSibling = nextSibling
    }
    if (nextSibling) {
      nextSibling.previousSibling = previousSibling
    }
    this.childNodes.splice(index, 1)
    node.parentNode = null
    node.previousSibling = null
    node.nextSibling = null
    return node
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
}

class FakeWindow {
  innerHeight = 100
  innerWidth = 100
  #listeners = new Map<string, Set<() => void>>()

  addEventListener(eventName: string, listener: () => void) {
    const listeners = this.#listeners.get(eventName) ?? new Set()
    listeners.add(listener)
    this.#listeners.set(eventName, listeners)
  }

  emit(eventName: string) {
    for (const listener of this.#listeners.get(eventName) ?? []) {
      listener()
    }
  }

  removeEventListener(eventName: string, listener: () => void) {
    this.#listeners.get(eventName)?.delete(listener)
  }
}

class FakeRange {
  constructor(private readonly doc: FakeDocument) {}

  getBoundingClientRect() {
    if (this.doc.visible) {
      return {
        bottom: 10,
        left: 0,
        right: 10,
        top: 0,
      }
    }
    return {
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    }
  }

  getClientRects() {
    const rect = this.getBoundingClientRect()
    return rect.bottom > 0
      ? ({
          0: rect,
          length: 1,
        } as unknown as DOMRectList)
      : ({
          length: 0,
        } as unknown as DOMRectList)
  }

  setEndBefore(_node: FakeComment) {}

  setStartAfter(_node: FakeComment) {}
}

class FakeTreeWalker {
  currentNode: Comment | null = null
  #index = -1

  constructor(private readonly comments: FakeComment[]) {}

  nextNode() {
    this.#index += 1
    this.currentNode = (this.comments[this.#index] ?? null) as unknown as Comment | null
    return this.currentNode
  }
}

class FakeDocument {
  body = new FakeElement('body', this) as unknown as HTMLElement
  defaultView = new FakeWindow() as unknown as Window
  location = { pathname: '/' } as Location
  visible = false
  #listeners = new Map<string, Set<() => void>>()
  #comments: FakeComment[]

  constructor() {
    const start = new FakeComment('ec:c:c0:start', this)
    const element = new FakeElement('div', this)
    const end = new FakeComment('ec:c:c0:end', this)
    ;(this.body as unknown as FakeElement).appendChild(start)
    ;(this.body as unknown as FakeElement).appendChild(element)
    ;(this.body as unknown as FakeElement).appendChild(end)
    this.#comments = [start, end]
  }

  addEventListener(eventName: string, listener: () => void) {
    const listeners = this.#listeners.get(eventName) ?? new Set()
    listeners.add(listener)
    this.#listeners.set(eventName, listeners)
  }

  createComment(data: string) {
    return new FakeComment(data, this) as unknown as Comment
  }

  createElement(tagName: string) {
    return new FakeElement(tagName, this) as unknown as HTMLElement
  }

  createRange() {
    return new FakeRange(this) as unknown as Range
  }

  createTextNode(data: string) {
    return new FakeComment(data, this) as unknown as Text
  }

  createTreeWalker() {
    return new FakeTreeWalker(this.#comments)
  }

  querySelectorAll() {
    return [] as unknown as NodeListOf<Element>
  }

  emit(eventName: string) {
    for (const listener of this.#listeners.get(eventName) ?? []) {
      listener()
    }
  }

  removeEventListener(eventName: string, listener: () => void) {
    this.#listeners.get(eventName)?.delete(listener)
  }
}

const withFakeVisibleDocument = async (fn: (doc: Document, fakeWindow: FakeWindow) => Promise<void>) => {
  const OriginalComment = globalThis.Comment
  const OriginalDocument = globalThis.Document
  const OriginalNode = globalThis.Node
  const OriginalNodeFilter = globalThis.NodeFilter

  globalThis.Comment = FakeComment as unknown as typeof Comment
  globalThis.Document = FakeDocument as unknown as typeof Document
  globalThis.Node = FakeNode as unknown as typeof Node
  globalThis.NodeFilter = { SHOW_COMMENT: 128 } as typeof NodeFilter

  try {
    const doc = new FakeDocument() as unknown as Document
    await fn(doc, (doc as unknown as FakeDocument).defaultView as unknown as FakeWindow)
  } finally {
    globalThis.Comment = OriginalComment
    globalThis.Document = OriginalDocument
    globalThis.Node = OriginalNode
    globalThis.NodeFilter = OriginalNodeFilter
  }
}

const flushAsync = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe('onVisible', () => {
  it('does not run during SSR and serializes resumable visibility callbacks', () => {
    const visible = vi.fn()
    const App = component$(
      __eclipsaComponent(
        () => {
          onVisible(
            __eclipsaLazy(
              'visible-symbol',
              () => {
                visible()
              },
              () => [],
            ),
          )

          return <button>ready</button>
        },
        'component-symbol',
        () => [],
      ),
    )

    const { html, payload } = renderSSR(() => <App />)

    expect(html).toContain('<button>ready</button>')
    expect(visible).not.toHaveBeenCalled()
    expect(payload.components.c0?.visibleCount).toBe(1)
    expect(payload.visibles['c0:v0']).toEqual({
      componentId: 'c0',
      scope: expect.any(String),
      symbol: 'visible-symbol',
    })
  })

  it('runs when a resumed SSR boundary becomes visible without activating the component', async () => {
    await withFakeVisibleDocument(async (doc, fakeWindow) => {
      const globalRecord = globalThis as Record<PropertyKey, unknown>
      globalRecord.__eclipsaVisibleRuns = 0

      const container = createResumeContainer(doc, {
        components: {
          c0: {
            props: {
              __eclipsa_type: 'object',
              entries: [],
            },
            scope: 'sc0',
            signalIds: [],
            symbol: 'page-symbol',
            visibleCount: 1,
            watchCount: 0,
          },
        },
        loaders: {},
        scopes: {
          sc0: [],
          sc1: [],
        },
        signals: {
          '$router:isNavigating': false,
          '$router:path': '/',
        },
        subscriptions: {
          '$router:isNavigating': [],
          '$router:path': [],
        },
        symbols: {
          'visible-symbol': '/virtual/on-visible-symbol.js',
        },
        visibles: {
          'c0:v0': {
            componentId: 'c0',
            scope: 'sc1',
            symbol: 'visible-symbol',
          },
        },
        watches: {},
      })
      container.imports.set(
        'visible-symbol',
        Promise.resolve({
          default: () => {
            const current = globalRecord.__eclipsaVisibleRuns
            globalRecord.__eclipsaVisibleRuns = typeof current === 'number' ? current + 1 : 1
          },
        }),
      )
      const cleanup = installResumeListeners(container)

      await flushAsync()
      expect(globalRecord.__eclipsaVisibleRuns).toBe(0)

      ;(doc as unknown as FakeDocument).visible = true
      fakeWindow.emit('resize')
      await flushAsync()

      expect(globalRecord.__eclipsaVisibleRuns).toBe(1)
      expect(container.components.get('c0')?.active).toBe(false)

      fakeWindow.emit('resize')
      await flushAsync()
      expect(globalRecord.__eclipsaVisibleRuns).toBe(1)

      cleanup()
      delete globalRecord.__eclipsaVisibleRuns
    })
  })
})
