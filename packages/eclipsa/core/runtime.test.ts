import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import type { JSX } from '../jsx/types.ts'
import { attr, insert } from './client/dom.ts'
import { __eclipsaComponent, __eclipsaWatch } from './internal.ts'
import { Link, useLocation } from './router.tsx'
import { onCleanup, onMount, useComputed$, useSignal, useWatch } from './signal.ts'
import {
  createDelegatedEvent,
  createDetachedRuntimeSignal,
  dispatchDocumentEvent,
  flushDirtyComponents,
  renderClientInsertable,
  restoreResumedLocalSignalEffects,
  syncBoundElementSignal,
  tryPatchBoundaryContentsInPlace,
  type RuntimeContainer,
  withRuntimeContainer,
} from './runtime.ts'

class FakeNode {
  static COMMENT_NODE = 8
  static ELEMENT_NODE = 1
  static TEXT_NODE = 3
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
    return index >= 0 ? this.parentNode.childNodes[index + 1] ?? null : null
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null
  }

  get lastChild(): FakeNode | null {
    return this.childNodes.length > 0 ? this.childNodes[this.childNodes.length - 1]! : null
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent ?? '').join('')
  }

  set textContent(value: string) {
    this.childNodes = [new FakeText(value)]
    this.childNodes[0]!.parentNode = this
  }
}

class FakeText extends FakeNode {
  constructor(readonly data: string) {
    super()
    this.nodeType = 3
  }

  override get textContent() {
    return this.data
  }

  override set textContent(value: string) {
    ;(this as { data: string }).data = value
  }
}

class FakeComment extends FakeNode {
  constructor(readonly data: string) {
    super()
    this.nodeType = 8
  }

  override get textContent() {
    return this.data
  }

  override set textContent(value: string) {
    ;(this as { data: string }).data = value
  }
}

class FakeElement extends FakeNode {
  attributes = new Map<string, string>()
  childNodes: FakeNode[] = []
  namespaceURI = 'http://www.w3.org/1999/xhtml'
  checked = false
  #eventListeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  #className = ''
  selectionDirection: 'backward' | 'forward' | 'none' | null = null
  selectionEnd: number | null = null
  selectionStart: number | null = null
  type = 'text'
  value = ''

  constructor(readonly tagName: string) {
    super()
    this.nodeType = 1
  }

  get className() {
    return this.#className
  }

  set className(value: string) {
    this.#className = value
    if (value.length === 0) {
      this.attributes.delete('class')
      return
    }
    this.attributes.set('class', value)
  }

  #detachFromCurrentParent(node: FakeNode) {
    if (!node.parentNode) {
      return
    }
    const index = node.parentNode.childNodes.indexOf(node)
    if (index >= 0) {
      node.parentNode.childNodes.splice(index, 1)
    }
    node.parentNode = null
  }

  appendChild(node: FakeNode) {
    this.#detachFromCurrentParent(node)
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }

  insertBefore(node: FakeNode, referenceNode: FakeNode | null) {
    this.#detachFromCurrentParent(node)
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

  replaceChild(node: FakeNode, child: FakeNode) {
    this.#detachFromCurrentParent(node)
    const index = this.childNodes.indexOf(child)
    if (index < 0) {
      this.childNodes.push(node)
      node.ownerDocument = this.ownerDocument
      node.parentNode = this
      return child
    }
    this.childNodes[index] = node
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    child.parentNode = null
    return child
  }

  setAttribute(name: string, value: string) {
    if (name === 'class') {
      this.className = value
      return
    }
    this.attributes.set(name, value)
  }

  removeAttribute(name: string) {
    if (name === 'class') {
      this.className = ''
      return
    }
    this.attributes.delete(name)
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name: string) {
    return this.attributes.has(name)
  }

  getAttributeNames() {
    return [...this.attributes.keys()]
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    let listeners = this.#eventListeners.get(type)
    if (!listeners) {
      listeners = new Set()
      this.#eventListeners.set(type, listeners)
    }
    listeners.add(listener)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.#eventListeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: Event) {
    for (const listener of this.#eventListeners.get(event.type) ?? []) {
      if (typeof listener === 'function') {
        listener.call(this, event)
        continue
      }
      listener.handleEvent(event)
    }
    return !event.defaultPrevented
  }

  get valueAsNumber() {
    if (this.value.trim() === '') {
      return Number.NaN
    }
    const parsed = Number(this.value)
    return Number.isNaN(parsed) ? Number.NaN : parsed
  }

  override get textContent() {
    return this.childNodes.map((child) => child.textContent ?? '').join('')
  }

  get children() {
    const children = this.childNodes.filter((child) => child instanceof FakeElement) as FakeElement[]
    return {
      item(index: number) {
        return children[index] ?? null
      },
    }
  }

  get isConnected() {
    let cursor: FakeNode | null = this
    while (cursor) {
      if (cursor === (this.ownerDocument?.body as unknown as FakeNode | undefined)) {
        return true
      }
      cursor = cursor.parentNode
    }
    return false
  }

  get parentElement(): FakeElement | null {
    return this.parentNode instanceof FakeElement ? this.parentNode : null
  }

  contains(node: FakeNode | null) {
    let cursor = node
    while (cursor) {
      if (cursor === this) {
        return true
      }
      cursor = cursor.parentNode
    }
    return false
  }

  focus() {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this as unknown as Element
    }
  }

  setSelectionRange(start: number, end: number, direction?: 'backward' | 'forward' | 'none') {
    this.selectionStart = start
    this.selectionEnd = end
    this.selectionDirection = direction ?? 'none'
  }
}

class FakeDocument {
  activeElement: Element | null = null
  body: HTMLElement
  defaultView = {
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame(callback: FrameRequestCallback) {
      callback(0)
      return 0
    },
    setTimeout(callback: () => void) {
      callback()
      return 0
    },
  }

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

  createTreeWalker(root: FakeNode) {
    const comments: FakeComment[] = []
    const visit = (node: FakeNode) => {
      if (node instanceof FakeComment) {
        comments.push(node)
      }
      for (const child of node.childNodes) {
        visit(child)
      }
    }
    visit(root)

    let index = -1
    return {
      currentNode: null as Node | null,
      nextNode() {
        index++
        const next = comments[index] ?? null
        this.currentNode = next as unknown as Node | null
        return next
      },
    }
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
    doc: new FakeDocument() as unknown as Document,
    imports: new Map(),
    loaderStates: new Map(),
    loaders: new Map(),
    id: 'rt-test',
    nextAtomId: 0,
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
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

const withFakeNodeGlobal = <T>(fn: () => T) => {
  const OriginalComment = globalThis.Comment
  const OriginalElement = globalThis.Element
  const OriginalHTMLElement = globalThis.HTMLElement
  const OriginalHTMLInputElement = globalThis.HTMLInputElement
  const OriginalHTMLSelectElement = globalThis.HTMLSelectElement
  const OriginalHTMLTextAreaElement = globalThis.HTMLTextAreaElement
  const OriginalNode = globalThis.Node
  const OriginalNodeFilter = globalThis.NodeFilter
  const OriginalText = globalThis.Text
  globalThis.Comment = FakeComment as unknown as typeof Comment
  globalThis.Element = FakeElement as unknown as typeof Element
  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement
  globalThis.HTMLInputElement = FakeElement as unknown as typeof HTMLInputElement
  globalThis.HTMLSelectElement = FakeElement as unknown as typeof HTMLSelectElement
  globalThis.HTMLTextAreaElement = FakeElement as unknown as typeof HTMLTextAreaElement
  globalThis.Node = FakeNode as unknown as typeof Node
  globalThis.NodeFilter = {
    SHOW_COMMENT: 128,
  } as typeof NodeFilter
  globalThis.Text = FakeText as unknown as typeof Text
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(() => {
        globalThis.Comment = OriginalComment
        globalThis.Element = OriginalElement
        globalThis.HTMLElement = OriginalHTMLElement
        globalThis.HTMLInputElement = OriginalHTMLInputElement
        globalThis.HTMLSelectElement = OriginalHTMLSelectElement
        globalThis.HTMLTextAreaElement = OriginalHTMLTextAreaElement
        globalThis.Node = OriginalNode
        globalThis.NodeFilter = OriginalNodeFilter
        globalThis.Text = OriginalText
      }) as T
    }
    globalThis.Comment = OriginalComment
    globalThis.Element = OriginalElement
    globalThis.HTMLElement = OriginalHTMLElement
    globalThis.HTMLInputElement = OriginalHTMLInputElement
    globalThis.HTMLSelectElement = OriginalHTMLSelectElement
    globalThis.HTMLTextAreaElement = OriginalHTMLTextAreaElement
    globalThis.Node = OriginalNode
    globalThis.NodeFilter = OriginalNodeFilter
    globalThis.Text = OriginalText
    return result
  } catch (error) {
    globalThis.Comment = OriginalComment
    globalThis.Element = OriginalElement
    globalThis.HTMLElement = OriginalHTMLElement
    globalThis.HTMLInputElement = OriginalHTMLInputElement
    globalThis.HTMLSelectElement = OriginalHTMLSelectElement
    globalThis.HTMLTextAreaElement = OriginalHTMLTextAreaElement
    globalThis.Node = OriginalNode
    globalThis.NodeFilter = OriginalNodeFilter
    globalThis.Text = OriginalText
    throw error
  }
}

const collectComments = (nodes: FakeNode[]): string[] => {
  const result: string[] = []
  const visit = (node: FakeNode) => {
    if (node instanceof FakeComment) {
      result.push(node.data)
    }
    for (const child of node.childNodes) {
      visit(child)
    }
  }
  for (const node of nodes) {
    visit(node)
  }
  return result
}

const flushAsync = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('createDelegatedEvent', () => {
  it('preserves native getters and methods when currentTarget is overridden', () => {
    class NativeLikeEvent extends Event {
      constructor(private readonly eventTarget: EventTarget | null) {
        super('click')
      }

      override get target() {
        if (!(this instanceof NativeLikeEvent)) {
          throw new TypeError('Illegal invocation')
        }
        return this.eventTarget
      }
    }

    const target = {} as EventTarget
    const currentTarget = new FakeElement('div') as unknown as Element
    const delegated = createDelegatedEvent(new NativeLikeEvent(target), currentTarget)

    expect(delegated.target).toBe(target)
    expect(delegated.currentTarget).toBe(currentTarget)
    expect(() => delegated.preventDefault()).not.toThrow()
  })
})

describe('renderClientInsertable', () => {
  it('keeps nodes returned from function arrays during client rerenders', () => {
    withFakeNodeGlobal(() => {
      const node = new FakeNode() as unknown as Node
      expect(renderClientInsertable(() => [node], createContainer())).toEqual([node])
    })
  })

  it('assigns signal refs to rendered elements', () => {
    withFakeNodeGlobal(() => {
      let ref!: { value: HTMLElement | undefined }

      const App = __eclipsaComponent(
        () => {
          ref = useSignal<HTMLElement | undefined>()
          return jsxDEV('div', { ref }, null, false, {})
        },
        'component-ref',
        () => [],
      )

      const container = createContainer()
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      const element = nodes.find((node) => node instanceof FakeElement) as FakeElement | undefined

      expect(element).toBeInstanceOf(FakeElement)
      expect(ref.value).toBe(element as unknown as HTMLElement)
      expect(element?.tagName).toBe('div')
    })
  })

  it('serializes and syncs bound input signals', () => {
    withFakeNodeGlobal(() => {
      const container = createContainer()
      const value = createDetachedRuntimeSignal(container, 's0', 'alpha')
      const checked = createDetachedRuntimeSignal(container, 's1', false)

      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          jsxDEV(
            'div',
            {
              children: [
                jsxDEV('input', { 'bind:value': value }, null, false, {}),
                jsxDEV('input', { 'bind:checked': checked, type: 'checkbox' }, null, false, {}),
              ],
            },
            null,
            false,
            {},
          ),
          container,
        ),
      )
      const root = nodes[0] as unknown as FakeElement | undefined
      const textInput = root?.childNodes[0] as unknown as FakeElement | undefined
      const checkbox = root?.childNodes[1] as unknown as FakeElement | undefined

      expect(textInput?.getAttribute('data-e-bind-value')).toBe('s0')
      expect(textInput?.value).toBe('alpha')
      expect(checkbox?.getAttribute('data-e-bind-checked')).toBe('s1')
      expect(checkbox?.checked).toBe(false)

      if (!textInput || !checkbox) {
        throw new Error('Expected rendered inputs.')
      }

      textInput.value = 'beta'
      checkbox.checked = true

      expect(syncBoundElementSignal(container, textInput as unknown as EventTarget)).toBe(true)
      expect(syncBoundElementSignal(container, checkbox as unknown as EventTarget)).toBe(true)
      expect(value.value).toBe('beta')
      expect(checked.value).toBe(true)
    })
  })

  it('keeps direct client DOM bindings live without manual native input workarounds', () => {
    withFakeNodeGlobal(() => {
      const value = createDetachedRuntimeSignal(createContainer(), 's0', 'alpha')
      const input = new FakeElement('input') as unknown as Element

      attr(input, 'bind:value', () => value)

      expect((input as unknown as FakeElement).value).toBe('alpha')

      ;(input as unknown as FakeElement).value = 'beta'
      ;(input as unknown as FakeElement).dispatchEvent(new Event('input'))
      expect(value.value).toBe('beta')

      value.value = 'gamma'
      expect((input as unknown as FakeElement).value).toBe('gamma')
    })
  })

  it('restores focus for bound inputs that rerender without an onInput handler', async () => {
    await withFakeNodeGlobal(async () => {
      let inputRef!: { value: HTMLInputElement | undefined }

      const AppBody = () => {
        const query = useSignal('')
        inputRef = useSignal<HTMLInputElement | undefined>()
        return jsxDEV('input', { 'bind:value': query, ref: inputRef, type: 'text' }, null, false, {})
      }

      const App = __eclipsaComponent(
        () => AppBody(),
        'component-bind-focus',
        () => [],
      )

      class TargetedInputEvent extends Event {
        constructor(private readonly inputTarget: EventTarget | null) {
          super('input')
        }

        override get target() {
          return this.inputTarget
        }
      }

      const container = createContainer()
      container.imports.set(
        'component-bind-focus',
        Promise.resolve({
          default: () => AppBody(),
        }),
      )
      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      for (const node of nodes as unknown as FakeNode[]) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }
      const initialInput = nodes.find((node) => node instanceof FakeElement) as FakeElement | undefined
      if (!initialInput) {
        throw new Error('Expected rendered input.')
      }
      initialInput.focus()
      initialInput.value = 'a'
      initialInput.selectionStart = 1
      initialInput.selectionEnd = 1

      await dispatchDocumentEvent(container, new TargetedInputEvent(initialInput as unknown as EventTarget))
      await flushAsync()

      expect(inputRef.value).toBeDefined()
      expect(doc.activeElement).toBe(initialInput as unknown as Element)
      expect(initialInput.value).toBe('a')
      expect(initialInput.selectionStart).toBe(1)
      expect(initialInput.selectionEnd).toBe(1)
    })
  })

  it('resets local signal ids and watch state when a component slot changes symbol', () => {
    withFakeNodeGlobal(() => {
      const First = __eclipsaComponent(
        () => {
          const value = useSignal('first')
          useWatch(
            __eclipsaWatch(
              'watch-first',
              () => {
                value.value
              },
              () => [value],
            ),
          )
          return value.value
        },
        'component-first',
        () => [],
      )

      const Second = __eclipsaComponent(
        () => {
          const count = useSignal(0)
          return count.value
        },
        'component-second',
        () => [],
      )

      const container = createContainer()

      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(First, {}, null, false, {}), container)
      })

      expect(container.components.get('c0')?.signalIds).toEqual(['s0'])
      expect(container.watches.has('c0:w0')).toBe(true)
      expect(container.signals.get('s0')?.value).toBe('first')

      container.rootChildCursor = 0

      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(Second, {}, null, false, {}), container)
      })

      expect(container.components.get('c0')?.symbol).toBe('component-second')
      expect(container.components.get('c0')?.signalIds).toEqual(['s1'])
      expect(container.components.get('c0')?.watchCount).toBe(0)
      expect(container.watches.has('c0:w0')).toBe(false)
      expect(container.signals.get('s1')?.value).toBe(0)
    })
  })

  it('runs onMount cleanup when a component slot changes symbol', async () => {
    await withFakeNodeGlobal(async () => {
      const events: string[] = []
      const First = __eclipsaComponent(
        () => {
          onMount(() => {
            events.push('mount')
            onCleanup(() => {
              events.push('cleanup')
            })
          })
          return 'first'
        },
        'component-mount-first',
        () => [],
      )

      const Second = __eclipsaComponent(
        () => 'second',
        'component-mount-second',
        () => [],
      )

      const container = createContainer()

      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(First, {}, null, false, {}), container)
      })

      await flushAsync()
      expect(events).toEqual(['mount'])

      container.rootChildCursor = 0
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(Second, {}, null, false, {}), container)
      })

      expect(events).toEqual(['mount', 'cleanup'])
    })
  })

  it('keeps signal subscriptions after resumable signal rerenders', async () => {
    await withFakeNodeGlobal(async () => {
      let count!: { value: number }

      const CounterBody = () => {
        count = useSignal(0)
        return jsxDEV('button', { children: `Count ${count.value}` }, null, false, {})
      }

      const Counter = __eclipsaComponent(
        CounterBody,
        'component-counter',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'component-counter',
        Promise.resolve({
          default: () => CounterBody(),
        }),
      )
      const parent = new FakeElement('div')
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(Counter, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        parent.appendChild(node)
      }

      const getButton = () =>
        parent.childNodes.find((node) => node instanceof FakeElement) as
        | FakeElement
        | undefined

      const initialButton = getButton()

      expect(initialButton?.textContent).toBe('Count 0')
      expect(container.signals.get('s0')?.subscribers.has('c0')).toBe(true)

      count.value = 1
      await flushDirtyComponents(container)
      expect(getButton()).toBe(initialButton)
      expect(getButton()?.textContent).toBe('Count 1')
      expect(container.signals.get('s0')?.subscribers.has('c0')).toBe(true)

      count.value = 2
      await flushDirtyComponents(container)
      expect(getButton()).toBe(initialButton)
      expect(getButton()?.textContent).toBe('Count 2')
      expect(container.signals.get('s0')?.subscribers.has('c0')).toBe(true)
    })
  })

  it('wraps generated __scope reference failures with an explicit resumable runtime error', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const parent = new FakeElement('div')
      const start = container.doc!.createComment('ec:c:c0:start') as unknown as FakeNode
      const end = container.doc!.createComment('ec:c:c0:end') as unknown as FakeNode

      parent.appendChild(start)
      parent.appendChild(end)

      container.scopes.set('sc0', [])
      container.components.set('c0', {
        active: false,
        didMount: false,
        end: end as unknown as Comment,
        id: 'c0',
        mountCleanupSlots: [],
        parentId: '$root',
        projectionSlots: null,
        props: {},
        rawProps: null,
        scopeId: 'sc0',
        signalIds: [],
        start: start as unknown as Comment,
        symbol: 'broken-symbol',
        suspensePromise: null,
        visibleCount: 0,
        watchCount: 0,
      })
      container.imports.set(
        'broken-symbol',
        Promise.resolve({
          default: () => {
            throw new ReferenceError('__scope is not defined')
          },
        }),
      )
      container.dirty.add('c0')

      const error = await flushDirtyComponents(container).catch((error) => error)

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).name).toBe('EclipsaRuntimeError')
      expect((error as Error).message).toMatch(
        /Eclipsa runtime failed while rerendering component "c0", symbol "broken-symbol"\./,
      )
      expect((error as Error).message).toMatch(
        /same-file helper was transformed incorrectly during symbol compilation/i,
      )
    })
  })

  it('patches projection-slot metadata components when the slot value is plain text', async () => {
    await withFakeNodeGlobal(async () => {
      let open!: { value: boolean }

      const DirBody = (props: { title?: string }) => {
        open = useSignal(true)
        return jsxDEV(
          'div',
          {
            children: [
              jsxDEV('button', { children: props.title ?? '' }, null, false, {}),
              jsxDEV(
                'div',
                {
                  style: open.value ? 'max-height: 64px; opacity: 1' : 'max-height: 0px; opacity: 0',
                },
                null,
                false,
                {},
              ),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Dir = __eclipsaComponent(DirBody, 'component-dir-plain-title', () => [], { title: 1 })

      const container = createContainer()
      container.imports.set(
        'component-dir-plain-title',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            DirBody((propsOrArg as { title?: string } | undefined) ?? {}),
        }),
      )

      const parent = new FakeElement('div')
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(Dir as any, { title: 'Materials' }, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        parent.appendChild(node)
      }

      const getPanel = () => {
        const root = parent.childNodes.find((node) => node instanceof FakeElement) as
          | FakeElement
          | undefined
        return root?.childNodes[1] as FakeElement | undefined
      }
      const initialPanel = getPanel()

      expect(initialPanel?.getAttribute('style')).toBe('max-height: 64px; opacity: 1')

      open.value = false
      await flushDirtyComponents(container)

      expect(getPanel()).toBe(initialPanel)
      expect(getPanel()?.getAttribute('style')).toBe('max-height: 0px; opacity: 0')
      expect(container.signals.get('s0')?.subscribers.has('c0')).toBe(true)
    })
  })

  it('restores local signal effects for resumed components before navigation', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const parent = new FakeElement('div')
      const start = container.doc!.createComment('ec:c:c0:start') as unknown as FakeNode
      const initialPanel = new FakeElement('div')
      const end = container.doc!.createComment('ec:c:c0:end') as unknown as FakeNode
      const originalDocument = globalThis.document

      parent.appendChild(start)
      parent.appendChild(initialPanel)
      parent.appendChild(end)

      const open = createDetachedRuntimeSignal(container, 's0', true)
      const signalRecord = container.signals.get('s0')
      if (!signalRecord) {
        throw new Error('Missing signal record')
      }

      container.components.set('c0', {
        active: false,
        didMount: false,
        end: end as unknown as Comment,
        id: 'c0',
        mountCleanupSlots: [],
        parentId: '$root',
        props: {},
        projectionSlots: null,
        rawProps: null,
        reuseExistingDomOnActivate: true,
        reuseProjectionSlotDomOnActivate: false,
        scopeId: 'sc0',
        signalIds: ['s0'],
        start: start as unknown as Comment,
        symbol: 'component-local-signal',
        suspensePromise: null,
        visibleCount: 0,
        watchCount: 0,
      })
      container.scopes.set('sc0', [])
      signalRecord.subscribers.add('c0')
      container.imports.set(
        'component-local-signal',
        Promise.resolve({
          default: () => {
            const panel = document.createElement('div')
            const visible = useSignal(true)
            attr(panel, 'style', () => ({
              opacity: visible.value ? '1' : '0',
            }))
            return panel
          },
        }),
      )

      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        expect(signalRecord.effects.size).toBe(0)

        await restoreResumedLocalSignalEffects(container)

        const livePanel = parent.childNodes[1] as FakeElement | undefined
        expect(livePanel).toBeInstanceOf(FakeElement)
        expect(livePanel).not.toBe(initialPanel)
        expect(livePanel?.getAttribute('style')).toBe('opacity: 1')
        expect(signalRecord.effects.size).toBe(1)

        open.value = false

        expect(container.dirty.size).toBe(0)
        expect(parent.childNodes[1]).toBe(livePanel)
        expect(livePanel?.getAttribute('style')).toBe('opacity: 0')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('patches inserted nodes in place so animated nodes keep identity', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)
      const open = createDetachedRuntimeSignal(container, 's0', true)
      const renderPanel = (() =>
        jsxDEV(
          'div',
          {
            children: open.value
              ? jsxDEV('span', { children: 'open' }, null, false, {})
              : jsxDEV('strong', { children: 'closed' }, null, false, {}),
            style: open.value ? 'opacity: 1; max-height: 64px' : 'opacity: 0; max-height: 0px',
          },
          null,
          false,
          {},
        )) as unknown as () => Node

      withRuntimeContainer(container, () => {
        insert(
          renderPanel,
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const panel = host.childNodes[0] as FakeElement | undefined
      expect(panel).toBeInstanceOf(FakeElement)
      expect(panel?.getAttribute('style')).toBe('opacity: 1; max-height: 64px')
      expect((panel?.childNodes[0] as FakeElement | undefined)?.tagName).toBe('span')

      ;(panel as FakeElement & { __debugMarker?: string }).__debugMarker = 'live'
      open.value = false

      const nextPanel = host.childNodes[0] as FakeElement | undefined
      expect(nextPanel).toBe(panel)
      expect((nextPanel as FakeElement & { __debugMarker?: string }).__debugMarker).toBe('live')
      expect(nextPanel?.getAttribute('style')).toBe('opacity: 0; max-height: 0px')
      expect((nextPanel?.childNodes[0] as FakeElement | undefined)?.tagName).toBe('strong')
    })
  })

  it('keeps inserted panel identity when insert rerenders managed child boundaries', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const open = createDetachedRuntimeSignal(container, 's0', true)

      const ItemBody = (props: { href: string; label: string }) =>
        jsxDEV('a', { href: props.href, children: props.label }, null, false, {})

      const Item = __eclipsaComponent(ItemBody, 'component-insert-item', () => [])

      const ParentBody = () => {
        const root = document.createElement('div')
        const marker = document.createComment('insert-marker')
        root.appendChild(marker)
        insert(
          (() =>
            jsxDEV(
              'div',
              {
                class: 'overflow-hidden',
                children: [
                  jsxDEV(Item as any, { href: '/a', label: 'A' }, null, false, {}),
                  jsxDEV(Item as any, { href: '/b', label: 'B' }, null, false, {}),
                ],
                style: open.value ? 'opacity: 1; max-height: 64px' : 'opacity: 0; max-height: 0px',
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          root,
          marker,
        )
        return root as unknown as JSX.Element
      }

      const Parent = __eclipsaComponent(ParentBody, 'component-insert-parent', () => [])

      const host = new FakeElement('div')
      const originalDocument = globalThis.document
      let nodes!: FakeNode[]
      ;(globalThis as typeof globalThis & { document: Document }).document = container.doc as Document
      try {
        nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Parent as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]
      } finally {
        globalThis.document = originalDocument
      }

      for (const node of nodes) {
        host.appendChild(node)
      }

      const outer = host.childNodes[1] as FakeElement | undefined
      const panel = outer?.childNodes[0] as FakeElement | undefined
      expect(panel).toBeInstanceOf(FakeElement)
      expect(panel?.getAttribute('style')).toBe('opacity: 1; max-height: 64px')
      expect(collectComments(panel?.childNodes ?? [])).toEqual([
        'ec:c:c0.0:start',
        'ec:c:c0.0:end',
        'ec:c:c0.1:start',
        'ec:c:c0.1:end',
      ])

      ;(panel as FakeElement & { __debugMarker?: string }).__debugMarker = 'live'
      open.value = false

      const nextOuter = host.childNodes[1] as FakeElement | undefined
      const nextPanel = nextOuter?.childNodes[0] as FakeElement | undefined
      expect(nextPanel).toBe(panel)
      expect((nextPanel as FakeElement & { __debugMarker?: string }).__debugMarker).toBe('live')
      expect(nextPanel?.getAttribute('style')).toBe('opacity: 0; max-height: 0px')
      expect(collectComments(nextPanel?.childNodes ?? [])).toEqual([
        'ec:c:c0.0:start',
        'ec:c:c0.0:end',
        'ec:c:c0.1:start',
        'ec:c:c0.1:end',
      ])
    })
  })

  it('preloads projection slot render refs before rerendering resumable children', async () => {
    await withFakeNodeGlobal(async () => {
      let open!: { value: boolean }

      const PageLinkBody = (props: { label: string }) =>
        jsxDEV('span', { children: props.label }, null, false, {})

      const PageLink = __eclipsaComponent(
        PageLinkBody,
        'component-page-link',
        () => [],
      )

      const DirBody = (props: { children?: unknown }) => {
        open = useSignal(true)
        return jsxDEV(
          'section',
          {
            children: [
              jsxDEV('button', { children: open.value ? 'open' : 'closed' }, null, false, {}),
              jsxDEV('div', { children: props.children }, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Dir = __eclipsaComponent(
        DirBody,
        'component-dir',
        () => [],
        { children: 1 },
      )

      const container = createContainer()
      container.imports.set(
        'component-dir',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            DirBody((propsOrArg as { children?: unknown } | undefined) ?? {}),
        }),
      )
      container.imports.set(
        'component-page-link',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            PageLinkBody(propsOrArg as { label: string }),
        }),
      )

      const parent = new FakeElement('div')
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          jsxDEV(
            Dir as any,
            {
              children: jsxDEV(PageLink as any, { label: 'Overview' }, null, false, {}),
            },
            null,
            false,
            {},
          ),
          container,
        ),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        parent.appendChild(node)
      }

      expect(parent.textContent).toContain('open')
      expect(parent.textContent).toContain('Overview')

      open.value = false
      await flushDirtyComponents(container)
      expect(parent.textContent).toContain('closed')
      expect(parent.textContent).toContain('Overview')

      open.value = true
      await flushDirtyComponents(container)
      expect(parent.textContent).toContain('open')
      expect(parent.textContent).toContain('Overview')
    })
  })

  it('runs watch cleanup when a resumable watch is torn down', () => {
    withFakeNodeGlobal(() => {
      let count!: { value: number }
      const events: string[] = []

      const First = __eclipsaComponent(
        () => {
          count = useSignal(0)
          useWatch(
            __eclipsaWatch(
              'watch-cleanup',
              () => {
                const snapshot = count.value
                events.push(`run:${snapshot}`)
                onCleanup(() => {
                  events.push(`cleanup:${snapshot}`)
                })
              },
              () => [count],
            ),
          )
          return count.value
        },
        'component-watch-first',
        () => [],
      )

      const Second = __eclipsaComponent(
        () => 'done',
        'component-watch-second',
        () => [],
      )

      const container = createContainer()

      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(First, {}, null, false, {}), container)
      })

      count.value = 1
      expect(events).toEqual(['run:0', 'cleanup:0', 'run:1'])

      container.rootChildCursor = 0
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(Second, {}, null, false, {}), container)
      })

      expect(events).toEqual(['run:0', 'cleanup:0', 'run:1', 'cleanup:1'])
    })
  })

  it('resolves resumed route slots from the page route cache entry during client rerenders', () => {
    withFakeNodeGlobal(() => {
      const container = createContainer()
      const page = () => jsxDEV('p', { children: 'page content' }, null, false, {})
      container.router = {
        currentPath: { value: '/' },
        currentRoute: null,
        isNavigating: { value: false },
        loadedRoutes: new Map([
          [
            '/::page',
            {
              entry: {} as any,
              layouts: [],
              page: { renderer: page },
              params: {},
              pathname: '/',
              render: () => jsxDEV(page, {}, null, false, {}),
            },
          ],
        ]),
        manifest: [],
        navigate: (async () => {}) as any,
        sequence: 0,
      } as unknown as RuntimeContainer['router']

      const [node] = renderClientInsertable(
        {
          __eclipsa_type: 'route-slot',
          pathname: '/',
          startLayoutIndex: 0,
        },
        container,
      )

      const element = node as unknown as FakeElement
      expect(element).toBeInstanceOf(FakeElement)
      expect(element.tagName).toBe('p')
      expect(element.childNodes).toHaveLength(1)
      expect(element.childNodes[0]).toBeInstanceOf(FakeText)
      expect((element.childNodes[0] as FakeText).data).toBe('page content')
    })
  })

  it('wraps projection slot insertions in stable marker comments during client renders', () => {
    withFakeNodeGlobal(() => {
      const Probe = __eclipsaComponent(
        (props: { aa?: unknown; children?: unknown }) =>
          jsxDEV(
            'section',
            {
              children: [
                jsxDEV('div', { children: props.aa }, null, false, {}),
                jsxDEV('div', { children: props.children }, null, false, {}),
                jsxDEV('div', { children: props.aa }, null, false, {}),
              ],
            },
            null,
            false,
            {},
          ),
        'probe-symbol',
        () => [],
        { aa: 2, children: 1 },
      )

      const container = createContainer()
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          jsxDEV(
            Probe as any,
            {
              aa: jsxDEV('span', { children: 'prop content' }, null, false, {}),
              children: jsxDEV('span', { children: 'children content' }, null, false, {}),
            },
            null,
            false,
            {},
          ),
          container,
        ),
      ) as unknown as FakeNode[]

      expect(collectComments(nodes)).toEqual([
        'ec:c:c0:start',
        'ec:s:c0:aa:0:start',
        'ec:s:c0:aa:0:end',
        'ec:s:c0:children:0:start',
        'ec:s:c0:children:0:end',
        'ec:s:c0:aa:1:start',
        'ec:s:c0:aa:1:end',
        'ec:c:c0:end',
      ])
    })
  })

  it('wraps route-slot children in projection slot markers during client renders', () => {
    withFakeNodeGlobal(() => {
      const Probe = __eclipsaComponent(
        (props: { children?: unknown }) =>
          jsxDEV('section', { children: props.children }, null, false, {}),
        'probe-route-slot-symbol',
        () => [],
        { children: 1 },
      )

      const container = createContainer()
      const page = () => jsxDEV('p', { children: 'page content' }, null, false, {})
      container.router = {
        currentPath: { value: '/' },
        currentRoute: null,
        isNavigating: { value: false },
        loadedRoutes: new Map([
          [
            '/::page',
            {
              entry: {} as any,
              layouts: [],
              page: { renderer: page },
              params: {},
              pathname: '/',
              render: () => jsxDEV(page, {}, null, false, {}),
            },
          ],
        ]),
        manifest: [],
        navigate: (async () => {}) as any,
        sequence: 0,
      } as unknown as RuntimeContainer['router']

      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          jsxDEV(
            Probe as any,
            {
              children: {
                __eclipsa_type: 'route-slot',
                pathname: '/',
                startLayoutIndex: 0,
              },
            },
            null,
            false,
            {},
          ),
          container,
        ),
      ) as unknown as FakeNode[]

      expect(collectComments(nodes)).toEqual([
        'ec:c:c0:start',
        'ec:s:c0:children:0:start',
        'ec:s:c0:children:0:end',
        'ec:c:c0:end',
      ])
      expect(nodes[1]?.textContent).toContain('page content')
    })
  })

  it('patches route-slot projection components on local signal writes without replacing their shell', async () => {
    await withFakeNodeGlobal(async () => {
      let open!: { value: boolean }

      const ProbeBody = (props: { children?: unknown }) => {
        open = useSignal(true)
        return jsxDEV(
          'section',
          {
            children: [
              jsxDEV('button', { children: open.value ? 'open' : 'closed' }, null, false, {}),
              jsxDEV('div', { children: props.children }, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Probe = __eclipsaComponent(
        ProbeBody,
        'probe-route-slot-patch-symbol',
        () => [],
        { children: 1 },
      )

      const container = createContainer()
      const page = () => jsxDEV('p', { children: 'page content' }, null, false, {})
      container.imports.set(
        'probe-route-slot-patch-symbol',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            ProbeBody((propsOrArg as { children?: unknown } | undefined) ?? {}),
        }),
      )
      container.router = {
        currentPath: { value: '/' },
        currentRoute: null,
        isNavigating: { value: false },
        loadedRoutes: new Map([
          [
            '/::page',
            {
              entry: {} as any,
              layouts: [],
              page: { renderer: page },
              params: {},
              pathname: '/',
              render: () => jsxDEV(page, {}, null, false, {}),
            },
          ],
        ]),
        manifest: [],
        navigate: (async () => {}) as any,
        sequence: 0,
      } as unknown as RuntimeContainer['router']

      const host = new FakeElement('div')
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          jsxDEV(
            Probe as any,
            {
              children: {
                __eclipsa_type: 'route-slot',
                pathname: '/',
                startLayoutIndex: 0,
              },
            },
            null,
            false,
            {},
          ),
          container,
        ),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        host.appendChild(node)
      }

      const shell = host.childNodes[1] as FakeElement | undefined
      expect(shell).toBeInstanceOf(FakeElement)
      expect(shell?.textContent).toContain('open')
      expect(collectComments([shell!])).toEqual([
        'ec:s:c0:children:0:start',
        'ec:s:c0:children:0:end',
      ])

      ;(shell as FakeElement & { __debugMarker?: string }).__debugMarker = 'live'
      open.value = false
      await flushDirtyComponents(container)

      const nextShell = host.childNodes[1] as FakeElement | undefined
      expect(nextShell).toBe(shell)
      expect((nextShell as FakeElement & { __debugMarker?: string }).__debugMarker).toBe('live')
      expect(nextShell?.textContent).toContain('closed')
      expect(nextShell?.textContent).toContain('page content')
    })
  })

  it('keeps managed Link elements stable when route-location subscribers rerender', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/loader-nav/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/loader-nav/overview',
      )

      container.router = {
        currentPath,
        currentRoute: null,
        currentUrl,
        defaultTitle: '',
        isNavigating: { value: false },
        loadedRoutes: new Map(),
        location: {
          get hash() {
            return ''
          },
          get href() {
            return currentUrl.value
          },
          get pathname() {
            return new URL(currentUrl.value).pathname
          },
          get search() {
            return ''
          },
        },
        manifest: [],
        navigate: (async () => {}) as any,
        prefetchedLoaders: new Map(),
        routeModuleBusts: new Map(),
        routePrefetches: new Map(),
        sequence: 0,
      } as unknown as RuntimeContainer['router']

      const PageLinkBody = (props: { href: string; label: string; stateTestId: string }) => {
        const location = useLocation()
        const isActive = useComputed$(() => location.pathname === props.href)

        return jsxDEV(
          Link as any,
          {
            href: props.href,
            class: isActive.value ? 'link active' : 'link inactive',
            'data-testid': `${props.stateTestId}-link`,
            children: [
              jsxDEV(
                'span',
                {
                  'data-testid': props.stateTestId,
                  children: isActive.value ? ' active' : ' inactive',
                },
                null,
                false,
                {},
              ),
              jsxDEV(
                'span',
                {
                  'data-testid': `${props.stateTestId}-label`,
                  children: props.label,
                },
                null,
                false,
                {},
              ),
            ],
          },
          null,
          false,
          {},
        )
      }

      const PageLink = __eclipsaComponent(
        PageLinkBody,
        'page-link-route-location-symbol',
        () => [],
        { label: 1 },
      )

      container.imports.set(
        'page-link-route-location-symbol',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            PageLinkBody(
              propsOrArg as { href: string; label: string; stateTestId: string },
            ),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document = container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(
            jsxDEV(
              PageLink as any,
              {
                href: '/loader-nav/quick-start',
                label: 'Quick Start',
                stateTestId: 'loader-nav-quick-start-state',
              },
              null,
              false,
              {},
            ),
            container,
          ),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const link = host.childNodes[1] as FakeElement | undefined
        expect(link).toBeInstanceOf(FakeElement)
        expect(link?.className).toBe('link inactive')
        ;(link as FakeElement & { __debugMarker?: string }).__debugMarker = 'live'

        currentPath.value = '/loader-nav/quick-start'
        currentUrl.value = 'http://local/loader-nav/quick-start'
        await flushDirtyComponents(container)

        const nextLink = host.childNodes[1] as FakeElement | undefined
        expect(nextLink).toBe(link)
        expect((nextLink as FakeElement & { __debugMarker?: string }).__debugMarker).toBe('live')
        expect(nextLink?.className).toBe('link active')
        expect(nextLink?.textContent).toContain(' active')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('patches stable-shape boundary contents in place for text and class changes', () => {
    withFakeNodeGlobal(() => {
      const parent = new FakeElement('div')
      const start = new FakeComment('start')
      const current = new FakeElement('a')
      current.setAttribute('class', 'before')
      current.appendChild(new FakeText('Overview'))
      const end = new FakeComment('end')
      parent.appendChild(start)
      parent.appendChild(current)
      parent.appendChild(end)

      const next = new FakeElement('a')
      next.setAttribute('class', 'after')
      next.appendChild(new FakeText('Quick Start'))

      expect(
        tryPatchBoundaryContentsInPlace(
          start as unknown as Comment,
          end as unknown as Comment,
          [next as unknown as Node],
        ),
      ).toBe(true)
      expect(current.getAttribute('class')).toBe('after')
      expect(current.textContent).toBe('Quick Start')
    })
  })

  it('preserves equal resumable marker comments during in-place patches', () => {
    withFakeNodeGlobal(() => {
      const parent = new FakeElement('div')
      const start = new FakeComment('start')
      const current = new FakeComment('ec:c:c0:start')
      const end = new FakeComment('end')
      parent.appendChild(start)
      parent.appendChild(current)
      parent.appendChild(end)

      const next = new FakeComment('ec:c:c0:start')

      expect(
        tryPatchBoundaryContentsInPlace(
          start as unknown as Comment,
          end as unknown as Comment,
          [next as unknown as Node],
        ),
      ).toBe(true)
    })
  })
})
