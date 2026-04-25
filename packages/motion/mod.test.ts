import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { renderSSR } from 'eclipsa'
import { jsxDEV as jsxDEV2 } from '../eclipsa/jsx/jsx-dev-runtime.ts'
import { __eclipsaComponent } from '../eclipsa/core/internal.ts'
import {
  flushDirtyComponents,
  renderClientInsertable,
  withRuntimeContainer,
} from '../eclipsa/core/runtime.ts'
import { useSignal, useWatch } from '../eclipsa/core/signal.ts'
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useMotionValueSignal,
} from './mod.ts'
class FakeNode {
  childNodes = []
  nodeType = 0
  ownerDocument = null
  parentNode = null
  remove() {
    if (!this.parentNode) {
      return
    }
    const index = this.parentNode.childNodes.indexOf(this)
    if (index >= 0) {
      this.parentNode.childNodes.splice(index, 1)
    }
    this.parentNode = null
  }
  get nextSibling() {
    if (!this.parentNode) {
      return null
    }
    const index = this.parentNode.childNodes.indexOf(this)
    return index >= 0 ? (this.parentNode.childNodes[index + 1] ?? null) : null
  }
  get firstChild() {
    return this.childNodes[0] ?? null
  }
  get lastChild() {
    return this.childNodes.length > 0 ? this.childNodes[this.childNodes.length - 1] : null
  }
  get textContent() {
    return this.childNodes.map((child) => child.textContent ?? '').join('')
  }
}
class FakeText extends FakeNode {
  constructor(data) {
    super()
    this.data = data
    this.nodeType = 3
  }
  get textContent() {
    return this.data
  }
}
class FakeComment extends FakeNode {
  constructor(data) {
    super()
    this.data = data
    this.nodeType = 8
  }
  get textContent() {
    return this.data
  }
}
class FakeElement extends FakeNode {
  constructor(tagName) {
    super()
    this.tagName = tagName
    this.nodeType = 1
  }
  attributes = /* @__PURE__ */ new Map()
  appendChild(node) {
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }
  insertBefore(node, referenceNode) {
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    if (!referenceNode) {
      this.childNodes.push(node)
      return node
    }
    const index = this.childNodes.indexOf(referenceNode)
    if (index < 0) {
      this.childNodes.push(node)
      return node
    }
    this.childNodes.splice(index, 0, node)
    return node
  }
  replaceChild(newChild, oldChild) {
    const index = this.childNodes.indexOf(oldChild)
    if (index < 0) {
      return oldChild
    }
    newChild.ownerDocument = this.ownerDocument
    newChild.parentNode = this
    oldChild.parentNode = null
    this.childNodes[index] = newChild
    return oldChild
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
}
class FakeWindow {
  addEventListener() {}
  removeEventListener() {}
}
class FakeDocument {
  body
  defaultView = new FakeWindow()
  constructor() {
    const body = new FakeElement('body')
    body.ownerDocument = this
    this.body = body
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
  createTreeWalker(root, whatToShow) {
    const nodes = []
    const visit = (node) => {
      const matchesFilter = !whatToShow || whatToShow === 128 ? node instanceof FakeComment : true
      if (matchesFilter) {
        nodes.push(node)
      }
      for (const child of node.childNodes) {
        visit(child)
      }
    }
    visit(root)
    let index = -1
    const walker = {
      currentNode: null,
      nextNode() {
        index += 1
        const node = nodes[index] ?? null
        walker.currentNode = node
        return node
      },
    }
    return walker
  }
}
class FakeIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback
    this.options = options
    FakeIntersectionObserver.instances.push(this)
  }
  static instances = []
  observed = /* @__PURE__ */ new Set()
  disconnect() {
    this.observed.clear()
  }
  observe(element) {
    this.observed.add(element)
  }
  unobserve(element) {
    this.observed.delete(element)
  }
  trigger(isIntersecting) {
    const target = [...this.observed][0]
    if (!target) {
      return
    }
    this.callback(
      [
        {
          boundingClientRect: {},
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: {},
          isIntersecting,
          rootBounds: null,
          target,
          time: 0,
        },
      ],
      this,
    )
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
  id: 'motion-test',
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
const queryFakeElements = (root, predicate) => {
  const matches = []
  const visit = (node) => {
    if (node instanceof FakeElement && predicate(node)) {
      matches.push(node)
    }
    for (const child of node.childNodes) {
      visit(child)
    }
  }
  visit(root)
  return matches
}
const withFakeNodeGlobal = async (fn) => {
  const OriginalComment = globalThis.Comment
  const OriginalElement = globalThis.Element
  const OriginalHTMLElement = globalThis.HTMLElement
  const OriginalIntersectionObserver = globalThis.IntersectionObserver
  const OriginalNode = globalThis.Node
  const OriginalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const OriginalRequestAnimationFrame = globalThis.requestAnimationFrame
  const OriginalText = globalThis.Text
  FakeIntersectionObserver.instances = []
  globalThis.Comment = FakeComment
  globalThis.Element = FakeElement
  globalThis.HTMLElement = FakeElement
  globalThis.IntersectionObserver = FakeIntersectionObserver
  globalThis.Node = FakeNode
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(0), 0)
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle)
  globalThis.Text = FakeText
  try {
    await fn()
  } finally {
    globalThis.Comment = OriginalComment
    globalThis.Element = OriginalElement
    globalThis.HTMLElement = OriginalHTMLElement
    globalThis.IntersectionObserver = OriginalIntersectionObserver
    globalThis.Node = OriginalNode
    globalThis.cancelAnimationFrame = OriginalCancelAnimationFrame
    globalThis.requestAnimationFrame = OriginalRequestAnimationFrame
    globalThis.Text = OriginalText
  }
}
describe('@eclipsa/motion', () => {
  it('strips motion-only props from rendered DOM output', () => {
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        motion.div,
        {
          animate: { opacity: 1 },
          initial: { opacity: 0 },
          transition: { duration: 0.2 },
          whileHover: { opacity: 0.8 },
        },
        void 0,
        false,
        {
          fileName: 'packages/motion/mod.test.ts',
          lineNumber: 342,
          columnNumber: 7,
        },
      ),
    )
    expect(html).toContain('<div')
    expect(html).not.toContain('animate=')
    expect(html).not.toContain('initial=')
    expect(html).not.toContain('transition=')
    expect(html).not.toContain('whileHover=')
  })
  it('renders the initial pose inline during SSR', () => {
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        motion.div,
        { initial: { opacity: 0, x: 20 }, animate: { opacity: 1 } },
        void 0,
        false,
        {
          fileName: 'packages/motion/mod.test.ts',
          lineNumber: 359,
          columnNumber: 7,
        },
      ),
    )
    expect(html).toContain('opacity: 0; transform: translate3d(20px, 0px, 0px)')
  })
  it('renders the animate pose inline during SSR when initial is false', () => {
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        motion.div,
        { initial: false, animate: { opacity: 1, x: 0 } },
        void 0,
        false,
        {
          fileName: 'packages/motion/mod.test.ts',
          lineNumber: 366,
          columnNumber: 38,
        },
      ),
    )
    expect(html).toContain('opacity: 1; transform: translate3d(0px, 0px, 0px)')
  })
  it('serializes nested accessor animate targets during SSR', () => {
    const { html } = renderSSR(() =>
      jsxDEV2(
        motion.div,
        {
          get animate() {
            const target = {}
            Object.defineProperty(target, 'x', {
              enumerable: true,
              get() {
                return 24
              },
            })
            return target
          },
        },
        null,
        false,
        {},
      ),
    )
    expect(html).toContain('transform: translate3d(24px, 0px, 0px)')
  })
  it('serializes camelCase motion styles to valid CSS property names', () => {
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        motion.div,
        { initial: false, animate: { maxHeight: 160, opacity: 1 } },
        void 0,
        false,
        {
          fileName: 'packages/motion/mod.test.ts',
          lineNumber: 398,
          columnNumber: 7,
        },
      ),
    )
    expect(html).toContain('max-height: 160px')
    expect(html).toContain('transition-property: max-height, opacity')
    expect(html.indexOf('transition-property')).toBeLessThan(html.indexOf('max-height: 160px'))
    expect(html).not.toContain('maxHeight:')
  })
  it('inherits transition config from MotionConfig', () => {
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        MotionConfig,
        {
          transition: { duration: 0.6 },
          children: /* @__PURE__ */ jsxDEV(motion.div, { animate: { opacity: 1 } }, void 0, false, {
            fileName: 'packages/motion/mod.test.ts',
            lineNumber: 409,
            columnNumber: 9,
          }),
        },
        void 0,
        false,
        {
          fileName: 'packages/motion/mod.test.ts',
          lineNumber: 408,
          columnNumber: 7,
        },
      ),
    )
    expect(html).toContain('<div')
  })
  it('keeps removed keyed children rendered through AnimatePresence until exit support is detected', () => {
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        AnimatePresence,
        {
          children: /* @__PURE__ */ jsxDEV(motion.div, { exit: { opacity: 0 } }, 'a', false, {
            fileName: 'packages/motion/mod.test.ts',
            lineNumber: 419,
            columnNumber: 9,
          }),
        },
        void 0,
        false,
        {
          fileName: 'packages/motion/mod.test.ts',
          lineNumber: 418,
          columnNumber: 7,
        },
      ),
    )
    expect(html).toContain('<div')
  })
  it('tracks ref signals that resolve after the initial render in useInView', async () => {
    await withFakeNodeGlobal(async () => {
      let ref
      const values = []
      const App = __eclipsaComponent(
        () => {
          ref = useSignal()
          const inView = useInView(ref)
          useWatch(() => {
            values.push(inView.value)
          }, [inView])
          return jsxDEV2('div', { ref }, null, false, {})
        },
        'motion-use-in-view-ref-signal',
        () => [],
      )
      const container = createContainer()
      container.symbols.set('motion-value-signal-bridge', '/tests/motion-value-signal-bridge.tsx')
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV2(App, {}, null, false, {}), container),
      )
      await flushAsync()
      expect(ref.value).toBeTruthy()
      expect(FakeIntersectionObserver.instances).toHaveLength(1)
      expect(values).toEqual([false])
      FakeIntersectionObserver.instances[0]?.trigger(true)
      await flushAsync()
      expect(values).toEqual([false, true])
    })
  })
  it('mirrors direct motion value changes through useMotionValueEvent', async () => {
    await withFakeNodeGlobal(async () => {
      let setValue
      const observed = []
      const App = __eclipsaComponent(
        () => {
          const source = useMotionValue(0)
          useMotionValueEvent(source, 'change', (value) => {
            observed.push(value)
          })
          setValue = (value) => {
            source.set(value)
          }
          return jsxDEV2('span', { children: 'ready' }, null, false, {})
        },
        'motion-use-motion-value-event-direct',
        () => [],
      )
      const container = createContainer()
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV2(App, {}, null, false, {}), container),
      )
      await flushAsync()
      setValue(4)
      await flushAsync()
      expect(observed).toEqual([4])
    })
  })
  it('primes lazy motion values before subscribing in useMotionValueEvent', async () => {
    await withFakeNodeGlobal(async () => {
      const observed = []
      let emit
      const App = __eclipsaComponent(
        () => {
          let started = false
          let listener
          const lazyValue = {
            get() {
              started = true
              return 0
            },
            on(_eventName, next) {
              if (started) {
                listener = next
              }
              return () => {
                if (listener === next) {
                  listener = void 0
                }
              }
            },
          }
          emit = (value) => {
            listener?.(value)
          }
          useMotionValueEvent(lazyValue, 'change', (value) => {
            observed.push(value)
          })
          return jsxDEV2('span', { children: 'ready' }, null, false, {})
        },
        'motion-use-motion-value-event-lazy',
        () => [],
      )
      const container = createContainer()
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV2(App, {}, null, false, {}), container),
      )
      await flushAsync()
      emit(8)
      await flushAsync()
      expect(observed).toEqual([8])
    })
  })
  it('mirrors motion values into signals for ordinary reactive DOM updates', async () => {
    await withFakeNodeGlobal(async () => {
      let ref
      let setRotate
      let setAngle
      const AppBody = () => {
        ref = useSignal()
        const rotate = useMotionValue(0)
        const angle = useMotionValue('0deg')
        const rotateSignal = useMotionValueSignal(rotate)
        const angleSignal = useMotionValueSignal(angle)
        setRotate = (value) => {
          rotate.set(value)
        }
        setAngle = (value) => {
          angle.set(value)
        }
        return jsxDEV2(
          'div',
          {
            ref,
            style: `--angle: ${angleSignal.value}; transform: rotate(${rotateSignal.value}deg)`,
          },
          null,
          false,
          {},
        )
      }
      const App = __eclipsaComponent(AppBody, 'motion-value-signal-bridge', () => [])
      const container = createContainer()
      container.imports.set(
        'motion-value-signal-bridge',
        Promise.resolve({
          default: () => AppBody(),
        }),
      )
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV2(App, {}, null, false, {}), container),
      )
      await flushAsync()
      expect(ref.value?.getAttribute('style')).toContain('--angle: 0deg')
      expect(ref.value?.getAttribute('style')).toContain('transform: rotate(0deg)')
      setRotate(90)
      setAngle('90deg')
      await flushDirtyComponents(container)
      expect(ref.value?.getAttribute('style')).toContain('--angle: 90deg')
      expect(ref.value?.getAttribute('style')).toContain('transform: rotate(90deg)')
    })
  })
  it('updates animate props on the client after a dirty flush', async () => {
    await withFakeNodeGlobal(async () => {
      let ref
      let visible
      const AppBody = () => {
        ref = useSignal()
        visible = useSignal(false)
        return jsxDEV2(
          motion.div,
          {
            ref,
            get animate() {
              return { x: visible.value ? 0 : '150%' }
            },
          },
          null,
          false,
          {},
        )
      }
      const App = __eclipsaComponent(AppBody, 'motion-animate-prop-watch', () => [])
      const container = createContainer()
      container.imports.set(
        'motion-animate-prop-watch',
        Promise.resolve({
          default: () => AppBody(),
        }),
      )
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV2(App, {}, null, false, {}), container),
      )
      await flushAsync()
      expect(ref.value?.getAttribute('style')).toContain('transform: translate3d(150%, 0px, 0px)')
      visible.value = true
      await flushDirtyComponents(container)
      expect(ref.value?.getAttribute('style')).toContain('transform: translate3d(0px, 0px, 0px)')
    })
  })
  it('does not duplicate a resumed motion child when the parent boundary reactivates', async () => {
    await withFakeNodeGlobal(async () => {
      const ParentBody = () =>
        jsxDEV2(
          motion.div,
          {
            animate: { opacity: 1 },
            children: jsxDEV2(
              'div',
              {
                class: 'mx-auto',
                children: jsxDEV2(
                  motion.div,
                  {
                    animate: { opacity: 1 },
                    children: [
                      jsxDEV2('pre', { children: '<div>{count.value}</div>' }, null, false, {}),
                      jsxDEV2(
                        'div',
                        { class: 'text-gray-400', children: 'YOUR CODE' },
                        null,
                        false,
                        {},
                      ),
                    ],
                  },
                  null,
                  false,
                  {},
                ),
              },
              null,
              false,
              {},
            ),
          },
          null,
          false,
          {},
        )
      const Parent = __eclipsaComponent(ParentBody, 'motion-resume-parent', () => [])
      const container = createContainer()
      container.imports.set(
        'motion-resume-parent',
        Promise.resolve({
          default: () => ParentBody(),
        }),
      )
      const host = new FakeElement('div')
      host.ownerDocument = container.doc
      withRuntimeContainer(container, () => {
        const nodes = renderClientInsertable(jsxDEV2(Parent, {}, null, false, {}), container)
        for (const node of nodes) {
          host.appendChild(node)
        }
      })
      await flushAsync()
      expect(
        queryFakeElements(host, (element) => element.textContent === 'YOUR CODE'),
      ).toHaveLength(1)
      for (const component of container.components.values()) {
        component.active = false
        component.reuseExistingDomOnActivate = true
        component.reuseProjectionSlotDomOnActivate = false
      }
      const parentBoundary = [...container.components.values()].find(
        (component) => component.symbol === 'motion-resume-parent',
      )
      expect(parentBoundary).toBeTruthy()
      container.dirty.add(parentBoundary.id)
      await flushDirtyComponents(container)
      expect(
        queryFakeElements(host, (element) => element.textContent === 'YOUR CODE'),
      ).toHaveLength(1)
    })
  })
})
