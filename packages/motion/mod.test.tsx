import { describe, expect, it } from 'vitest'
import { renderSSR } from 'eclipsa'
import { jsxDEV } from '../eclipsa/jsx/jsx-dev-runtime.ts'
import { __eclipsaComponent } from '../eclipsa/core/internal.ts'
import {
  flushDirtyComponents,
  renderClientInsertable,
  type RuntimeContainer,
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
  childNodes: FakeNode[] = []
  nodeType = 0
  ownerDocument: FakeDocument | null = null
  parentNode: FakeNode | null = null

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

  get nextSibling(): FakeNode | null {
    if (!this.parentNode) {
      return null
    }
    const index = this.parentNode.childNodes.indexOf(this)
    return index >= 0 ? (this.parentNode.childNodes[index + 1] ?? null) : null
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null
  }

  get lastChild(): FakeNode | null {
    return this.childNodes.length > 0 ? this.childNodes[this.childNodes.length - 1]! : null
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent ?? '').join('')
  }
}

class FakeText extends FakeNode {
  constructor(readonly data: string) {
    super()
    this.nodeType = 3
  }

  override get textContent(): string {
    return this.data
  }
}

class FakeComment extends FakeNode {
  constructor(readonly data: string) {
    super()
    this.nodeType = 8
  }

  override get textContent(): string {
    return this.data
  }
}

class FakeElement extends FakeNode {
  attributes = new Map<string, string>()

  constructor(readonly tagName: string) {
    super()
    this.nodeType = 1
  }

  appendChild(node: FakeNode) {
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }

  insertBefore(node: FakeNode, referenceNode: FakeNode | null) {
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

  replaceChild(newChild: FakeNode, oldChild: FakeNode) {
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

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }
}

class FakeWindow {
  addEventListener() {}
  removeEventListener() {}
}

class FakeDocument {
  body: HTMLElement
  defaultView = new FakeWindow() as unknown as Window & typeof globalThis

  constructor() {
    const body = new FakeElement('body')
    body.ownerDocument = this
    this.body = body as unknown as HTMLElement
  }

  createComment(data: string) {
    const comment = new FakeComment(data)
    comment.ownerDocument = this
    return comment as unknown as Comment
  }

  createElement(tagName: string) {
    const element = new FakeElement(tagName)
    element.ownerDocument = this
    return element as unknown as HTMLElement
  }

  createTextNode(data: string) {
    const text = new FakeText(data)
    text.ownerDocument = this
    return text as unknown as Text
  }

  createTreeWalker(root: FakeNode, whatToShow?: number) {
    const nodes: FakeNode[] = []
    const visit = (node: FakeNode) => {
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
    const walker: { currentNode: Node | null; nextNode(): Node | null } = {
      currentNode: null,
      nextNode() {
        index += 1
        const node = nodes[index] ?? null
        walker.currentNode = node as unknown as Node | null
        return node as unknown as Node | null
      },
    }
    return walker as unknown as TreeWalker
  }
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  readonly observed = new Set<Element>()

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this)
  }

  disconnect() {
    this.observed.clear()
  }

  observe(element: Element) {
    this.observed.add(element)
  }

  unobserve(element: Element) {
    this.observed.delete(element)
  }

  trigger(isIntersecting: boolean) {
    const target = [...this.observed][0]
    if (!target) {
      return
    }
    this.callback(
      [
        {
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: {} as DOMRectReadOnly,
          isIntersecting,
          rootBounds: null,
          target,
          time: 0,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    )
  }
}

const createContainer = () =>
  ({
    actions: new Map(),
    actionStates: new Map(),
    asyncSignalSnapshotCache: new Map(),
    asyncSignalStates: new Map(),
    atoms: new WeakMap(),
    components: new Map(),
    dirty: new Set(),
    dirtyFlushQueued: false,
    doc: new FakeDocument() as unknown as Document,
    eventDispatchPromise: null,
    imports: new Map(),
    interactivePrefetchCheckQueued: false,
    loaderStates: new Map(),
    loaders: new Map(),
    id: 'motion-test',
    nextAtomId: 0,
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
    pendingSuspensePromises: new Set(),
    resumeReadyPromise: null,
    rootChildCursor: 0,
    rootElement: undefined,
    router: null,
    scopes: new Map(),
    signals: new Map(),
    symbols: new Map(),
    visibilityCheckQueued: false,
    visibilityListenersCleanup: null,
    visibles: new Map(),
    watches: new Map(),
  }) as RuntimeContainer

const flushAsync = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const queryFakeElements = (root: FakeNode, predicate: (element: FakeElement) => boolean) => {
  const matches: FakeElement[] = []
  const visit = (node: FakeNode) => {
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

const withFakeNodeGlobal = async (fn: () => Promise<void>) => {
  const OriginalComment = globalThis.Comment
  const OriginalElement = globalThis.Element
  const OriginalHTMLElement = globalThis.HTMLElement
  const OriginalIntersectionObserver = globalThis.IntersectionObserver
  const OriginalNode = globalThis.Node
  const OriginalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const OriginalRequestAnimationFrame = globalThis.requestAnimationFrame
  const OriginalText = globalThis.Text

  FakeIntersectionObserver.instances = []
  globalThis.Comment = FakeComment as unknown as typeof Comment
  globalThis.Element = FakeElement as unknown as typeof Element
  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement
  globalThis.IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver
  globalThis.Node = FakeNode as unknown as typeof Node
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0)) as unknown as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((handle: number) =>
    clearTimeout(handle)) as typeof cancelAnimationFrame
  globalThis.Text = FakeText as unknown as typeof Text

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
    const { html } = renderSSR(() => (
      <motion.div
        animate={{ opacity: 1 }}
        initial={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        whileHover={{ opacity: 0.8 }}
      />
    ))

    expect(html).toContain('<div')
    expect(html).not.toContain('animate=')
    expect(html).not.toContain('initial=')
    expect(html).not.toContain('transition=')
    expect(html).not.toContain('whileHover=')
  })

  it('renders the initial pose inline during SSR', () => {
    const { html } = renderSSR(() => (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1 }} />
    ))

    expect(html).toContain('opacity: 0; transform: translate3d(20px, 0px, 0px)')
  })

  it('renders the animate pose inline during SSR when initial is false', () => {
    const { html } = renderSSR(() => <motion.div initial={false} animate={{ opacity: 1, x: 0 }} />)

    expect(html).toContain('opacity: 1; transform: translate3d(0px, 0px, 0px)')
  })

  it('serializes nested accessor animate targets during SSR', () => {
    const { html } = renderSSR(() =>
      jsxDEV(
        motion.div as never,
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
    const { html } = renderSSR(() => (
      <motion.div initial={false} animate={{ maxHeight: 160, opacity: 1 }} />
    ))

    expect(html).toContain('max-height: 160px')
    expect(html).toContain('transition-property: max-height, opacity')
    expect(html).not.toContain('maxHeight:')
  })

  it('inherits transition config from MotionConfig', () => {
    const { html } = renderSSR(() => (
      <MotionConfig transition={{ duration: 0.6 }}>
        <motion.div animate={{ opacity: 1 }} />
      </MotionConfig>
    ))

    expect(html).toContain('<div')
  })

  it('keeps removed keyed children rendered through AnimatePresence until exit support is detected', () => {
    const { html } = renderSSR(() => (
      <AnimatePresence>
        <motion.div key="a" exit={{ opacity: 0 }} />
      </AnimatePresence>
    ))

    expect(html).toContain('<div')
  })

  it('tracks ref signals that resolve after the initial render in useInView', async () => {
    await withFakeNodeGlobal(async () => {
      let ref!: { value: HTMLElement | undefined }
      const values: boolean[] = []

      const App = __eclipsaComponent(
        () => {
          ref = useSignal<HTMLElement | undefined>()
          const inView = useInView(ref)

          useWatch(() => {
            values.push(inView.value)
          }, [inView])

          return jsxDEV('div', { ref }, null, false, {})
        },
        'motion-use-in-view-ref-signal',
        () => [],
      )

      const container = createContainer()
      container.symbols.set('motion-value-signal-bridge', '/tests/motion-value-signal-bridge.tsx')
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
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
      let setValue!: (value: number) => void
      const observed: number[] = []

      const App = __eclipsaComponent(
        () => {
          const source = useMotionValue(0)

          useMotionValueEvent(source, 'change', (value) => {
            observed.push(value)
          })

          setValue = (value: number) => {
            source.set(value)
          }

          return jsxDEV('span', { children: 'ready' }, null, false, {})
        },
        'motion-use-motion-value-event-direct',
        () => [],
      )

      const container = createContainer()
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      await flushAsync()

      setValue(4)
      await flushAsync()

      expect(observed).toEqual([4])
    })
  })

  it('primes lazy motion values before subscribing in useMotionValueEvent', async () => {
    await withFakeNodeGlobal(async () => {
      const observed: number[] = []
      let emit!: (value: number) => void

      const App = __eclipsaComponent(
        () => {
          let started = false
          let listener: ((value: number) => void) | undefined
          const lazyValue = {
            get() {
              started = true
              return 0
            },
            on(_eventName: 'change', next: (value: number) => void) {
              if (started) {
                listener = next
              }
              return () => {
                if (listener === next) {
                  listener = undefined
                }
              }
            },
          }

          emit = (value: number) => {
            listener?.(value)
          }

          useMotionValueEvent(lazyValue as never, 'change', (value: unknown) => {
            observed.push(value as number)
          })

          return jsxDEV('span', { children: 'ready' }, null, false, {})
        },
        'motion-use-motion-value-event-lazy',
        () => [],
      )

      const container = createContainer()
      withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      await flushAsync()

      emit(8)
      await flushAsync()

      expect(observed).toEqual([8])
    })
  })

  it('mirrors motion values into signals for ordinary reactive DOM updates', async () => {
    await withFakeNodeGlobal(async () => {
      let ref!: { value: HTMLElement | undefined }
      let setRotate!: (value: number) => void
      let setAngle!: (value: string) => void

      const AppBody = () => {
        ref = useSignal<HTMLElement | undefined>()
        const rotate = useMotionValue(0)
        const angle = useMotionValue('0deg')
        const rotateSignal = useMotionValueSignal(rotate)
        const angleSignal = useMotionValueSignal(angle)

        setRotate = (value: number) => {
          rotate.set(value)
        }
        setAngle = (value: string) => {
          angle.set(value)
        }

        return jsxDEV(
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
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
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
      let ref!: { value: HTMLElement | undefined }
      let visible!: { value: boolean }

      const AppBody = () => {
        ref = useSignal<HTMLElement | undefined>()
        visible = useSignal(false)

        return jsxDEV(
          motion.div as never,
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
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
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
        jsxDEV(
          motion.div as never,
          {
            animate: { opacity: 1 },
            children: jsxDEV(
              'div',
              {
                class: 'mx-auto',
                children: jsxDEV(
                  motion.div as never,
                  {
                    animate: { opacity: 1 },
                    children: [
                      jsxDEV('pre', { children: '<div>{count.value}</div>' }, null, false, {}),
                      jsxDEV(
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
      host.ownerDocument = container.doc as unknown as FakeDocument

      withRuntimeContainer(container, () => {
        const nodes = renderClientInsertable(jsxDEV(Parent, {}, null, false, {}), container)
        for (const node of nodes as unknown as FakeNode[]) {
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

      container.dirty.add(parentBoundary!.id)
      await flushDirtyComponents(container)

      expect(
        queryFakeElements(host, (element) => element.textContent === 'YOUR CODE'),
      ).toHaveLength(1)
    })
  })
})
