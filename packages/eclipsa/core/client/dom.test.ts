import { describe, expect, it, vi } from 'vitest'
import {
  attr,
  attrStatic,
  className,
  createComponent,
  eventStatic,
  hydrate,
  insertElementStatic,
  listenerStatic,
  text,
} from './dom.ts'
import { ACTION_CSRF_COOKIE, ACTION_CSRF_FIELD, ACTION_CSRF_INPUT_ATTR } from '../action-csrf.ts'
import { __eclipsaComponent } from '../internal.ts'
import { ACTION_FORM_ATTR } from '../runtime/constants.ts'
import {
  createDetachedRuntimeContainer,
  createDetachedRuntimeSignal,
  type RuntimeContainer,
  withRuntimeContainer,
} from '../runtime.ts'
import { useSignal } from '../signal.ts'
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

    className(elem as unknown as Element, () => (flag.value ? 'selected' : ''))

    expect(currentClassName).toBe('')
    expect(setCount).toBe(0)

    flag.value = true

    expect(currentClassName).toBe('selected')
    expect(setCount).toBe(1)

    flag.value = false

    expect(currentClassName).toBe('')
    expect(removeCount).toBe(1)
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
      expect(doc.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), true)
      expect(doc.addEventListener).toHaveBeenCalledWith('input', expect.any(Function), true)
      expect(doc.defaultView.addEventListener).toHaveBeenCalledWith(
        'popstate',
        expect.any(Function),
      )
    } finally {
      ;(globalThis as Record<string, unknown>).Comment = previousComment
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
