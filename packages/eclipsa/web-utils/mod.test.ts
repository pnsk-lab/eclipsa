import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { __eclipsaComponent } from '../core/internal.ts'
import { renderClientInsertable, withRuntimeContainer } from '../core/runtime.ts'
import { useSignal, useWatch } from '../core/signal.ts'
import { renderSSR } from '../core/ssr.ts'
import { useBoudingClientRect, useBoundingClientRect, useScroll, useWindowSize } from './mod.ts'
class FakeNode {
  static COMMENT_NODE = 8
  static ELEMENT_NODE = 1
  static TEXT_NODE = 3
  childNodes = []
  nodeType = 0
  ownerDocument = null
  parentNode = null
}
class FakeText extends FakeNode {
  constructor(data) {
    super()
    this.data = data
    this.nodeType = 3
  }
}
class FakeComment extends FakeNode {
  constructor(data) {
    super()
    this.data = data
    this.nodeType = 8
  }
}
class FakeElement extends FakeNode {
  constructor(tagName) {
    super()
    this.tagName = tagName
    this.nodeType = 1
  }
  attributes = /* @__PURE__ */ new Map()
  scrollLeft = 0
  scrollTop = 0
  #boundingClientRect = {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
  }
  #eventListeners = /* @__PURE__ */ new Map()
  appendChild(node) {
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }
  setAttribute(name, value) {
    this.attributes.set(name, value)
  }
  removeAttribute(name) {
    this.attributes.delete(name)
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }
  hasAttribute(name) {
    return this.attributes.has(name)
  }
  getBoundingClientRect() {
    return { ...this.#boundingClientRect }
  }
  setBoundingClientRect(next) {
    this.#boundingClientRect = {
      ...this.#boundingClientRect,
      ...next,
    }
  }
  addEventListener(type, listener) {
    let listeners = this.#eventListeners.get(type)
    if (!listeners) {
      listeners = /* @__PURE__ */ new Set()
      this.#eventListeners.set(type, listeners)
    }
    listeners.add(listener)
  }
  removeEventListener(type, listener) {
    this.#eventListeners.get(type)?.delete(listener)
  }
  dispatchEvent(event) {
    for (const listener of this.#eventListeners.get(event.type) ?? []) {
      if (typeof listener === 'function') {
        listener.call(this, event)
        continue
      }
      listener.handleEvent(event)
    }
    return !event.defaultPrevented
  }
}
class FakeWindow {
  pageXOffset = 0
  pageYOffset = 0
  scrollX = 0
  scrollY = 0
  innerHeight = 0
  innerWidth = 0
  #eventListeners = /* @__PURE__ */ new Map()
  addEventListener(type, listener) {
    let listeners = this.#eventListeners.get(type)
    if (!listeners) {
      listeners = /* @__PURE__ */ new Set()
      this.#eventListeners.set(type, listeners)
    }
    listeners.add(listener)
  }
  removeEventListener(type, listener) {
    this.#eventListeners.get(type)?.delete(listener)
  }
  dispatchEvent(event) {
    for (const listener of this.#eventListeners.get(event.type) ?? []) {
      if (typeof listener === 'function') {
        listener.call(this, event)
        continue
      }
      listener.handleEvent(event)
    }
    return !event.defaultPrevented
  }
}
class FakeDocument {
  body
  defaultView = new FakeWindow()
  #eventListeners = /* @__PURE__ */ new Map()
  constructor() {
    const body = new FakeElement('body')
    body.ownerDocument = this
    this.body = body
  }
  get scrollingElement() {
    return this.body
  }
  createComment(data) {
    const comment = new FakeComment(data)
    comment.ownerDocument = this
    return comment
  }
  createElement(tagName) {
    const element = new FakeElement(tagName)
    element.ownerDocument = this
    return element
  }
  createTextNode(data) {
    const text = new FakeText(data)
    text.ownerDocument = this
    return text
  }
  addEventListener(type, listener) {
    let listeners = this.#eventListeners.get(type)
    if (!listeners) {
      listeners = /* @__PURE__ */ new Set()
      this.#eventListeners.set(type, listeners)
    }
    listeners.add(listener)
  }
  removeEventListener(type, listener) {
    this.#eventListeners.get(type)?.delete(listener)
  }
  dispatchEvent(event) {
    for (const listener of this.#eventListeners.get(event.type) ?? []) {
      if (typeof listener === 'function') {
        listener.call(this, event)
        continue
      }
      listener.handleEvent(event)
    }
    return !event.defaultPrevented
  }
}
const createContainer = () => ({
  actions: /* @__PURE__ */ new Map(),
  actionStates: /* @__PURE__ */ new Map(),
  asyncSignalSnapshotCache: /* @__PURE__ */ new Map(),
  asyncSignalStates: /* @__PURE__ */ new Map(),
  atoms: /* @__PURE__ */ new WeakMap(),
  components: /* @__PURE__ */ new Map(),
  dirty: /* @__PURE__ */ new Set(),
  dirtyFlushQueued: false,
  doc: new FakeDocument(),
  eventDispatchPromise: null,
  imports: /* @__PURE__ */ new Map(),
  interactivePrefetchCheckQueued: false,
  loaderStates: /* @__PURE__ */ new Map(),
  loaders: /* @__PURE__ */ new Map(),
  id: 'web-utils-test',
  nextAtomId: 0,
  nextComponentId: 0,
  nextElementId: 0,
  nextScopeId: 0,
  nextSignalId: 0,
  pendingSuspensePromises: /* @__PURE__ */ new Set(),
  resumeReadyPromise: null,
  rootChildCursor: 0,
  rootElement: void 0,
  router: null,
  scopes: /* @__PURE__ */ new Map(),
  signals: /* @__PURE__ */ new Map(),
  symbols: /* @__PURE__ */ new Map(),
  visibilityCheckQueued: false,
  visibilityListenersCleanup: null,
  visibles: /* @__PURE__ */ new Map(),
  watches: /* @__PURE__ */ new Map(),
})
const flushAsync = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
const withFakeNodeGlobal = (fn) => {
  const OriginalComment = globalThis.Comment
  const OriginalElement = globalThis.Element
  const OriginalHTMLElement = globalThis.HTMLElement
  const OriginalNode = globalThis.Node
  const OriginalText = globalThis.Text
  globalThis.Comment = FakeComment
  globalThis.Element = FakeElement
  globalThis.HTMLElement = FakeElement
  globalThis.Node = FakeNode
  globalThis.Text = FakeText
  try {
    return fn()
  } finally {
    globalThis.Comment = OriginalComment
    globalThis.Element = OriginalElement
    globalThis.HTMLElement = OriginalHTMLElement
    globalThis.Node = OriginalNode
    globalThis.Text = OriginalText
  }
}
describe('eclipsa/web-utils useScroll', () => {
  it('tracks a ref signal element scroll position', async () => {
    await withFakeNodeGlobal(async () => {
      let ref
      let target
      const values = []
      const App = __eclipsaComponent(
        () => {
          ref = useSignal()
          const scroll = useScroll(ref)
          useWatch(() => {
            values.push([scroll.value.x, scroll.value.y])
          })
          return jsxDEV('div', { ref }, null, false, {})
        },
        'component-web-utils-scroll-ref',
        () => [],
      )
      const container = createContainer()
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      await flushAsync()
      target = ref.value
      target.scrollLeft = 12
      target.scrollTop = 34
      target.dispatchEvent(new Event('scroll'))
      expect(values).toEqual([
        [0, 0],
        [12, 34],
      ])
    })
  })
  it('tracks the document scroll position when no ref signal is provided', async () => {
    await withFakeNodeGlobal(async () => {
      const values = []
      const App = __eclipsaComponent(
        () => {
          const scroll = useScroll()
          useWatch(() => {
            values.push([scroll.value.x, scroll.value.y])
          })
          return jsxDEV('div', {}, null, false, {})
        },
        'component-web-utils-scroll-document',
        () => [],
      )
      const container = createContainer()
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container)
      })
      await flushAsync()
      const doc = container.doc
      const view = doc.defaultView
      view.scrollX = 40
      view.scrollY = 80
      doc.dispatchEvent(new Event('scroll'))
      expect(values).toEqual([
        [0, 0],
        [40, 80],
      ])
    })
  })
  it('returns zeroed scroll signals during SSR', () => {
    const App = __eclipsaComponent(
      () => {
        const ref = useSignal()
        const scroll = useScroll(ref)
        return jsxDEV(
          'div',
          {
            ref,
            children: `${scroll.value.x}:${scroll.value.y}`,
          },
          null,
          false,
          {},
        )
      },
      'component-web-utils-scroll-ssr',
      () => [],
    )
    const { html } = renderSSR(() => jsxDEV(App, {}, null, false, {}))
    expect(html).toContain('0:0')
  })
})
describe('eclipsa/web-utils useBoundingClientRect', () => {
  it('tracks a ref signal element client rect and updates on document scroll', async () => {
    await withFakeNodeGlobal(async () => {
      let ref
      const values = []
      const App = __eclipsaComponent(
        () => {
          ref = useSignal()
          const rect = useBoundingClientRect(ref)
          useWatch(() => {
            values.push([rect.value.left, rect.value.top, rect.value.width, rect.value.height])
          })
          return jsxDEV('div', { ref }, null, false, {})
        },
        'component-web-utils-bounding-client-rect-ref',
        () => [],
      )
      const container = createContainer()
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      await flushAsync()
      const target = ref.value
      target.setBoundingClientRect({
        bottom: 170,
        height: 150,
        left: 10,
        right: 210,
        top: 20,
        width: 200,
        x: 10,
        y: 20,
      })
      container.doc.dispatchEvent(new Event('scroll'))
      expect(values).toEqual([
        [0, 0, 0, 0],
        [10, 20, 200, 150],
      ])
    })
  })
  it('tracks a ref signal element client rect when the runtime window scrolls', async () => {
    await withFakeNodeGlobal(async () => {
      let ref
      const values = []
      const App = __eclipsaComponent(
        () => {
          ref = useSignal()
          const rect = useBoundingClientRect(ref)
          useWatch(() => {
            values.push([rect.value.top, rect.value.bottom])
          })
          return jsxDEV('div', { ref }, null, false, {})
        },
        'component-web-utils-bounding-client-rect-window-scroll',
        () => [],
      )
      const container = createContainer()
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      await flushAsync()
      const target = ref.value
      target.setBoundingClientRect({
        bottom: 640,
        height: 180,
        top: 460,
      })
      container.doc.defaultView.dispatchEvent(new Event('scroll'))
      await flushAsync()
      expect(values).toEqual([
        [0, 0],
        [460, 640],
      ])
    })
  })
  it('exports the requested misspelled alias for compatibility', async () => {
    await withFakeNodeGlobal(async () => {
      let ref
      const values = []
      const App = __eclipsaComponent(
        () => {
          ref = useSignal()
          const rect = useBoudingClientRect(ref)
          useWatch(() => {
            values.push([rect.value.x, rect.value.y])
          })
          return jsxDEV('div', { ref }, null, false, {})
        },
        'component-web-utils-bouding-client-rect-alias',
        () => [],
      )
      const container = createContainer()
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      await flushAsync()
      const target = ref.value
      target.setBoundingClientRect({
        left: 24,
        top: 48,
        x: 24,
        y: 48,
      })
      container.doc.dispatchEvent(new Event('scroll'))
      await flushAsync()
      expect(values.at(-1)).toEqual([24, 48])
    })
  })
  it('returns a zeroed client rect during SSR', () => {
    const App = __eclipsaComponent(
      () => {
        const ref = useSignal()
        const rect = useBoundingClientRect(ref)
        return jsxDEV(
          'div',
          {
            ref,
            children: `${rect.value.left}:${rect.value.top}:${rect.value.width}:${rect.value.height}`,
          },
          null,
          false,
          {},
        )
      },
      'component-web-utils-bounding-client-rect-ssr',
      () => [],
    )
    const { html } = renderSSR(() => jsxDEV(App, {}, null, false, {}))
    expect(html).toContain('0:0:0:0')
  })
})
describe('eclipsa/web-utils useWindowSize', () => {
  it('tracks the runtime window size', async () => {
    await withFakeNodeGlobal(async () => {
      const values = []
      const App = __eclipsaComponent(
        () => {
          const windowSize = useWindowSize()
          useWatch(() => {
            values.push([windowSize.value.width, windowSize.value.height])
          })
          return jsxDEV('div', {}, null, false, {})
        },
        'component-web-utils-window-size',
        () => [],
      )
      const container = createContainer()
      const view = container.doc.defaultView
      view.innerWidth = 640
      view.innerHeight = 480
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container)
      })
      await flushAsync()
      view.innerWidth = 1024
      view.innerHeight = 768
      view.dispatchEvent(new Event('resize'))
      expect(values).toEqual([
        [0, 0],
        [640, 480],
        [1024, 768],
      ])
    })
  })
  it('returns zeroed window size during SSR', () => {
    const App = __eclipsaComponent(
      () => {
        const windowSize = useWindowSize()
        return jsxDEV(
          'div',
          {
            children: `${windowSize.value.width}:${windowSize.value.height}`,
          },
          null,
          false,
          {},
        )
      },
      'component-web-utils-window-size-ssr',
      () => [],
    )
    const { html } = renderSSR(() => jsxDEV(App, {}, null, false, {}))
    expect(html).toContain('0:0')
  })
})
