import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it, vi } from 'vitest'
import { jsxDEV as jsxDEV2 } from '../jsx/jsx-dev-runtime.ts'
import { __eclipsaComponent, __eclipsaLazy } from './internal.ts'
import {
  applyResumeHmrUpdate,
  createResumeContainer,
  installResumeListeners,
  renderClientInsertable,
  withRuntimeContainer,
} from './runtime.ts'
import { onCleanup, onVisible, useSignal } from './signal.ts'
import { renderSSR } from './ssr.ts'
class FakeNode {
  childNodes = []
  nextSibling = null
  parentNode = null
  previousSibling = null
  remove() {
    this.parentNode?.removeChild(this)
  }
}
class FakeComment extends FakeNode {
  constructor(data, ownerDocument) {
    super()
    this.data = data
    this.ownerDocument = ownerDocument
  }
}
class FakeElement extends FakeNode {
  constructor(tagName, ownerDocument) {
    super()
    this.tagName = tagName
    this.ownerDocument = ownerDocument
  }
  attributes = /* @__PURE__ */ new Map()
  childNodes = []
  appendChild(node) {
    return this.insertBefore(node, null)
  }
  insertBefore(node, referenceNode) {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
    const nextSibling = referenceNode
    const previousSibling = nextSibling
      ? nextSibling.previousSibling
      : (this.childNodes.at(-1) ?? null)
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
  querySelectorAll(selector) {
    return this.querySelectorAllBySelector(selector ?? '')
  }
  removeChild(node) {
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
  setAttribute(name, value) {
    this.attributes.set(name, value)
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }
  hasAttribute(name) {
    return this.attributes.has(name)
  }
  querySelectorAllBySelector(selector) {
    const attrMatch = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)
    if (!attrMatch) {
      return []
    }
    const [, attrName, attrValue] = attrMatch
    const results = []
    const visit = (node) => {
      if (node instanceof FakeElement) {
        const currentValue = node.getAttribute(attrName)
        if (currentValue !== null && (attrValue === void 0 || currentValue === attrValue)) {
          results.push(node)
        }
      }
      for (const child of node.childNodes) {
        visit(child)
      }
    }
    visit(this)
    return results
  }
}
class FakeWindow {
  innerHeight = 100
  innerWidth = 100
  #listeners = /* @__PURE__ */ new Map()
  addEventListener(eventName, listener) {
    const listeners = this.#listeners.get(eventName) ?? /* @__PURE__ */ new Set()
    listeners.add(listener)
    this.#listeners.set(eventName, listeners)
  }
  emit(eventName) {
    for (const listener of this.#listeners.get(eventName) ?? []) {
      listener()
    }
  }
  removeEventListener(eventName, listener) {
    this.#listeners.get(eventName)?.delete(listener)
  }
}
class FakeRange {
  constructor(doc) {
    this.doc = doc
  }
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
      ? {
          0: rect,
          length: 1,
        }
      : {
          length: 0,
        }
  }
  setEndBefore(_node) {}
  setStartAfter(_node) {}
}
class FakeTreeWalker {
  constructor(comments) {
    this.comments = comments
  }
  currentNode = null
  #index = -1
  nextNode() {
    this.#index += 1
    this.currentNode = this.comments[this.#index] ?? null
    return this.currentNode
  }
}
class FakeDocument {
  body = new FakeElement('body', this)
  defaultView = new FakeWindow()
  location = { pathname: '/' }
  visible = false
  #listeners = /* @__PURE__ */ new Map()
  #comments
  constructor() {
    const start = new FakeComment('ec:c:c0:start', this)
    const element = new FakeElement('div', this)
    const end = new FakeComment('ec:c:c0:end', this)
    this.body.appendChild(start)
    this.body.appendChild(element)
    this.body.appendChild(end)
    this.#comments = [start, end]
  }
  addEventListener(eventName, listener) {
    const listeners = this.#listeners.get(eventName) ?? /* @__PURE__ */ new Set()
    listeners.add(listener)
    this.#listeners.set(eventName, listeners)
  }
  createComment(data) {
    return new FakeComment(data, this)
  }
  createElement(tagName) {
    return new FakeElement(tagName, this)
  }
  createRange() {
    return new FakeRange(this)
  }
  createTextNode(data) {
    return new FakeComment(data, this)
  }
  createTreeWalker() {
    return new FakeTreeWalker(this.#comments)
  }
  querySelectorAll() {
    return []
  }
  emit(eventName) {
    for (const listener of this.#listeners.get(eventName) ?? []) {
      listener()
    }
  }
  removeEventListener(eventName, listener) {
    this.#listeners.get(eventName)?.delete(listener)
  }
}
const withFakeVisibleDocument = async (fn) => {
  const OriginalComment = globalThis.Comment
  const OriginalDocument = globalThis.Document
  const OriginalHTMLElement = globalThis.HTMLElement
  const OriginalNode = globalThis.Node
  const OriginalNodeFilter = globalThis.NodeFilter
  globalThis.Comment = FakeComment
  globalThis.Document = FakeDocument
  globalThis.HTMLElement = FakeElement
  globalThis.Node = FakeNode
  globalThis.NodeFilter = { SHOW_COMMENT: 128 }
  try {
    const doc = new FakeDocument()
    await fn(doc, doc.defaultView)
  } finally {
    globalThis.Comment = OriginalComment
    globalThis.Document = OriginalDocument
    globalThis.HTMLElement = OriginalHTMLElement
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
    const App = __eclipsaComponent(
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
        return /* @__PURE__ */ jsxDEV('button', { children: 'ready' }, void 0, false, {
          fileName: 'packages/eclipsa/core/on-visible.test.ts',
          lineNumber: 313,
          columnNumber: 16,
        })
      },
      'component-symbol',
      () => [],
    )
    const { html, payload } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/on-visible.test.ts',
        lineNumber: 319,
        columnNumber: 47,
      }),
    )
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
      const globalRecord = globalThis
      globalRecord.__eclipsaVisibleRuns = 0
      const container = createResumeContainer(doc, {
        actions: {},
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
      doc.visible = true
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
  it('runs cleanup only when the visible registration is torn down', async () => {
    await withFakeVisibleDocument(async (doc, fakeWindow) => {
      const events = []
      const container = createResumeContainer(doc, {
        actions: {},
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
          'visible-cleanup-symbol': '/virtual/on-visible-cleanup-symbol.js',
        },
        visibles: {
          'c0:v0': {
            componentId: 'c0',
            scope: 'sc1',
            symbol: 'visible-cleanup-symbol',
          },
        },
        watches: {},
      })
      container.imports.set(
        'visible-cleanup-symbol',
        Promise.resolve({
          default: () => {
            events.push('run')
            onCleanup(() => {
              events.push('cleanup')
            })
          },
        }),
      )
      const cleanup = installResumeListeners(container)
      doc.visible = true
      fakeWindow.emit('resize')
      await flushAsync()
      expect(events).toEqual(['run'])
      doc.visible = false
      fakeWindow.emit('resize')
      await flushAsync()
      expect(events).toEqual(['run'])
      const Replacement = __eclipsaComponent(
        () =>
          /* @__PURE__ */ jsxDEV('span', { children: 'done' }, void 0, false, {
            fileName: 'packages/eclipsa/core/on-visible.test.ts',
            lineNumber: 474,
            columnNumber: 15,
          }),
        'replacement-symbol',
        () => [],
      )
      container.rootChildCursor = 0
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV2(Replacement, {}, null, false, {}), container)
      })
      expect(events).toEqual(['run', 'cleanup'])
      cleanup()
    })
  })
  it('restores signal refs before resumed visible callbacks run', async () => {
    const globalRecord = globalThis
    const App = __eclipsaComponent(
      () => {
        const ref = useSignal()
        onVisible(
          __eclipsaLazy(
            'visible-ref-symbol',
            () => {
              globalRecord.__eclipsaVisibleRefTag = ref.value?.tagName ?? null
            },
            () => [ref],
          ),
        )
        return /* @__PURE__ */ jsxDEV('div', { ref, children: 'ready' }, void 0, false, {
          fileName: 'packages/eclipsa/core/on-visible.test.ts',
          lineNumber: 507,
          columnNumber: 16,
        })
      },
      'component-ref',
      () => [],
    )
    const { html, payload } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/on-visible.test.ts',
        lineNumber: 513,
        columnNumber: 47,
      }),
    )
    const signalId = payload.components.c0?.signalIds[0]
    expect(signalId).toBeTruthy()
    expect(html).toContain(`data-e-ref="${signalId}"`)
    expect(html).not.toContain(' ref=')
    await withFakeVisibleDocument(async (doc, fakeWindow) => {
      globalRecord.__eclipsaVisibleRefTag = null
      const body = doc.body
      const element = body.childNodes[1]
      element.setAttribute('data-e-ref', signalId)
      const container = createResumeContainer(doc, {
        ...payload,
        symbols: {
          ...payload.symbols,
          'visible-ref-symbol': '/virtual/visible-ref-symbol.js',
        },
      })
      container.imports.set(
        'visible-ref-symbol',
        Promise.resolve({
          default: (scope) => {
            const [ref] = scope
            globalRecord.__eclipsaVisibleRefTag = ref.value?.tagName ?? null
          },
        }),
      )
      const cleanup = installResumeListeners(container)
      await flushAsync()
      expect(globalRecord.__eclipsaVisibleRefTag).toBe(null)
      doc.visible = true
      fakeWindow.emit('resize')
      await flushAsync()
      expect(globalRecord.__eclipsaVisibleRefTag).toBe('div')
      expect(container.components.get('c0')?.active).toBe(false)
      cleanup()
      delete globalRecord.__eclipsaVisibleRefTag
    })
  })
  it('reruns resumed visible callbacks after an HMR boundary rerender', async () => {
    await withFakeVisibleDocument(async (doc, fakeWindow) => {
      const events = []
      const container = createResumeContainer(doc, {
        actions: {},
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
          'page-symbol': '/virtual/page-symbol.js',
          'visible-symbol': '/virtual/visible-symbol.js',
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
            events.push('run')
            onCleanup(() => {
              events.push('cleanup')
            })
          },
        }),
      )
      container.imports.set(
        'page-symbol',
        Promise.resolve({
          default: () => {
            onVisible(
              __eclipsaLazy(
                'visible-symbol',
                () => {},
                () => [],
              ),
            )
            return jsxDEV2('div', { children: 'ready' }, null, false, {})
          },
        }),
      )
      const cleanup = installResumeListeners(container)
      doc.visible = true
      fakeWindow.emit('resize')
      await flushAsync()
      expect(events).toEqual(['run'])
      await applyResumeHmrUpdate(container, {
        fileUrl: '/app/+page.tsx',
        fullReload: false,
        rerenderComponentSymbols: ['page-symbol'],
        rerenderOwnerSymbols: [],
        symbolUrlReplacements: {},
      })
      await flushAsync()
      expect(events).toEqual(['run', 'cleanup', 'run'])
      cleanup()
    })
  })
})
