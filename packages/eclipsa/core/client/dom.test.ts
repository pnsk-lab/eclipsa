import { describe, expect, it, vi } from 'vitest'
import {
  attr,
  attrStatic,
  classSignalEquals,
  classSignal,
  createComponent,
  eventStatic,
  hydrate,
  insertElementStatic,
  insertElementTextStatic,
  listenerStatic,
  materializeTemplateRefs,
  text,
  textNodeSignalMember,
  textNodeSignalMemberStatic,
  textNodeSignal,
  textNodeSignalValue,
  textSignal,
} from './dom.ts'
import { ACTION_CSRF_COOKIE, ACTION_CSRF_FIELD, ACTION_CSRF_INPUT_ATTR } from '../action-csrf.ts'
import { __eclipsaComponent, __eclipsaEvent } from '../internal.ts'
import { ACTION_FORM_ATTR, DOM_TEXT_NODE } from '../runtime/constants.ts'
import { markManagedAttributesForSubtreeRemembered } from '../runtime/dom.ts'
import { ROUTE_LINK_ATTR } from '../router-shared.ts'
import {
  createDetachedRuntimeContainer,
  createDetachedRuntimeSignal,
  type RuntimeContainer,
  withRuntimeContainer,
} from '../runtime.ts'
import { effect, useSignal } from '../signal.ts'
import { Suspense } from '../suspense.ts'

const createContainer = () =>
  ({
    actionStates: new Map(),
    actions: new Map(),
    asyncSignalSnapshotCache: new Map(),
    asyncSignalStates: new Map(),
    atoms: new WeakMap(),
    components: new Map(),
    dirty: new Set(),
    dirtyFlushQueued: false,
    eventDispatchPromise: null,
    eventBindingScopeCache: new Map(),
    externalRenderCache: new Map(),
    hasRuntimeRefMarkers: false,
    id: 'rt-client-dom-test',
    imports: new Map(),
    insertMarkerLookup: new Map(),
    interactivePrefetchCheckQueued: false,
    loaderStates: new Map(),
    loaders: new Map(),
    materializedScopes: new Map(),
    nextAtomId: 0,
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
    pendingSuspensePromises: new Set(),
    resumeReadyPromise: null,
    rootChildCursor: 0,
    router: null,
    scopes: new Map(),
    signals: new Map(),
    symbols: new Map(),
    visibilityCheckQueued: false,
    visibilityListenersCleanup: null,
    visibles: new Map(),
    watches: new Map(),
  }) as RuntimeContainer

describe('core/client dom template refs', () => {
  it('materializes sibling-safe template node references from a clone root', () => {
    const nested = {
      childNodes: [] as Node[],
      firstChild: null as Node | null,
      nextSibling: null as Node | null,
    } as unknown as Node
    const second = {
      childNodes: [nested] as Node[],
      firstChild: nested,
      nextSibling: null as Node | null,
    } as unknown as Node
    const first = {
      childNodes: [] as Node[],
      firstChild: null as Node | null,
      nextSibling: second,
    } as unknown as Node
    const root = {
      childNodes: [first, second] as Node[],
      firstChild: first,
      nextSibling: null as Node | null,
    } as unknown as Node

    const refs = materializeTemplateRefs(root, [
      [-1, -1, 0],
      [-1, 0, 1],
      [1, -1, 0],
    ])

    expect(refs[0]).toBe(first)
    expect(refs[1]).toBe(refs[0]!.nextSibling)
    expect(refs[2]).toBe(nested)
  })
})

describe('core/client dom attr', () => {
  it('applies class with setAttribute so svg elements can be rerendered', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/2000/svg',
      setAttribute,
    }

    Object.defineProperty(elem, 'className', {
      configurable: true,
      get() {
        return {
          baseVal: '',
        }
      },
    })

    expect(() => attr(elem as unknown as Element, 'class', () => 'icon icon-active')).not.toThrow()
    expect(setAttribute).toHaveBeenCalledWith('class', 'icon icon-active')
  })

  it('applies svg attributes with setAttribute instead of readonly DOM properties', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/2000/svg',
      setAttribute,
    }

    Object.defineProperty(elem, 'viewBox', {
      configurable: true,
      get() {
        return {
          baseVal: null,
        }
      },
    })

    expect(() => attr(elem as unknown as Element, 'viewBox', () => '0 0 24 24')).not.toThrow()
    expect(setAttribute).toHaveBeenCalledWith('viewBox', '0 0 24 24')
  })

  it('assigns signal refs without stringifying them into attributes', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute,
    }
    const ref = createDetachedRuntimeSignal(
      createContainer(),
      's0',
      undefined as Element | undefined,
    )

    attr(elem as unknown as Element, 'ref', () => ref)

    expect(ref.value).toBe(elem)
    expect(setAttribute).not.toHaveBeenCalledWith('ref', expect.anything())
  })

  it('assigns dangerouslySetInnerHTML via the DOM property', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      innerHTML: '',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute,
    }

    attr(elem as unknown as Element, 'dangerouslySetInnerHTML', () => '<span>raw</span>')

    expect(elem.innerHTML).toBe('<span>raw</span>')
    expect(setAttribute).not.toHaveBeenCalledWith('dangerouslySetInnerHTML', expect.anything())
  })

  it('preserves string style attributes for svg rerenders', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/2000/svg',
      setAttribute,
    }

    attr(
      elem as unknown as Element,
      'style',
      () => 'display:inline;opacity:0.5;fill:url(#linearGradient3);fill-opacity:1',
    )

    expect(setAttribute).toHaveBeenCalledWith(
      'style',
      'display:inline;opacity:0.5;fill:url(#linearGradient3);fill-opacity:1',
    )
  })

  it('preserves data attributes during client rerenders', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute,
    }

    attr(elem as unknown as Element, 'data-testid', () => 'probe-aa-0')

    expect(setAttribute).toHaveBeenCalledWith('data-testid', 'probe-aa-0')
  })

  it('applies one-shot runtime-only attributes without reactive wrappers', () => {
    const setAttribute = vi.fn()
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute,
    }

    attrStatic(elem as unknown as Element, 'data-testid', 'probe-aa-0')

    expect(setAttribute).toHaveBeenCalledWith('data-testid', 'probe-aa-0')
  })

  it('skips redundant class writes when a reactive class result is unchanged', () => {
    const flag = createDetachedRuntimeSignal(createContainer(), 's0', true)
    let className = ''
    let setCount = 0
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute: vi.fn(),
    }

    Object.defineProperty(elem, 'className', {
      configurable: true,
      get() {
        return className
      },
      set(value: string) {
        className = value
        setCount += 1
      },
    })

    attr(elem as unknown as Element, 'class', () => (flag.value ? 'card' : 'card'))

    expect(className).toBe('card')
    expect(setCount).toBe(1)

    flag.value = false

    expect(className).toBe('card')
    expect(setCount).toBe(1)
  })

  it('skips initial empty class writes when the element has no class attribute', () => {
    const flag = createDetachedRuntimeSignal(createContainer(), 's0', false)
    let className = ''
    let setCount = 0
    let removeCount = 0
    const elem = {
      addEventListener: vi.fn(),
      getAttribute(name: string) {
        return name === 'class' && className !== '' ? className : null
      },
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      removeAttribute(name: string) {
        if (name === 'class') {
          className = ''
          removeCount += 1
        }
      },
      setAttribute: vi.fn(),
    }

    Object.defineProperty(elem, 'className', {
      configurable: true,
      get() {
        return className
      },
      set(value: string) {
        className = value
        setCount += 1
      },
    })

    attr(elem as unknown as Element, 'class', () => (flag.value ? 'card' : ''))

    expect(className).toBe('')
    expect(setCount).toBe(0)
    expect(removeCount).toBe(0)

    flag.value = true

    expect(className).toBe('card')
    expect(setCount).toBe(1)

    flag.value = false

    expect(className).toBe('')
    expect(removeCount).toBe(1)
  })

  it('updates tracked class bindings through the specialized class helper', () => {
    const flag = createDetachedRuntimeSignal(createContainer(), 's0', false)
    let currentClassName = ''
    let setCount = 0
    let removeCount = 0
    const elem = {
      addEventListener: vi.fn(),
      getAttribute(name: string) {
        return name === 'class' && currentClassName !== '' ? currentClassName : null
      },
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      removeAttribute(name: string) {
        if (name === 'class') {
          currentClassName = ''
          removeCount += 1
        }
      },
      setAttribute: vi.fn(),
    }

    Object.defineProperty(elem, 'className', {
      configurable: true,
      get() {
        return currentClassName
      },
      set(value: string) {
        currentClassName = value
        setCount += 1
      },
    })

    classSignal(elem as unknown as Element, flag, (value) => (value ? 'selected' : ''))

    expect(currentClassName).toBe('')
    expect(setCount).toBe(0)

    flag.value = true

    expect(currentClassName).toBe('selected')
    expect(setCount).toBe(1)

    flag.value = false

    expect(currentClassName).toBe('')
    expect(removeCount).toBe(1)
  })

  it('updates tracked class equality bindings through the specialized equality helper', () => {
    const runtimeContainer = createContainer()
    const selected = createDetachedRuntimeSignal(runtimeContainer, 's0', 7)
    let currentClassName = ''
    const elem = {
      addEventListener: vi.fn(),
      getAttribute(name: string) {
        return name === 'class' && currentClassName !== '' ? currentClassName : null
      },
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      removeAttribute(name: string) {
        if (name === 'class') {
          currentClassName = ''
        }
      },
      setAttribute: vi.fn(),
    }

    Object.defineProperty(elem, 'className', {
      configurable: true,
      get() {
        return currentClassName
      },
      set(value: string) {
        currentClassName = value
      },
    })

    withRuntimeContainer(runtimeContainer, () => {
      classSignalEquals(elem as unknown as Element, selected, 7, 'danger', '')
    })

    expect(currentClassName).toBe('danger')

    selected.value = 8

    expect(currentClassName).toBe('')
  })

  it('skips initial class equality writes when the DOM already matches the current signal state', () => {
    const runtimeContainer = createContainer()
    const selected = createDetachedRuntimeSignal(runtimeContainer, 's0', 8)
    let currentClassName = ''
    let setCount = 0
    let removeCount = 0
    const elem = {
      addEventListener: vi.fn(),
      getAttribute(name: string) {
        return name === 'class' && currentClassName !== '' ? currentClassName : null
      },
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      removeAttribute(name: string) {
        if (name === 'class') {
          currentClassName = ''
          removeCount += 1
        }
      },
      setAttribute: vi.fn(),
    }

    Object.defineProperty(elem, 'className', {
      configurable: true,
      get() {
        return currentClassName
      },
      set(value: string) {
        currentClassName = value
        setCount += 1
      },
    })

    withRuntimeContainer(runtimeContainer, () => {
      classSignalEquals(elem as unknown as Element, selected, 7, 'danger', '')
    })

    expect(currentClassName).toBe('')
    expect(setCount).toBe(0)
    expect(removeCount).toBe(0)

    selected.value = 7

    expect(currentClassName).toBe('danger')
    expect(setCount).toBe(1)

    selected.value = 8

    expect(currentClassName).toBe('')
    expect(removeCount).toBe(1)
  })

  it('skips redundant class writes when class equality stays unmatched across signal changes', () => {
    const runtimeContainer = createContainer()
    const selected = createDetachedRuntimeSignal(runtimeContainer, 's0', 7)
    let currentClassName = ''
    let setCount = 0
    let removeCount = 0
    const elem = {
      addEventListener: vi.fn(),
      getAttribute(name: string) {
        return name === 'class' && currentClassName !== '' ? currentClassName : null
      },
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      removeAttribute(name: string) {
        if (name === 'class') {
          currentClassName = ''
          removeCount += 1
        }
      },
      setAttribute: vi.fn(),
    }

    Object.defineProperty(elem, 'className', {
      configurable: true,
      get() {
        return currentClassName
      },
      set(value: string) {
        currentClassName = value
        setCount += 1
      },
    })

    withRuntimeContainer(runtimeContainer, () => {
      classSignalEquals(elem as unknown as Element, selected, 7, 'danger', '')
    })

    expect(currentClassName).toBe('danger')
    expect(setCount).toBe(1)
    expect(removeCount).toBe(0)

    selected.value = 8

    expect(currentClassName).toBe('')
    expect(setCount).toBe(1)
    expect(removeCount).toBe(1)

    selected.value = 9

    expect(currentClassName).toBe('')
    expect(setCount).toBe(1)
    expect(removeCount).toBe(1)

    selected.value = 7

    expect(currentClassName).toBe('danger')
    expect(setCount).toBe(2)
    expect(removeCount).toBe(1)
  })

  it('updates tracked text-node member bindings through the specialized member helper', () => {
    class FakeText {
      data: string
      nodeType = DOM_TEXT_NODE
      parentNode: FakeElement | null = null

      constructor(value: string) {
        this.data = value
      }
    }

    class FakeElement {
      childNodes: FakeText[] = []
      firstChild: FakeText | null = null
      namespaceURI = 'http://www.w3.org/1999/xhtml'
      nodeType = 1
      ownerDocument = {
        createTextNode(value: string) {
          return new FakeText(value)
        },
      }

      appendChild(node: FakeText) {
        this.childNodes.push(node)
        this.firstChild = this.childNodes[0] ?? null
        node.parentNode = this
        return node
      }
    }

    const runtimeContainer = createContainer()
    const label = createDetachedRuntimeSignal(runtimeContainer, 's0', { label: 'alpha' })
    const parent = new FakeElement()
    const textNode = new FakeText('alpha')
    parent.appendChild(textNode)

    withRuntimeContainer(runtimeContainer, () => {
      textNodeSignalMember(label, 'label', parent as unknown as Node)
    })

    expect(parent.firstChild?.data).toBe('alpha')

    label.value = { label: 'beta' }

    expect(parent.firstChild?.data).toBe('beta')
  })

  it('binds static event handlers through the specialized event helper', () => {
    const addEventListener = vi.fn()
    const handleClick = vi.fn()
    const elem = {
      addEventListener,
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute: vi.fn(),
    }

    eventStatic(elem as unknown as Element, 'click', handleClick)

    expect(addEventListener).toHaveBeenCalledWith('click', handleClick)
  })

  it('binds packed resumable static event handlers without allocating a descriptor value first', () => {
    const runtimeContainer = createContainer()
    const docAddEventListener = vi.fn()
    runtimeContainer.doc = {
      addEventListener: docAddEventListener,
    } as unknown as Document
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute: vi.fn(),
    }

    withRuntimeContainer(runtimeContainer, () => {
      eventStatic.__2(elem as unknown as Element, 'click', 'symbol-click', 'a', 'b')
    })

    expect(docAddEventListener).toHaveBeenCalledOnce()
    expect(elem.addEventListener).not.toHaveBeenCalled()
  })

  it('installs delegated listeners for packed event descriptors routed through eventStatic', () => {
    const runtimeContainer = createContainer()
    const docAddEventListener = vi.fn()
    runtimeContainer.doc = {
      addEventListener: docAddEventListener,
    } as unknown as Document
    const elem = {
      addEventListener: vi.fn(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute: vi.fn(),
    }

    withRuntimeContainer(runtimeContainer, () => {
      eventStatic(
        elem as unknown as Element,
        'click',
        __eclipsaEvent.__1('click', 'symbol-click', () => ['payload']),
      )
    })

    expect(docAddEventListener).toHaveBeenCalledWith('click', expect.any(Function), true)
    expect(elem.addEventListener).not.toHaveBeenCalled()
  })

  it('binds direct-mode static event handlers without resumable checks', () => {
    const addEventListener = vi.fn()
    const handleClick = vi.fn()
    const elem = {
      addEventListener,
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      setAttribute: vi.fn(),
    }

    listenerStatic(elem as unknown as Element, 'click', handleClick)

    expect(addEventListener).toHaveBeenCalledWith('click', handleClick)
  })

  it('preserves suspense components as render objects for runtime fallback handling', () => {
    const rendered = createComponent(Suspense as any, {
      children: ['done'],
      fallback: ['loading'],
    })()

    expect(rendered).toMatchObject({
      props: {
        children: ['done'],
        fallback: ['loading'],
      },
      type: Suspense,
    })
  })

  it('preserves resumable components as render objects so client rerenders keep boundary shape', () => {
    const Child = __eclipsaComponent(
      (_props: { label: string }) => null,
      'component:child',
      () => [],
    )

    const rendered = createComponent(Child as any, {
      label: 'Overview',
    })()

    expect(rendered).toMatchObject({
      props: {
        label: 'Overview',
      },
      type: Child,
    })
  })

  it('hydrates stateful root components inside a detached runtime frame', () => {
    class FakeNode {
      childNodes: FakeNode[] = []
      ownerDocument: FakeDocument
      parentNode: FakeNode | null = null

      constructor(ownerDocument: FakeDocument) {
        this.ownerDocument = ownerDocument
      }

      remove() {
        this.parentNode?.removeChild(this)
      }
    }

    class FakeTextNode extends FakeNode {
      data: string

      constructor(ownerDocument: FakeDocument, value: string) {
        super(ownerDocument)
        this.data = value
      }

      get textContent() {
        return this.data
      }

      set textContent(value: string) {
        this.data = value
      }
    }

    class FakeComment extends FakeNode {
      data: string

      constructor(ownerDocument: FakeDocument, value: string) {
        super(ownerDocument)
        this.data = value
      }

      get textContent() {
        return this.data
      }
    }

    class FakeElement extends FakeNode {
      appendChild(node: FakeNode) {
        return this.insertBefore(node, null)
      }

      insertBefore(node: FakeNode, referenceNode: FakeNode | null) {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
        const referenceIndex = referenceNode == null ? -1 : this.childNodes.indexOf(referenceNode)
        if (referenceIndex < 0) {
          this.childNodes.push(node)
        } else {
          this.childNodes.splice(referenceIndex, 0, node)
        }
        node.parentNode = this
        return node
      }

      removeChild(node: FakeNode) {
        const index = this.childNodes.indexOf(node)
        if (index >= 0) {
          this.childNodes.splice(index, 1)
          node.parentNode = null
        }
        return node
      }

      get lastChild() {
        return this.childNodes.at(-1) ?? null
      }

      get textContent() {
        return this.childNodes.map((child) => child.textContent ?? '').join('')
      }
    }

    class FakeDocument {
      body = new FakeElement(this)
      defaultView = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      addEventListener = vi.fn()
      removeEventListener = vi.fn()

      querySelectorAll() {
        return []
      }

      createComment(value: string) {
        return new FakeComment(this, value)
      }

      createTextNode(value: string) {
        return new FakeTextNode(this, value)
      }
    }

    const doc = new FakeDocument()
    const target = new FakeElement(doc)
    const App = __eclipsaComponent(
      () => {
        const count = useSignal(1)
        return String(count.value)
      },
      'component:hydrate-root',
      () => [],
    )

    const previousComment = (globalThis as Record<string, unknown>).Comment
    ;(globalThis as Record<string, unknown>).Comment = FakeComment

    try {
      expect(() => hydrate(App as any, target as any)).not.toThrow()
      expect(
        target.childNodes.some((child) => child instanceof FakeTextNode && child.data === '1'),
      ).toBe(true)
      expect(doc.addEventListener).not.toHaveBeenCalled()
      expect(doc.defaultView.addEventListener).not.toHaveBeenCalled()
    } finally {
      ;(globalThis as Record<string, unknown>).Comment = previousComment
    }
  })

  it('binds route links after empty-root mounts without enabling full resume listeners', () => {
    class FakeNode {
      childNodes: FakeNode[] = []
      ownerDocument: FakeDocument
      parentNode: FakeNode | null = null

      constructor(ownerDocument: FakeDocument) {
        this.ownerDocument = ownerDocument
      }

      remove() {
        this.parentNode?.removeChild(this)
      }
    }

    class FakeAnchorElement extends FakeNode {
      nodeType = 1
      tagName = 'A'
      attributes = new Map<string, string>()
      addEventListener = vi.fn()

      appendChild(node: FakeNode) {
        return this.insertBefore(node, null)
      }

      insertBefore(node: FakeNode, referenceNode: FakeNode | null) {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
        const referenceIndex = referenceNode == null ? -1 : this.childNodes.indexOf(referenceNode)
        if (referenceIndex < 0) {
          this.childNodes.push(node)
        } else {
          this.childNodes.splice(referenceIndex, 0, node)
        }
        node.parentNode = this
        return node
      }

      removeChild(node: FakeNode) {
        const index = this.childNodes.indexOf(node)
        if (index >= 0) {
          this.childNodes.splice(index, 1)
          node.parentNode = null
        }
        return node
      }

      getAttribute(name: string) {
        return this.attributes.get(name) ?? null
      }

      getAttributeNames() {
        return [...this.attributes.keys()]
      }

      hasAttribute(name: string) {
        return this.attributes.has(name)
      }

      setAttribute(name: string, value: string) {
        this.attributes.set(name, value)
      }

      querySelectorAll(selector: string) {
        if (selector !== `a[${ROUTE_LINK_ATTR}]`) {
          return []
        }
        return [this]
      }
    }

    class FakeComment extends FakeNode {
      data: string

      constructor(ownerDocument: FakeDocument, value: string) {
        super(ownerDocument)
        this.data = value
      }
    }

    class FakeTextNode extends FakeNode {
      data: string

      constructor(ownerDocument: FakeDocument, value: string) {
        super(ownerDocument)
        this.data = value
      }
    }

    class FakeElement extends FakeNode {
      nodeType = 1
      tagName = 'DIV'
      attributes = new Map<string, string>()

      appendChild(node: FakeNode) {
        return this.insertBefore(node, null)
      }

      insertBefore(node: FakeNode, referenceNode: FakeNode | null) {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
        const referenceIndex = referenceNode == null ? -1 : this.childNodes.indexOf(referenceNode)
        if (referenceIndex < 0) {
          this.childNodes.push(node)
        } else {
          this.childNodes.splice(referenceIndex, 0, node)
        }
        node.parentNode = this
        return node
      }

      removeChild(node: FakeNode) {
        const index = this.childNodes.indexOf(node)
        if (index >= 0) {
          this.childNodes.splice(index, 1)
          node.parentNode = null
        }
        return node
      }

      getAttribute(name: string) {
        return this.attributes.get(name) ?? null
      }

      getAttributeNames() {
        return [...this.attributes.keys()]
      }

      hasAttribute(name: string) {
        return this.attributes.has(name)
      }

      querySelectorAll(selector: string) {
        const matches: FakeNode[] = []
        const walk = (node: FakeNode) => {
          if (
            selector === `a[${ROUTE_LINK_ATTR}]` &&
            node instanceof FakeAnchorElement &&
            node.hasAttribute(ROUTE_LINK_ATTR)
          ) {
            matches.push(node)
          }
          for (const child of node.childNodes) {
            walk(child)
          }
        }
        walk(this)
        return matches
      }
    }

    class FakeDocument {
      body = new FakeElement(this)
      defaultView = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      addEventListener = vi.fn()
      removeEventListener = vi.fn()

      createComment(value: string) {
        return new FakeComment(this, value)
      }

      createTextNode(value: string) {
        return new FakeTextNode(this, value)
      }

      querySelectorAll() {
        return []
      }
    }

    const doc = new FakeDocument()
    const target = new FakeElement(doc)
    const link = new FakeAnchorElement(doc)
    link.setAttribute(ROUTE_LINK_ATTR, '')
    link.setAttribute('href', '/todos')

    const App = __eclipsaComponent(
      () => link as unknown as any,
      'component:hydrate-route-link-root',
      () => [],
    )

    const previousComment = (globalThis as Record<string, unknown>).Comment
    const previousNode = (globalThis as Record<string, unknown>).Node
    ;(globalThis as Record<string, unknown>).Comment = FakeComment
    ;(globalThis as Record<string, unknown>).Node = FakeNode

    try {
      expect(() => hydrate(App as any, target as any)).not.toThrow()
      expect(link.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
      expect(doc.defaultView.addEventListener).toHaveBeenCalledWith(
        'popstate',
        expect.any(Function),
      )
      expect(doc.addEventListener).not.toHaveBeenCalled()
    } finally {
      ;(globalThis as Record<string, unknown>).Comment = previousComment
      ;(globalThis as Record<string, unknown>).Node = previousNode
    }
  })

  it('skips deep hydrate finalization scans for fresh tracked mounts without refs', () => {
    class FakeNode {
      childNodes: FakeNode[] = []
      ownerDocument: FakeDocument
      parentNode: FakeNode | null = null

      constructor(ownerDocument: FakeDocument) {
        this.ownerDocument = ownerDocument
      }

      remove() {
        this.parentNode?.removeChild(this)
      }
    }

    class FakeComment extends FakeNode {
      data: string

      constructor(ownerDocument: FakeDocument, value: string) {
        super(ownerDocument)
        this.data = value
      }
    }

    class FakeTextNode extends FakeNode {
      data: string

      constructor(ownerDocument: FakeDocument, value: string) {
        super(ownerDocument)
        this.data = value
      }
    }

    class FakeElement extends FakeNode {
      nodeType = 1

      appendChild(node: FakeNode) {
        return this.insertBefore(node, null)
      }

      insertBefore(node: FakeNode, referenceNode: FakeNode | null) {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
        const referenceIndex = referenceNode == null ? -1 : this.childNodes.indexOf(referenceNode)
        if (referenceIndex < 0) {
          this.childNodes.push(node)
        } else {
          this.childNodes.splice(referenceIndex, 0, node)
        }
        node.parentNode = this
        return node
      }

      removeChild(node: FakeNode) {
        const index = this.childNodes.indexOf(node)
        if (index >= 0) {
          this.childNodes.splice(index, 1)
          node.parentNode = null
        }
        return node
      }

      getAttribute(_name: string) {
        return null
      }

      getAttributeNames() {
        return []
      }

      get lastChild() {
        return this.childNodes.at(-1) ?? null
      }
    }

    class ThrowingElement extends FakeElement {
      override getAttribute(name: string) {
        if (name === 'data-e-ref') {
          throw new Error('unexpected ref restore scan')
        }
        return super.getAttribute(name)
      }

      override getAttributeNames() {
        throw new Error('unexpected managed attribute scan')
      }
    }

    class FakeDocument {
      body = new FakeElement(this)
      defaultView = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      addEventListener = vi.fn()
      removeEventListener = vi.fn()

      querySelectorAll() {
        return []
      }

      createComment(value: string) {
        return new FakeComment(this, value)
      }

      createTextNode(value: string) {
        return new FakeTextNode(this, value)
      }
    }

    const doc = new FakeDocument()
    const target = new FakeElement(doc)
    const trackedRoot = new ThrowingElement(doc)
    markManagedAttributesForSubtreeRemembered(trackedRoot as unknown as Node)

    const App = __eclipsaComponent(
      () => trackedRoot as unknown as JSX.Element,
      'component:hydrate-tracked-root',
      () => [],
    )

    const previousComment = (globalThis as Record<string, unknown>).Comment
    const previousNode = (globalThis as Record<string, unknown>).Node
    ;(globalThis as Record<string, unknown>).Comment = FakeComment
    ;(globalThis as Record<string, unknown>).Node = FakeNode

    try {
      expect(() => hydrate(App as any, target as any)).not.toThrow()
      expect(target.childNodes).toContain(trackedRoot)
    } finally {
      ;(globalThis as Record<string, unknown>).Comment = previousComment
      ;(globalThis as Record<string, unknown>).Node = previousNode
    }
  })

  it('injects csrf inputs when action forms are bound on the client', () => {
    class FakeInputElement {
      parentNode: FakeFormElement | null = null
      private readonly attrs = new Map<string, string>()

      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }

      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
      }
    }

    class FakeFormElement {
      firstChild: FakeInputElement | null = null
      namespaceURI = 'http://www.w3.org/1999/xhtml'
      private readonly attrs = new Map<string, string>()
      private csrfInput: FakeInputElement | null = null

      addEventListener = vi.fn()

      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }

      insertBefore(node: FakeInputElement, _child: FakeInputElement | null) {
        node.parentNode = this
        this.csrfInput = node
        this.firstChild = node
        return node
      }

      querySelector(selector: string) {
        return selector === `input[${ACTION_CSRF_INPUT_ATTR}]` ? this.csrfInput : null
      }

      removeAttribute(name: string) {
        this.attrs.delete(name)
      }

      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
      }
    }

    const originalDocument = Reflect.get(globalThis, 'document')
    const originalHTMLFormElement = Reflect.get(globalThis, 'HTMLFormElement')
    const originalHTMLInputElement = Reflect.get(globalThis, 'HTMLInputElement')
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        cookie: `${ACTION_CSRF_COOKIE}=template-token`,
        createElement(tagName: string) {
          if (tagName !== 'input') {
            throw new Error(`Unsupported tag ${tagName}.`)
          }
          return new FakeInputElement()
        },
      },
    })
    Object.defineProperty(globalThis, 'HTMLFormElement', {
      configurable: true,
      value: FakeFormElement,
    })
    Object.defineProperty(globalThis, 'HTMLInputElement', {
      configurable: true,
      value: FakeInputElement,
    })

    try {
      const form = new FakeFormElement()

      attr(form as unknown as Element, ACTION_FORM_ATTR, () => 'sum')

      const input = form.querySelector(`input[${ACTION_CSRF_INPUT_ATTR}]`)
      expect(input).toBeInstanceOf(FakeInputElement)
      expect(input?.getAttribute('name')).toBe(ACTION_CSRF_FIELD)
      expect(input?.getAttribute('value')).toBe('template-token')
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document')
      } else {
        Object.defineProperty(globalThis, 'document', {
          configurable: true,
          value: originalDocument,
        })
      }
      if (originalHTMLFormElement === undefined) {
        Reflect.deleteProperty(globalThis, 'HTMLFormElement')
      } else {
        Object.defineProperty(globalThis, 'HTMLFormElement', {
          configurable: true,
          value: originalHTMLFormElement,
        })
      }
      if (originalHTMLInputElement === undefined) {
        Reflect.deleteProperty(globalThis, 'HTMLInputElement')
      } else {
        Object.defineProperty(globalThis, 'HTMLInputElement', {
          configurable: true,
          value: originalHTMLInputElement,
        })
      }
    }
  })
})

describe('core/client dom text', () => {
  const withFakeTextDom = (fn: (doc: FakeDocument) => void) => {
    class FakeNode {
      static COMMENT_NODE = 8
      static ELEMENT_NODE = 1
      static TEXT_NODE = 3

      childNodes: FakeNode[] = []
      nodeType: number
      ownerDocument: FakeDocument
      parentNode: FakeElement | null = null

      constructor(ownerDocument: FakeDocument, nodeType: number) {
        this.ownerDocument = ownerDocument
        this.nodeType = nodeType
      }

      get nextSibling() {
        if (!this.parentNode) {
          return null
        }
        const index = this.parentNode.childNodes.indexOf(this)
        return index >= 0 ? (this.parentNode.childNodes[index + 1] ?? null) : null
      }

      get previousSibling() {
        if (!this.parentNode) {
          return null
        }
        const index = this.parentNode.childNodes.indexOf(this)
        return index > 0 ? (this.parentNode.childNodes[index - 1] ?? null) : null
      }

      get textContent() {
        return ''
      }

      set textContent(_value: string) {}

      remove() {
        this.parentNode?.removeChild(this)
      }
    }

    class FakeTextNode extends FakeNode {
      data: string

      constructor(ownerDocument: FakeDocument, value: string) {
        super(ownerDocument, FakeNode.TEXT_NODE)
        this.data = value
      }

      get textContent() {
        return this.data
      }

      set textContent(value: string) {
        this.data = value
      }
    }

    class FakeComment extends FakeNode {
      data: string

      constructor(ownerDocument: FakeDocument, value: string) {
        super(ownerDocument, FakeNode.COMMENT_NODE)
        this.data = value
      }

      get textContent() {
        return this.data
      }
    }

    class FakeElement extends FakeNode {
      namespaceURI = 'http://www.w3.org/1999/xhtml'
      tagName: string

      constructor(ownerDocument: FakeDocument, tagName = 'DIV') {
        super(ownerDocument, FakeNode.ELEMENT_NODE)
        this.tagName = tagName
      }

      appendChild(node: FakeNode) {
        return this.insertBefore(node, null)
      }

      createChildTextContent() {
        return this.childNodes.map((child) => child.textContent ?? '').join('')
      }

      get textContent() {
        return this.createChildTextContent()
      }

      getAttribute(_name: string) {
        return null
      }

      getAttributeNames() {
        return [] as string[]
      }

      insertBefore(node: FakeNode, referenceNode: FakeNode | null) {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
        const referenceIndex = referenceNode == null ? -1 : this.childNodes.indexOf(referenceNode)
        if (referenceIndex < 0) {
          this.childNodes.push(node)
        } else {
          this.childNodes.splice(referenceIndex, 0, node)
        }
        node.parentNode = this
        return node
      }

      get lastChild() {
        return this.childNodes.at(-1) ?? null
      }

      get firstChild() {
        return this.childNodes[0] ?? null
      }

      querySelectorAll() {
        return [] as FakeElement[]
      }

      removeAttribute(_name: string) {}

      removeChild(node: FakeNode) {
        const index = this.childNodes.indexOf(node)
        if (index >= 0) {
          this.childNodes.splice(index, 1)
          node.parentNode = null
        }
        return node
      }

      setAttribute(_name: string, _value: string) {}
    }

    class FakeDocument {
      body = new FakeElement(this, 'BODY')

      createComment(value: string) {
        return new FakeComment(this, value)
      }

      createElement(tagName: string) {
        return new FakeElement(this, tagName.toUpperCase())
      }

      createTextNode(value: string) {
        return new FakeTextNode(this, value)
      }
    }

    const doc = new FakeDocument()
    const previousNode = Reflect.get(globalThis, 'Node')
    const previousElement = Reflect.get(globalThis, 'Element')
    const previousText = Reflect.get(globalThis, 'Text')
    const previousComment = Reflect.get(globalThis, 'Comment')
    Object.defineProperty(globalThis, 'Node', {
      configurable: true,
      value: FakeNode,
    })
    Object.defineProperty(globalThis, 'Element', {
      configurable: true,
      value: FakeElement,
    })
    Object.defineProperty(globalThis, 'Text', {
      configurable: true,
      value: FakeTextNode,
    })
    Object.defineProperty(globalThis, 'Comment', {
      configurable: true,
      value: FakeComment,
    })

    try {
      fn(doc)
    } finally {
      for (const [name, value] of [
        ['Node', previousNode],
        ['Element', previousElement],
        ['Text', previousText],
        ['Comment', previousComment],
      ] as const) {
        if (value === undefined) {
          Reflect.deleteProperty(globalThis, name)
        } else {
          Object.defineProperty(globalThis, name, {
            configurable: true,
            value,
          })
        }
      }
    }
  }

  it('writes primitive values directly onto the element text content', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      parent.appendChild(doc.createElement('span'))

      withRuntimeContainer(container, () => {
        insertElementStatic('hello', parent as unknown as Element)
      })

      expect(parent.textContent).toBe('hello')
      expect(parent.childNodes).toHaveLength(1)
      expect(parent.firstChild).toBeInstanceOf(Text)
    })
  })

  it('uses the compiler text insert helper for primitive element children', () => {
    const parent = {
      textContent: 'stale',
    } as unknown as Element

    insertElementTextStatic(42, parent)

    expect(parent.textContent).toBe('42')
  })

  it('replaces existing children with rendered nodes for non-primitive values', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      parent.appendChild(doc.createTextNode('stale'))
      const child = doc.createElement('strong')
      child.appendChild(doc.createTextNode('next'))

      withRuntimeContainer(container, () => {
        insertElementStatic(child as unknown as Node, parent as unknown as Element)
      })

      expect(parent.childNodes).toHaveLength(1)
      expect(parent.firstChild).toBe(child)
      expect(parent.textContent).toBe('next')
    })
  })

  it('updates tracked text nodes in place for primitive values', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const marker = doc.createComment('text-slot')
      parent.appendChild(marker)
      const value = createDetachedRuntimeSignal(container, 's0', 'alpha')

      withRuntimeContainer(container, () => {
        text(() => value.value, parent as unknown as Node, marker as unknown as Node)
      })

      const initialTextNode = parent.firstChild
      expect(initialTextNode).toBeInstanceOf(Text)
      expect(initialTextNode?.textContent).toBe('alpha')

      value.value = 'beta'

      expect(parent.firstChild).toBe(initialTextNode)
      expect(initialTextNode?.textContent).toBe('beta')
      expect(parent.lastChild).toBe(marker)
    })
  })

  it('updates tracked text nodes in place without marker anchors', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const value = createDetachedRuntimeSignal(container, 's0', 'alpha')

      withRuntimeContainer(container, () => {
        text(() => value.value, parent as unknown as Node)
      })

      const initialTextNode = parent.firstChild
      expect(initialTextNode).toBeInstanceOf(Text)
      expect(initialTextNode?.textContent).toBe('alpha')

      value.value = 'beta'

      expect(parent.firstChild).toBe(initialTextNode)
      expect(parent.firstChild?.textContent).toBe('beta')
      expect(parent.childNodes).toHaveLength(1)
    })
  })

  it('updates projected fixed-signal text nodes in place', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const row = createDetachedRuntimeSignal(container, 's0', {
        id: 1,
        label: 'alpha',
      })

      withRuntimeContainer(container, () => {
        textSignal(row, (value) => value.label, parent as unknown as Node)
      })

      const initialTextNode = parent.firstChild
      expect(initialTextNode).toBeInstanceOf(Text)
      expect(initialTextNode?.textContent).toBe('alpha')

      row.value = {
        id: 1,
        label: 'beta',
      }

      expect(parent.firstChild).toBe(initialTextNode)
      expect(parent.firstChild?.textContent).toBe('beta')
      expect(parent.childNodes).toHaveLength(1)
    })
  })

  it('promotes projected fixed-signal text bindings only when values stop being primitive', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const mode = createDetachedRuntimeSignal(container, 's0', 'text')

      withRuntimeContainer(container, () => {
        textSignal(
          mode,
          (value) => {
            if (value === 'text') {
              return 'alpha'
            }
            const span = doc.createElement('span')
            span.appendChild(doc.createTextNode('beta'))
            return span
          },
          parent as unknown as Node,
        )
      })

      const initialTextNode = parent.firstChild
      expect(initialTextNode).toBeInstanceOf(Text)
      expect(initialTextNode?.textContent).toBe('alpha')

      mode.value = 'text'

      expect(parent.firstChild).toBe(initialTextNode)
      expect(parent.firstChild?.textContent).toBe('alpha')
      expect(parent.childNodes).toHaveLength(1)

      mode.value = 'node'

      expect(parent.textContent).toBe('beta')
      expect(parent.childNodes).toHaveLength(1)
      expect(parent.firstChild).not.toBeInstanceOf(Text)
    })
  })

  it('updates fixed-signal text nodes through the direct text-node helper', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const textNode = doc.createTextNode('alpha')
      const tail = doc.createElement('span')
      tail.appendChild(doc.createTextNode('tail'))
      parent.appendChild(textNode)
      parent.appendChild(tail)
      const row = createDetachedRuntimeSignal<{ id: number; label: string | null }>(
        container,
        's0',
        {
          id: 1,
          label: 'alpha',
        },
      )

      withRuntimeContainer(container, () => {
        textNodeSignal(row, (value) => value.label, textNode)
      })

      expect(parent.firstChild).toBe(textNode)
      expect(textNode.textContent).toBe('alpha')

      row.value = {
        id: 1,
        label: null,
      }

      expect(parent.childNodes).toHaveLength(2)
      expect(parent.firstChild).toBeInstanceOf(Comment)
      expect((parent.firstChild as Comment).data).toBe('eclipsa-empty')
      expect(parent.lastChild).toBe(tail)

      row.value = {
        id: 1,
        label: 'beta',
      }

      const restoredTextNode = parent.firstChild
      expect(restoredTextNode).toBeInstanceOf(Text)
      expect(restoredTextNode?.textContent).toBe('beta')
      expect(parent.childNodes).toHaveLength(2)
      expect(parent.lastChild).toBe(tail)

      row.value = {
        id: 1,
        label: 'gamma',
      }

      expect(parent.firstChild).toBe(restoredTextNode)
      expect(parent.firstChild?.textContent).toBe('gamma')
    })
  })

  it('keeps direct text-node bindings on the primitive text/empty fast path', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const textNode = doc.createTextNode('alpha')
      const tail = doc.createElement('span')
      tail.appendChild(doc.createTextNode('tail'))
      parent.appendChild(textNode)
      parent.appendChild(tail)
      const value = createDetachedRuntimeSignal<string | null>(container, 's0', 'alpha')

      withRuntimeContainer(container, () => {
        textNodeSignalValue(value, textNode)
      })

      value.value = null

      expect(parent.childNodes).toHaveLength(2)
      expect(parent.firstChild).toBeInstanceOf(Comment)
      expect((parent.firstChild as Comment).data).toBe('eclipsa-empty')
      expect(parent.lastChild).toBe(tail)

      value.value = 'beta'

      const restoredTextNode = parent.firstChild
      expect(restoredTextNode).toBeInstanceOf(Text)
      expect(restoredTextNode?.textContent).toBe('beta')
      expect(parent.childNodes).toHaveLength(2)
      expect(parent.lastChild).toBe(tail)

      value.value = 'gamma'

      expect(parent.firstChild).toBe(restoredTextNode)
      expect(parent.firstChild?.textContent).toBe('gamma')
    })
  })

  it('keeps member-based direct text-node bindings on the primitive text/empty fast path', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const textNode = doc.createTextNode('alpha')
      const tail = doc.createElement('span')
      tail.appendChild(doc.createTextNode('tail'))
      parent.appendChild(textNode)
      parent.appendChild(tail)
      const row = createDetachedRuntimeSignal<{ label: string | null }>(container, 's0', {
        label: 'alpha',
      })

      withRuntimeContainer(container, () => {
        textNodeSignalMember(row, 'label', textNode)
      })

      row.value = { label: null }

      expect(parent.childNodes).toHaveLength(2)
      expect(parent.firstChild).toBeInstanceOf(Comment)
      expect((parent.firstChild as Comment).data).toBe('eclipsa-empty')
      expect(parent.lastChild).toBe(tail)

      row.value = { label: 'beta' }

      const restoredTextNode = parent.firstChild
      expect(restoredTextNode).toBeInstanceOf(Text)
      expect(restoredTextNode?.textContent).toBe('beta')
      expect(parent.childNodes).toHaveLength(2)
      expect(parent.lastChild).toBe(tail)

      row.value = { label: 'gamma' }

      expect(parent.firstChild).toBe(restoredTextNode)
      expect(parent.firstChild?.textContent).toBe('gamma')
    })
  })

  it('uses the compiler member text helper while values stay primitive', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const textNode = doc.createTextNode(' ')
      parent.appendChild(textNode)
      const row = createDetachedRuntimeSignal(container, 's0', {
        label: 'alpha',
      })

      withRuntimeContainer(container, () => {
        textNodeSignalMemberStatic(row, 'label', textNode)
      })

      expect(parent.firstChild).toBe(textNode)
      expect(textNode.data).toBe('alpha')

      row.value = { label: 'beta' }

      expect(parent.firstChild).toBe(textNode)
      expect(textNode.data).toBe('beta')
    })
  })

  it('falls back to the element text binding path when the direct helper targets an element', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const row = createDetachedRuntimeSignal(container, 's0', {
        id: 1,
        label: 'alpha',
      })

      withRuntimeContainer(container, () => {
        textNodeSignal(row, (value) => value.label, parent as unknown as Node)
      })

      expect(parent.textContent).toBe('alpha')

      row.value = {
        id: 1,
        label: 'beta',
      }

      expect(parent.textContent).toBe('beta')
      expect(parent.childNodes).toHaveLength(1)
      expect(parent.firstChild).toBeInstanceOf(Text)
    })
  })

  it('promotes element-target text bindings to generic inserts when values stop being primitive', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const mode = createDetachedRuntimeSignal(container, 's0', 'text')

      withRuntimeContainer(container, () => {
        textNodeSignal(
          mode,
          (value) => {
            if (value === 'text') {
              return 'alpha'
            }
            const span = doc.createElement('span')
            span.appendChild(doc.createTextNode('beta'))
            return span
          },
          parent as unknown as Node,
        )
      })

      expect(parent.textContent).toBe('alpha')
      expect(parent.firstChild).toBeInstanceOf(Text)

      mode.value = 'node'

      expect(parent.textContent).toBe('beta')
      expect(parent.childNodes).toHaveLength(1)
      expect(parent.firstChild).not.toBeInstanceOf(Text)
    })
  })

  it('keeps fixed signal bindings and generic effects in sync on the same signal', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const elem = doc.createElement('div')
      const row = createDetachedRuntimeSignal(container, 's0', {
        id: 1,
        label: 'alpha',
      })
      const seen: string[] = []

      withRuntimeContainer(container, () => {
        textSignal(row, (value) => value.label, parent as unknown as Node)
        classSignal(elem as unknown as Element, row, (value) => (value.id === 1 ? 'selected' : ''))
        effect(() => {
          seen.push(row.value.label)
        })
      })

      expect(parent.textContent).toBe('alpha')
      expect(elem.className).toBe('selected')
      expect(seen).toEqual(['alpha'])

      row.value = {
        id: 2,
        label: 'beta',
      }

      expect(parent.textContent).toBe('beta')
      expect(elem.getAttribute('class')).toBeNull()
      expect(seen).toEqual(['alpha', 'beta'])
    })
  })

  it('keeps many fixed signal bindings on the same signal in sync', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const selected = createDetachedRuntimeSignal(container, 's0', 0)
      const cells = Array.from({ length: 128 }, () => doc.createElement('div'))

      withRuntimeContainer(container, () => {
        for (const [index, cell] of cells.entries()) {
          classSignalEquals(cell as unknown as Element, selected, index, 'selected', '')
        }
      })

      expect(cells[0]?.className).toBe('selected')
      expect(cells[1]?.getAttribute('class')).toBeNull()

      selected.value = 127

      expect(cells[0]?.getAttribute('class')).toBeNull()
      expect(cells[127]?.className).toBe('selected')
    })
  })

  it('falls back to generic inserts when tracked text receives non-primitive values', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const marker = doc.createComment('text-slot')
      parent.appendChild(marker)
      const value = createDetachedRuntimeSignal<unknown>(container, 's0', 'alpha')

      withRuntimeContainer(container, () => {
        text(() => value.value, parent as unknown as Node, marker as unknown as Node)
      })

      value.value = ['node']

      expect(parent.firstChild).toBeInstanceOf(Text)
      expect(parent.textContent).toBe('nodetext-slot')

      value.value = 'omega'

      expect(parent.firstChild).toBeInstanceOf(Text)
      expect(parent.firstChild?.textContent).toBe('omega')
      expect(parent.lastChild).toBe(marker)
    })
  })

  it('falls back to generic inserts without marker anchors when tracked text receives non-primitive values', () => {
    withFakeTextDom((doc) => {
      const container = createDetachedRuntimeContainer()
      container.doc = doc as unknown as Document
      const parent = doc.createElement('div')
      const value = createDetachedRuntimeSignal<unknown>(container, 's0', 'alpha')

      withRuntimeContainer(container, () => {
        text(() => value.value, parent as unknown as Node)
      })

      value.value = ['node']

      expect(parent.firstChild).toBeInstanceOf(Text)
      expect(parent.textContent).toBe('node')

      value.value = 'omega'

      expect(parent.firstChild).toBeInstanceOf(Text)
      expect(parent.firstChild?.textContent).toBe('omega')
      expect(parent.childNodes).toHaveLength(1)
    })
  })
})
