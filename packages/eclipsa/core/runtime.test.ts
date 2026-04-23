import { describe, expect, it, vi } from 'vitest'
import { motion } from '../../motion/mod.ts'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import type { JSX } from '../jsx/types.ts'
import {
  classSignalEquals,
  attr,
  eventStatic,
  insert,
  insertFor,
  insertStatic,
  listenerStatic,
  text,
  textNodeSignalMember,
} from './client/dom.ts'
import {
  createContext,
  getRuntimeContextReference,
  materializeRuntimeContext,
  materializeRuntimeContextProvider,
} from './context.ts'
import {
  __eclipsaComponent,
  __eclipsaEvent,
  __eclipsaLazy,
  __eclipsaWatch,
  setExternalComponentMeta,
} from './internal.ts'
import { For, Show } from './flow/mod.ts'
import { __eclipsaLoader } from './loader.ts'
import { Link, useLocation, useRouteParams } from './router.tsx'
import { onCleanup, onMount, useComputed, useSignal, useWatch } from './signal.ts'
import { ACTION_FORM_ATTR, CLIENT_INSERT_OWNER_SYMBOL } from './runtime/constants.ts'
import {
  bindPackedRuntimeEvent,
  bindRuntimeEvent,
  createFixedSignalEffect,
  createResumeContainer,
  createDelegatedEvent,
  createDetachedRuntimeComponent,
  createDetachedRuntimeSignal,
  deserializeContainerValue,
  disposeDetachedRuntimeComponent,
  dispatchDocumentEvent,
  flushDirtyComponents,
  installResumeListeners,
  primeLocationState,
  preserveReusableContentInRoots,
  rememberInsertMarkerRange,
  renderClientInsertable,
  restoreSignalRefs,
  runDetachedRuntimeComponent,
  restoreResumedLocalSignalEffects,
  serializeContainerValue,
  syncBoundElementSignal,
  syncManagedElementAttributes,
  tryPatchBoundaryContentsInPlace,
  tryPatchElementShellInPlace,
  tryPatchNodeSequenceInPlace,
  type RuntimeContainer,
  withRuntimeContainer,
} from './runtime.ts'
import {
  getManagedAttributeSnapshot,
  isElementNode,
  isHTMLAnchorElementNode,
  isHTMLFormElementNode,
  isHTMLElementNode,
  isHTMLInputElementNode,
  listNodeChildren,
  rememberManagedAttributesForNode,
  rememberManagedAttributesForSubtree,
} from './runtime/dom.ts'
import { renderSSRAsync } from './ssr.ts'

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
    return index >= 0 ? (this.parentNode.childNodes[index + 1] ?? null) : null
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

  cloneNode(_deep?: boolean) {
    throw new Error('cloneNode() is not implemented for this fake node.')
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

  override cloneNode() {
    const clone = new FakeText(this.data)
    clone.ownerDocument = this.ownerDocument
    return clone
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

  override cloneNode() {
    const clone = new FakeComment(this.data)
    clone.ownerDocument = this.ownerDocument
    return clone
  }
}

class FakeDocumentFragment extends FakeNode {
  constructor() {
    super()
    this.nodeType = 11
  }

  appendChild(node: FakeNode) {
    if (node.parentNode) {
      const index = node.parentNode.childNodes.indexOf(node)
      if (index >= 0) {
        node.parentNode.childNodes.splice(index, 1)
      }
      node.parentNode = null
    }
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }

  override cloneNode(deep = false) {
    const clone = new FakeDocumentFragment()
    clone.ownerDocument = this.ownerDocument
    if (deep) {
      for (const child of this.childNodes) {
        clone.appendChild(child.cloneNode(true) as FakeNode)
      }
    }
    return clone
  }
}

const parseSelectorPart = (selector: string) => {
  const matched = selector
    .trim()
    .match(/^(?:(?<tag>[a-z0-9-]+))?\[(?<attr>[^=\]]+)(?:=(?<value>"[^"]*"|'[^']*'|[^\]]+))?\]$/i)
  if (!matched?.groups?.attr) {
    return null
  }
  const rawValue = matched.groups.value ?? null
  return {
    attr: matched.groups.attr,
    tag: matched.groups.tag?.toLowerCase() ?? null,
    value:
      rawValue === null
        ? null
        : rawValue.startsWith('"') || rawValue.startsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue,
  }
}

const matchesSelectorPart = (element: FakeElement, selector: string) => {
  const parsed = parseSelectorPart(selector)
  if (!parsed) {
    return false
  }
  if (parsed.tag && element.tagName.toLowerCase() !== parsed.tag) {
    return false
  }
  if (!element.hasAttribute(parsed.attr)) {
    return false
  }
  return parsed.value === null || element.getAttribute(parsed.attr) === parsed.value
}

const queryFakeElements = (root: FakeNode, selector: string) => {
  const selectors = selector
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  const matched: FakeElement[] = []

  const visit = (node: FakeNode) => {
    if (
      node instanceof FakeElement &&
      selectors.some((entry) => matchesSelectorPart(node, entry))
    ) {
      matched.push(node)
    }
    for (const child of node.childNodes) {
      visit(child)
    }
  }

  for (const child of root.childNodes) {
    visit(child)
  }

  return matched as unknown as NodeListOf<Element>
}

class FakeElement extends FakeNode {
  attributes = new Map<string, string>()
  childNodes: FakeNode[] = []
  namespaceURI = 'http://www.w3.org/1999/xhtml'
  checked = false
  open = false
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

  override cloneNode(deep = false) {
    const clone = new FakeElement(this.tagName)
    clone.ownerDocument = this.ownerDocument
    clone.namespaceURI = this.namespaceURI
    clone.checked = this.checked
    clone.open = this.open
    clone.selectionDirection = this.selectionDirection
    clone.selectionEnd = this.selectionEnd
    clone.selectionStart = this.selectionStart
    clone.type = this.type
    clone.value = this.value
    clone.className = this.className
    for (const [name, value] of this.attributes) {
      if (name === 'class') {
        continue
      }
      clone.attributes.set(name, value)
    }
    if (deep) {
      for (const child of this.childNodes) {
        clone.appendChild(child.cloneNode(true) as FakeNode)
      }
    }
    return clone
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
    if (node instanceof FakeDocumentFragment) {
      for (const child of node.childNodes.slice()) {
        this.#detachFromCurrentParent(child)
        child.ownerDocument = this.ownerDocument
        child.parentNode = this
        this.childNodes.push(child)
      }
      return node
    }
    this.#detachFromCurrentParent(node)
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }

  insertBefore(node: FakeNode, referenceNode: FakeNode | null) {
    if (node instanceof FakeDocumentFragment) {
      const index =
        referenceNode === null ? this.childNodes.length : this.childNodes.indexOf(referenceNode)
      const insertionIndex = index < 0 ? this.childNodes.length : index
      const children = [...node.childNodes]
      for (const child of children) {
        this.#detachFromCurrentParent(child)
        child.ownerDocument = this.ownerDocument
        child.parentNode = this
      }
      this.childNodes.splice(insertionIndex, 0, ...children)
      for (const child of children) {
        child.parentNode = this
      }
      return node
    }
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
    if (name === 'open') {
      this.open = true
    }
    this.attributes.set(name, value)
  }

  removeAttribute(name: string) {
    if (name === 'class') {
      this.className = ''
      return
    }
    if (name === 'open') {
      this.open = false
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
    const children = this.childNodes.filter(
      (child) => child instanceof FakeElement,
    ) as FakeElement[]
    return {
      item(index: number) {
        return children[index] ?? null
      },
    }
  }

  querySelectorAll(selector: string) {
    return queryFakeElements(this, selector)
  }

  get isConnected() {
    if (this === (this.ownerDocument?.body as unknown as FakeNode | undefined)) {
      return true
    }
    let cursor = this.parentNode
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

  showModal() {
    this.open = true
    this.attributes.set('open', '')
  }

  close() {
    this.open = false
    this.attributes.delete('open')
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
  #eventListeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  defaultView: {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
    history?: {
      pushState: (data: unknown, unused: string, url?: string | URL | null) => void
      replaceState: (data: unknown, unused: string, url?: string | URL | null) => void
    }
    location?: {
      assign: (url: string | URL) => void
      replace: (url: string | URL) => void
    }
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
    requestAnimationFrame: (callback: FrameRequestCallback) => number
    setTimeout: (callback: () => void) => number
  } = {
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

  createDocumentFragment() {
    const fragment = new FakeDocumentFragment()
    fragment.ownerDocument = this
    return fragment as unknown as DocumentFragment
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

  querySelectorAll(selector: string) {
    return queryFakeElements(this.body as unknown as FakeNode, selector)
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
}

const createContainer = () =>
  ({
    actions: new Map(),
    actionStates: new Map(),
    asyncSignalSnapshotCache: new Map(),
    asyncSignalStates: new Map(),
    atoms: new WeakMap(),
    components: new Map(),
    delegatedEventName: null,
    delegatedEventListener: null,
    delegatedEventNames: null,
    dirty: new Set(),
    dirtyFlushQueued: false,
    doc: new FakeDocument() as unknown as Document,
    eventDispatchPromise: null,
    eventBindingScopeCache: new Map(),
    externalRenderCache: new Map(),
    hasRuntimeRefMarkers: false,
    imports: new Map(),
    insertMarkerLookup: new Map(),
    interactivePrefetchCheckQueued: false,
    loaderStates: new Map(),
    loaders: new Map(),
    materializedScopes: new Map(),
    id: 'rt-test',
    nextAtomId: 0,
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
    pendingSignalEffects: [],
    pendingSuspensePromises: new Set(),
    resumeReadyPromise: null,
    rootChildComponentIds: new Set(),
    rootChildCursor: 0,
    rootElement: undefined,
    router: null,
    scopes: new Map(),
    signals: new Map(),
    signalEffectBatchDepth: 0,
    signalEffectsFlushing: false,
    symbols: new Map(),
    visibilityCheckQueued: false,
    visibilityListenersCleanup: null,
    visibles: new Map(),
    watches: new Map(),
    warmedRuntimeSymbols: new Set(),
  }) as RuntimeContainer

const createCleanupSlot = () => ({ callbacks: [] })

const asInsertable = (value: unknown): Parameters<typeof insert>[0] =>
  value as Parameters<typeof insert>[0]

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

describe('core/runtime dom snapshots', () => {
  it('can remember either a single node or an entire subtree', () => {
    withFakeNodeGlobal(() => {
      const doc = new FakeDocument()
      const parent = doc.createElement('div')
      const child = doc.createElement('span')

      parent.setAttribute('data-parent', 'yes')
      child.setAttribute('data-child', 'yes')
      parent.appendChild(child)

      rememberManagedAttributesForNode(parent as unknown as Node)

      expect(getManagedAttributeSnapshot(parent as unknown as Element)).toEqual(
        new Set(['data-parent']),
      )
      expect(getManagedAttributeSnapshot(child as unknown as Element)).toBeNull()

      rememberManagedAttributesForSubtree(parent as unknown as Node)

      expect(getManagedAttributeSnapshot(child as unknown as Element)).toEqual(
        new Set(['data-child']),
      )
    })
  })

  it('detects html element tags precisely with fake DOM globals', () => {
    withFakeNodeGlobal(() => {
      const input = new FakeElement('input')
      const anchor = new FakeElement('a')
      const form = new FakeElement('form')
      const svgAnchor = new FakeElement('a')
      svgAnchor.namespaceURI = 'http://www.w3.org/2000/svg'

      expect(isElementNode(input as unknown as Node)).toBe(true)
      expect(isHTMLElementNode(input as unknown as Node)).toBe(true)
      expect(isHTMLInputElementNode(input as unknown as Node)).toBe(true)
      expect(isHTMLInputElementNode(anchor as unknown as Node)).toBe(false)
      expect(isHTMLAnchorElementNode(anchor as unknown as Node)).toBe(true)
      expect(isHTMLAnchorElementNode(svgAnchor as unknown as Node)).toBe(false)
      expect(isHTMLFormElementNode(form as unknown as Node)).toBe(true)
    })
  })

  it('copies child node lists without mutating the original collection', () => {
    withFakeNodeGlobal(() => {
      const doc = new FakeDocument()
      const parent = doc.createElement('div')
      const first = doc.createTextNode('a')
      const second = doc.createTextNode('b')
      parent.appendChild(first)
      parent.appendChild(second)

      const children = listNodeChildren(parent as unknown as ParentNode)

      expect(children).toEqual([first, second])
      expect(children).not.toBe(parent.childNodes)

      children.pop()

      expect(parent.childNodes).toEqual([first, second])
    })
  })

  it('preserves live runtime element ids during managed attribute sync', () => {
    withFakeNodeGlobal(() => {
      const current = new FakeElement('button')
      const next = new FakeElement('button')

      current.setAttribute('data-eid', 'e1')
      current.setAttribute('data-e-onclick', 'click-symbol:sc1')
      next.setAttribute('data-eid', 'e2')
      next.setAttribute('data-e-onclick', 'click-symbol:sc1')

      rememberManagedAttributesForNode(current as unknown as Node)
      rememberManagedAttributesForNode(next as unknown as Node)
      syncManagedElementAttributes(current as unknown as Element, next as unknown as Element)

      expect(current.getAttribute('data-eid')).toBe('e1')
      expect(current.getAttribute('data-e-onclick')).toBe('click-symbol:sc1')
    })
  })

  it('falls back to current DOM attributes when syncing without a remembered snapshot', () => {
    withFakeNodeGlobal(() => {
      const current = new FakeElement('div')
      const next = new FakeElement('div')

      current.setAttribute('class', 'before')
      current.setAttribute('data-stale', '1')
      next.setAttribute('class', 'after')

      syncManagedElementAttributes(current as unknown as Element, next as unknown as Element)

      expect(current.getAttribute('class')).toBe('after')
      expect(current.getAttribute('data-stale')).toBeNull()
    })
  })

  it('patches single-binding live client anchors in place', () => {
    withFakeNodeGlobal(() => {
      const container = createContainer()
      const current = new FakeElement('a')
      const next = new FakeElement('a')
      current.appendChild(new FakeText('Overview'))
      next.appendChild(new FakeText('Quick Start'))

      withRuntimeContainer(container, () => {
        listenerStatic(current as unknown as Element, 'click', () => {})
        listenerStatic(next as unknown as Element, 'click', () => {})
      })

      rememberManagedAttributesForNode(current as unknown as Node)

      expect(
        tryPatchNodeSequenceInPlace([current as unknown as Node], [next as unknown as Node]),
      ).toBe(true)
      expect(current.textContent).toBe('Quick Start')
      expect(current.getAttribute('data-e-onclick')).toBe(next.getAttribute('data-e-onclick'))
    })
  })
})

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

describe('resume context captures', () => {
  it('serializes local context captures as resumable references', () => {
    const ThemeContext = createContext('fallback')

    expect(getRuntimeContextReference(ThemeContext)).toEqual({
      defaultValue: 'fallback',
      hasDefault: true,
      id: expect.any(String),
      kind: 'context',
    })

    expect(getRuntimeContextReference(ThemeContext.Provider)).toEqual({
      defaultValue: 'fallback',
      hasDefault: true,
      id: expect.any(String),
      kind: 'context-provider',
    })

    const contextReference = getRuntimeContextReference(ThemeContext)
    if (!contextReference || contextReference.kind !== 'context') {
      throw new Error('expected a runtime context reference')
    }
    const providerReference = getRuntimeContextReference(ThemeContext.Provider)
    if (!providerReference || providerReference.kind !== 'context-provider') {
      throw new Error('expected a runtime context provider reference')
    }

    expect(
      materializeRuntimeContext({
        defaultValue: contextReference.defaultValue,
        hasDefault: contextReference.hasDefault,
        id: contextReference.id,
      }),
    ).toBe(ThemeContext)
    expect(
      materializeRuntimeContextProvider({
        defaultValue: providerReference.defaultValue,
        hasDefault: providerReference.hasDefault,
        id: providerReference.id,
      }),
    ).toBe(ThemeContext.Provider)
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

  it('skips ref restoration walks when the container cannot contain runtime refs', () => {
    withFakeNodeGlobal(() => {
      class ThrowingElement extends FakeElement {
        override getAttribute(name: string) {
          if (name === 'data-e-ref') {
            throw new Error('unexpected ref scan')
          }
          return super.getAttribute(name)
        }
      }

      const container = createContainer()
      const root = new FakeElement('div')
      const child = new ThrowingElement('button')
      root.appendChild(child)

      expect(() => restoreSignalRefs(container, root as unknown as ParentNode)).not.toThrow()

      container.hasRuntimeRefMarkers = true
      expect(() => restoreSignalRefs(container, root as unknown as ParentNode)).toThrow(
        'unexpected ref scan',
      )
    })
  })

  it('keeps component refs attached to live elements across in-place rerenders', async () => {
    await withFakeNodeGlobal(async () => {
      let count!: { value: number }
      let ref!: { value: HTMLElement | undefined }

      const renderBody = () =>
        jsxDEV(
          'div',
          {
            children: jsxDEV(
              'button',
              {
                ref,
                children: String(count.value),
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

      const App = __eclipsaComponent(
        () => {
          count = useSignal(0)
          ref = useSignal<HTMLElement | undefined>()
          return renderBody()
        },
        'component-ref-rerender',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'component-ref-rerender',
        Promise.resolve({
          default: () => renderBody(),
        }),
      )
      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )

      for (const node of nodes as unknown as FakeNode[]) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const findLiveButton = () => {
        const visit = (node: FakeNode): FakeElement | null => {
          if (node instanceof FakeElement && node.tagName === 'button') {
            return node
          }
          for (const child of node.childNodes) {
            const found = visit(child)
            if (found) {
              return found
            }
          }
          return null
        }
        return visit(doc.body as unknown as FakeNode)
      }

      const initialButton = findLiveButton()
      expect(initialButton).toBeTruthy()
      expect(ref.value).toBe(initialButton as unknown as HTMLElement)

      count.value = 1
      await flushAsync()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const liveButton = findLiveButton()
      expect(liveButton).toBeTruthy()
      expect(liveButton?.textContent).toBe('1')
      expect(ref.value).toBe(liveButton as unknown as HTMLElement)
      expect((ref.value as unknown as FakeElement).isConnected).toBe(true)
    })
  })

  it('preserves imperative dialog open state across component rerenders', async () => {
    await withFakeNodeGlobal(async () => {
      let query!: { value: string }

      const renderBody = () =>
        jsxDEV(
          'dialog',
          {
            children: jsxDEV('span', { children: query.value }, null, false, {}),
          },
          null,
          false,
          {},
        )

      const App = __eclipsaComponent(
        () => {
          query = useSignal('')
          return renderBody()
        },
        'component-dialog-open',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'component-dialog-open',
        Promise.resolve({
          default: () => renderBody(),
        }),
      )
      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )

      for (const node of nodes as unknown as FakeNode[]) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const findLiveDialog = () => {
        const visit = (node: FakeNode): FakeElement | null => {
          if (node instanceof FakeElement && node.tagName === 'dialog') {
            return node
          }
          for (const child of node.childNodes) {
            const found = visit(child)
            if (found) {
              return found
            }
          }
          return null
        }
        return visit(doc.body as unknown as FakeNode)
      }

      const dialog = findLiveDialog()
      expect(dialog).toBeTruthy()
      dialog?.showModal()
      expect(dialog?.open).toBe(true)
      expect(dialog?.hasAttribute('open')).toBe(true)

      query.value = 'q'
      await flushAsync()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const liveDialog = findLiveDialog()
      expect(liveDialog).toBeTruthy()
      expect(liveDialog?.open).toBe(true)
      expect(liveDialog?.hasAttribute('open')).toBe(true)
      expect(liveDialog?.textContent).toBe('q')
    })
  })

  it('preserves browser-added attrs while removing framework-managed attrs across component rerenders', async () => {
    await withFakeNodeGlobal(async () => {
      let active!: { value: boolean }

      const renderBody = () =>
        jsxDEV(
          'div',
          {
            class: active.value ? 'active' : undefined,
            children: active.value ? 'on' : 'off',
          },
          null,
          false,
          {},
        )

      const App = __eclipsaComponent(
        () => {
          active = useSignal(true)
          return renderBody()
        },
        'component-prev-render-attrs',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'component-prev-render-attrs',
        Promise.resolve({
          default: () => renderBody(),
        }),
      )
      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )

      for (const node of nodes as unknown as FakeNode[]) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const findLiveDiv = () => {
        const visit = (node: FakeNode): FakeElement | null => {
          if (node instanceof FakeElement && node.tagName === 'div') {
            return node
          }
          for (const child of node.childNodes) {
            const found = visit(child)
            if (found) {
              return found
            }
          }
          return null
        }
        return visit(doc.body as unknown as FakeNode)
      }

      const div = findLiveDiv()
      expect(div).toBeTruthy()
      div?.setAttribute('data-browser', '1')

      active.value = false
      await flushAsync()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const liveDiv = findLiveDiv()
      expect(liveDiv).toBeTruthy()
      expect(liveDiv?.getAttribute('data-browser')).toBe('1')
      expect(liveDiv?.hasAttribute('class')).toBe(false)
      expect(liveDiv?.textContent).toBe('off')
    })
  })

  it('preserves dialog shell identity when descendant shape changes across component rerenders', async () => {
    await withFakeNodeGlobal(async () => {
      let showResults!: { value: boolean }

      const renderResults = () =>
        jsxDEV(
          'dialog',
          {
            children: jsxDEV(
              'div',
              {
                children: jsxDEV(
                  'div',
                  {
                    children: showResults.value
                      ? [
                          jsxDEV(
                            'a',
                            { href: '/docs/getting-started/overview', children: 'Overview' },
                            null,
                            false,
                            {},
                          ),
                          jsxDEV(
                            'a',
                            { href: '/docs/getting-started/quick-start', children: 'Quick Start' },
                            null,
                            false,
                            {},
                          ),
                        ]
                      : 'Search titles, headings, content, and code.',
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

      const App = __eclipsaComponent(
        () => {
          showResults = useSignal(false)
          return renderResults()
        },
        'component-dialog-descendant-shape',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'component-dialog-descendant-shape',
        Promise.resolve({
          default: () => renderResults(),
        }),
      )
      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )

      for (const node of nodes as unknown as FakeNode[]) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const findLiveDialog = () => {
        const visit = (node: FakeNode): FakeElement | null => {
          if (node instanceof FakeElement && node.tagName === 'dialog') {
            return node
          }
          for (const child of node.childNodes) {
            const found = visit(child)
            if (found) {
              return found
            }
          }
          return null
        }
        return visit(doc.body as unknown as FakeNode)
      }

      const dialog = findLiveDialog()
      expect(dialog).toBeTruthy()
      dialog?.showModal()
      expect(dialog?.open).toBe(true)

      showResults.value = true
      await flushAsync()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const liveDialog = findLiveDialog()
      expect(liveDialog).toBe(dialog)
      expect(liveDialog?.open).toBe(true)
      expect(liveDialog?.textContent).toContain('Overview')
      expect(liveDialog?.textContent).toContain('Quick Start')
    })
  })

  it('preserves dialog shell identity when a nested component boundary changes shape', async () => {
    await withFakeNodeGlobal(async () => {
      let showResults!: { value: boolean }

      const renderResultsBody = (show: boolean) =>
        show
          ? [
              jsxDEV(
                'a',
                { href: '/docs/getting-started/overview', children: 'Overview' },
                null,
                false,
                {},
              ),
              jsxDEV(
                'a',
                { href: '/docs/getting-started/quick-start', children: 'Quick Start' },
                null,
                false,
                {},
              ),
            ]
          : 'Search titles, headings, content, and code.'

      const ResultsBody = __eclipsaComponent(
        (props: { show: boolean }) =>
          jsxDEV(
            'div',
            {
              children: renderResultsBody(props.show),
            },
            null,
            false,
            {},
          ),
        'component-dialog-results-body',
        () => [],
      )
      const ResultsBodyType = ResultsBody as unknown as (props: unknown) => JSX.Element

      const renderDialog = () =>
        jsxDEV(
          'dialog',
          {
            children: jsxDEV(
              'div',
              {
                children: jsxDEV(ResultsBodyType, { show: showResults.value }, null, false, {}),
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

      const App = __eclipsaComponent(
        () => {
          showResults = useSignal(false)
          return renderDialog()
        },
        'component-dialog-parent-boundary',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'component-dialog-parent-boundary',
        Promise.resolve({
          default: () => renderDialog(),
        }),
      )
      container.imports.set(
        'component-dialog-results-body',
        Promise.resolve({
          default: (_scope: unknown, propsOrArg?: unknown) =>
            jsxDEV(
              'div',
              {
                children: renderResultsBody((propsOrArg as { show: boolean }).show),
              },
              null,
              false,
              {},
            ),
        }),
      )
      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )

      for (const node of nodes as unknown as FakeNode[]) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const findLiveDialog = () => {
        const visit = (node: FakeNode): FakeElement | null => {
          if (node instanceof FakeElement && node.tagName === 'dialog') {
            return node
          }
          for (const child of node.childNodes) {
            const found = visit(child)
            if (found) {
              return found
            }
          }
          return null
        }
        return visit(doc.body as unknown as FakeNode)
      }

      const dialog = findLiveDialog()
      expect(dialog).toBeTruthy()
      dialog?.showModal()
      expect(dialog?.open).toBe(true)

      showResults.value = true
      await flushAsync()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const liveDialog = findLiveDialog()
      expect(liveDialog).toBe(dialog)
      expect(liveDialog?.open).toBe(true)
      expect(liveDialog?.textContent).toContain('Overview')
      expect(liveDialog?.textContent).toContain('Quick Start')
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

      expect((input as unknown as FakeElement).getAttribute('data-e-bind-value')).toBe('s0')
      expect((input as unknown as FakeElement).value).toBe('alpha')

      ;(input as unknown as FakeElement).value = 'beta'
      ;(input as unknown as FakeElement).dispatchEvent(new Event('input'))
      expect(value.value).toBe('beta')

      value.value = 'gamma'
      expect((input as unknown as FakeElement).value).toBe('gamma')
    })
  })

  it('clears stale subscriptions only for the rerendered detached component', () => {
    withFakeNodeGlobal(() => {
      const container = createContainer()
      const alpha = createDetachedRuntimeSignal(container, 's0', 'alpha')
      const beta = createDetachedRuntimeSignal(container, 's1', 'beta')
      const first = createDetachedRuntimeComponent(container, 'd0')
      const second = createDetachedRuntimeComponent(container, 'd1')

      runDetachedRuntimeComponent(container, first, () => `${alpha.value}:${beta.value}`)
      runDetachedRuntimeComponent(container, second, () => beta.value)

      expect([...container.signals.get('s0')!.subscribers]).toEqual(['d0'])
      expect([...container.signals.get('s1')!.subscribers].sort()).toEqual(['d0', 'd1'])

      runDetachedRuntimeComponent(container, first, () => alpha.value)

      expect([...container.signals.get('s0')!.subscribers]).toEqual(['d0'])
      expect([...container.signals.get('s1')!.subscribers]).toEqual(['d1'])

      disposeDetachedRuntimeComponent(container, first)
      disposeDetachedRuntimeComponent(container, second)
    })
  })

  it('updates primitive insert text in place without replacing the text node', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const value = createDetachedRuntimeSignal(container, 's0', 'alpha')
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.ownerDocument = doc
      marker.ownerDocument = doc
      host.appendChild(marker)
      ;(doc.body as unknown as FakeElement).appendChild(host)

      withRuntimeContainer(container, () => {
        insert(() => value.value, host as unknown as Node, marker as unknown as Node)
      })

      expect(container.components.size).toBe(0)
      const initialText = host.childNodes[0] as FakeText | undefined
      expect(initialText?.data).toBe('alpha')
      expect(host.childNodes[1]).toBe(marker)

      value.value = 'beta'
      await flushAsync()

      const liveText = host.childNodes[0] as FakeText | undefined
      expect(liveText?.data).toBe('beta')
      expect(liveText).toBe(initialText)
      expect(host.childNodes[1]).toBe(marker)
    })
  })

  it('materializes a client insert owner only when a primitive hole later renders a component', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const value = createDetachedRuntimeSignal<string | JSX.Element>(container, 's0', 'alpha')
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.ownerDocument = doc
      marker.ownerDocument = doc
      host.appendChild(marker)
      ;(doc.body as unknown as FakeElement).appendChild(host)

      const Child = __eclipsaComponent(
        () => jsxDEV('span', { children: 'beta' }, null, false, {}),
        'primitive-hole-child',
        () => [],
      )

      withRuntimeContainer(container, () => {
        insert(() => value.value, host as unknown as Node, marker as unknown as Node)
      })

      expect(container.components.size).toBe(0)
      expect((host.childNodes[0] as FakeText | undefined)?.data).toBe('alpha')
      expect(host.childNodes[1]).toBe(marker)

      value.value = jsxDEV(Child as any, {}, null, false, {})
      await flushAsync()

      expect(host.textContent).toContain('beta')
      expect(container.components.size).toBeGreaterThan(0)
    })
  })

  it('keeps static primitive inserts off the detached owner path', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.ownerDocument = doc
      marker.ownerDocument = doc
      host.appendChild(marker)
      ;(doc.body as unknown as FakeElement).appendChild(host)

      withRuntimeContainer(container, () => {
        insertStatic('alpha', host as unknown as Node, marker as unknown as Node)
      })

      expect((host.childNodes[0] as FakeText | undefined)?.data).toBe('alpha')
      expect(container.nextComponentId).toBe(0)
    })
  })

  it('keeps primitive text bindings off the detached owner path until fallback is needed', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const value = createDetachedRuntimeSignal(container, 's0', 'alpha')
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.ownerDocument = doc
      marker.ownerDocument = doc
      host.appendChild(marker)
      ;(doc.body as unknown as FakeElement).appendChild(host)

      withRuntimeContainer(container, () => {
        text(() => value.value, host as unknown as Node, marker as unknown as Node)
      })

      expect((host.childNodes[0] as FakeText | undefined)?.data).toBe('alpha')
      expect(container.nextComponentId).toBe(0)
    })
  })

  it('switches primitive inserts between text and empty in place around a stable marker', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const value = createDetachedRuntimeSignal<string | false>(container, 's0', 'alpha')
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.ownerDocument = doc
      marker.ownerDocument = doc
      host.appendChild(marker)
      ;(doc.body as unknown as FakeElement).appendChild(host)

      withRuntimeContainer(container, () => {
        insert(() => value.value, host as unknown as Node, marker as unknown as Node)
      })

      expect((host.childNodes[0] as FakeText | undefined)?.data).toBe('alpha')
      expect(host.childNodes[1]).toBe(marker)

      value.value = false
      await flushAsync()

      const emptyNode = host.childNodes[0] as FakeComment | undefined
      expect(emptyNode?.data).toBe('eclipsa-empty')
      expect(host.childNodes[1]).toBe(marker)

      value.value = 'beta'
      await flushAsync()

      const liveText = host.childNodes[0] as FakeText | undefined
      expect(liveText?.data).toBe('beta')
      expect(host.childNodes[1]).toBe(marker)
    })
  })

  it('preserves the runtime container when an insert rerender re-enters a local helper insert', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const query = createDetachedRuntimeSignal(container, 's0', '')
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      host.ownerDocument = doc
      ;(doc.body as unknown as FakeElement).appendChild(host)

      const SearchResultsBody = (props: { query: string }) => {
        const body = doc.createElement('div') as FakeElement
        insert(
          (() =>
            props.query.trim() === ''
              ? 'Search titles, headings, content, and code.'
              : jsxDEV(
                  'a',
                  {
                    href: '/docs/getting-started/overview',
                    children: 'Overview',
                  },
                  null,
                  false,
                  {},
                )) as Parameters<typeof insert>[0],
          body,
        )
        return body as unknown as JSX.Element
      }

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              'div',
              {
                children: [
                  jsxDEV('input', { type: 'text', value: query.value }, null, false, {}),
                  SearchResultsBody({ query: query.value }),
                ],
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
        )
      })

      expect(host.textContent).toContain('Search titles, headings, content, and code.')

      query.value = 'ov'
      await flushAsync()

      expect(host.textContent).toContain('Overview')
    })
  })

  it('keeps client insert refs attached to live elements across in-place patches', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const value = createDetachedRuntimeSignal(container, 's0', 'alpha')
      const ref = createDetachedRuntimeSignal<HTMLElement | undefined>(container, 's1', undefined)
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      host.ownerDocument = doc
      ;(doc.body as unknown as FakeElement).appendChild(host)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              'button',
              {
                ref,
                children: value.value,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
        )
      })

      const initialButton = host.childNodes[0] as FakeElement | undefined
      expect(initialButton?.textContent).toBe('alpha')
      expect(ref.value).toBe(initialButton as unknown as HTMLElement)

      value.value = 'beta'
      await flushAsync()

      const liveButton = host.childNodes[0] as FakeElement | undefined
      expect(liveButton?.textContent).toBe('beta')
      expect(ref.value).toBe(liveButton as unknown as HTMLElement)
      expect((ref.value as unknown as FakeElement).isConnected).toBe(true)
    })
  })

  it('preserves imperative dialog open state across insert patches', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const value = createDetachedRuntimeSignal(container, 's0', 'alpha')
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      host.ownerDocument = doc
      ;(doc.body as unknown as FakeElement).appendChild(host)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              'dialog',
              {
                children: value.value,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
        )
      })

      const dialog = host.childNodes[0] as FakeElement | undefined
      expect(dialog?.tagName).toBe('dialog')
      dialog?.showModal()
      expect(dialog?.open).toBe(true)
      expect(dialog?.hasAttribute('open')).toBe(true)

      value.value = 'beta'
      await flushAsync()

      const liveDialog = host.childNodes[0] as FakeElement | undefined
      expect(liveDialog?.tagName).toBe('dialog')
      expect(liveDialog?.open).toBe(true)
      expect(liveDialog?.hasAttribute('open')).toBe(true)
      expect(liveDialog?.textContent).toBe('beta')
    })
  })

  it('preserves browser-added attrs while removing framework-managed attrs across insert patches', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const active = createDetachedRuntimeSignal(container, 's0', true)
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      host.ownerDocument = doc
      ;(doc.body as unknown as FakeElement).appendChild(host)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              'div',
              {
                class: active.value ? 'active' : undefined,
                children: active.value ? 'on' : 'off',
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
        )
      })

      const div = host.childNodes[0] as FakeElement | undefined
      expect(div?.tagName).toBe('div')
      div?.setAttribute('data-browser', '1')

      active.value = false
      await flushAsync()

      const liveDiv = host.childNodes[0] as FakeElement | undefined
      expect(liveDiv?.tagName).toBe('div')
      expect(liveDiv?.getAttribute('data-browser')).toBe('1')
      expect(liveDiv?.hasAttribute('class')).toBe(false)
      expect(liveDiv?.textContent).toBe('off')
    })
  })

  it('preserves dialog shell identity when descendant shape changes across insert patches', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const showResults = createDetachedRuntimeSignal(container, 's0', false)
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      host.ownerDocument = doc
      ;(doc.body as unknown as FakeElement).appendChild(host)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              'dialog',
              {
                children: jsxDEV(
                  'div',
                  {
                    children: jsxDEV(
                      'div',
                      {
                        children: showResults.value
                          ? [
                              jsxDEV(
                                'a',
                                { href: '/docs/getting-started/overview', children: 'Overview' },
                                null,
                                false,
                                {},
                              ),
                              jsxDEV(
                                'a',
                                {
                                  href: '/docs/getting-started/quick-start',
                                  children: 'Quick Start',
                                },
                                null,
                                false,
                                {},
                              ),
                            ]
                          : 'Search titles, headings, content, and code.',
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
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
        )
      })

      const dialog = host.childNodes[0] as FakeElement | undefined
      expect(dialog?.tagName).toBe('dialog')
      dialog?.showModal()
      expect(dialog?.open).toBe(true)

      showResults.value = true
      await flushAsync()

      const liveDialog = host.childNodes[0] as FakeElement | undefined
      expect(liveDialog).toBe(dialog)
      expect(liveDialog?.open).toBe(true)
      expect(liveDialog?.textContent).toContain('Overview')
      expect(liveDialog?.textContent).toContain('Quick Start')
    })
  })

  it('keeps a wrapped dialog shell stable when a nested result boundary changes shape across insert patches', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const open = createDetachedRuntimeSignal(container, 's0', false)
      const query = createDetachedRuntimeSignal(container, 's1', '')
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      host.ownerDocument = doc
      ;(doc.body as unknown as FakeElement).appendChild(host)

      const SearchResultsBodyRender = (props: { query: string }) => {
        if (props.query.trim() === '') {
          return jsxDEV(
            'div',
            { children: 'Search titles, headings, content, and code.' },
            null,
            false,
            {},
          )
        }
        return jsxDEV(
          'div',
          {
            children: jsxDEV(
              'a',
              { href: '/docs/getting-started/overview', children: 'Overview' },
              null,
              false,
              {},
            ),
          },
          null,
          false,
          {},
        )
      }

      const SearchResultsBody = __eclipsaComponent(
        SearchResultsBodyRender,
        'component-insert-search-results-body',
        () => [],
      )

      container.imports.set(
        'component-insert-search-results-body',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            SearchResultsBodyRender(propsOrArg as { query: string }),
        }),
      )

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              'div',
              {
                children: [
                  jsxDEV(
                    'button',
                    {
                      'aria-expanded': open.value,
                      children: 'Search docs',
                    },
                    null,
                    false,
                    {},
                  ),
                  jsxDEV(
                    'dialog',
                    {
                      children: jsxDEV(
                        'div',
                        {
                          children: jsxDEV(
                            'div',
                            {
                              children: [
                                jsxDEV(
                                  'input',
                                  { type: 'text', value: query.value },
                                  null,
                                  false,
                                  {},
                                ),
                                jsxDEV(
                                  SearchResultsBody as any,
                                  { query: query.value },
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
                  ),
                ],
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
        )
      })

      const root = host.childNodes[0] as FakeElement | undefined
      const dialog = root?.childNodes[1] as FakeElement | undefined
      const button = root?.childNodes[0] as FakeElement | undefined
      expect(root?.tagName).toBe('div')
      expect(dialog?.tagName).toBe('dialog')
      expect(button?.tagName).toBe('button')
      ;(root as FakeElement & { __debugMarker?: string }).__debugMarker = 'root-live'
      ;(dialog as FakeElement & { __debugMarker?: string }).__debugMarker = 'dialog-live'
      dialog?.showModal()
      expect(dialog?.open).toBe(true)

      open.value = true
      query.value = 'ov'
      await flushAsync()

      const nextRoot = host.childNodes[0] as FakeElement | undefined
      const nextDialog = nextRoot?.childNodes[1] as FakeElement | undefined
      const nextButton = nextRoot?.childNodes[0] as FakeElement | undefined
      expect(nextRoot).toBe(root)
      expect(nextDialog).toBe(dialog)
      expect((nextRoot as FakeElement & { __debugMarker?: string }).__debugMarker).toBe('root-live')
      expect((nextDialog as FakeElement & { __debugMarker?: string }).__debugMarker).toBe(
        'dialog-live',
      )
      expect(nextDialog?.open).toBe(true)
      expect(nextButton?.hasAttribute('aria-expanded')).toBe(true)
      expect(nextDialog?.textContent).toContain('Overview')
    })
  })

  it('keeps owner-scoped insert trees stable on the first local update', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      host.ownerDocument = doc
      ;(doc.body as unknown as FakeElement).appendChild(host)

      let open!: { value: boolean }
      let query!: { value: string }

      const SearchResultsBodyRender = (props: { query: string }) => {
        if (props.query.trim() === '') {
          return jsxDEV(
            'div',
            { children: 'Search titles, headings, content, and code.' },
            null,
            false,
            {},
          )
        }
        return jsxDEV(
          'div',
          {
            children: jsxDEV(
              'a',
              { href: '/docs/getting-started/overview', children: 'Overview' },
              null,
              false,
              {},
            ),
          },
          null,
          false,
          {},
        )
      }

      const SearchResultsBody = __eclipsaComponent(
        SearchResultsBodyRender,
        'component-owner-insert-search-results-body',
        () => [],
      )

      const SearchDialogHostBody = () => {
        open = useSignal(false)
        query = useSignal('')

        insert(
          (() =>
            jsxDEV(
              'div',
              {
                children: [
                  jsxDEV(
                    'button',
                    {
                      'aria-expanded': open.value,
                      children: 'Search docs',
                    },
                    null,
                    false,
                    {},
                  ),
                  jsxDEV(
                    'dialog',
                    {
                      children: jsxDEV(
                        'div',
                        {
                          children: jsxDEV(
                            'div',
                            {
                              children: [
                                jsxDEV(
                                  'input',
                                  { type: 'text', value: query.value },
                                  null,
                                  false,
                                  {},
                                ),
                                jsxDEV(
                                  SearchResultsBody as any,
                                  { query: query.value },
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
                  ),
                ],
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
        )

        return jsxDEV('div', { children: 'owner' }, null, false, {})
      }

      const SearchDialogHost = __eclipsaComponent(
        SearchDialogHostBody,
        'component-owner-insert-search-dialog-host',
        () => [],
      )

      container.imports.set(
        'component-owner-insert-search-results-body',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            SearchResultsBodyRender(propsOrArg as { query: string }),
        }),
      )
      container.imports.set(
        'component-owner-insert-search-dialog-host',
        Promise.resolve({
          default: () => SearchDialogHostBody(),
        }),
      )

      const ownerNodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(SearchDialogHost as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of ownerNodes) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const root = host.childNodes[0] as FakeElement | undefined
      const dialog = root?.childNodes[1] as FakeElement | undefined
      const button = root?.childNodes[0] as FakeElement | undefined
      expect(root?.tagName).toBe('div')
      expect(dialog?.tagName).toBe('dialog')
      expect(button?.tagName).toBe('button')
      ;(root as FakeElement & { __debugMarker?: string }).__debugMarker = 'owner-root-live'
      ;(dialog as FakeElement & { __debugMarker?: string }).__debugMarker = 'owner-dialog-live'
      dialog?.showModal()
      expect(dialog?.open).toBe(true)

      open.value = true
      query.value = 'ov'
      await flushAsync()

      const nextRoot = host.childNodes[0] as FakeElement | undefined
      const nextDialog = nextRoot?.childNodes[1] as FakeElement | undefined
      const nextButton = nextRoot?.childNodes[0] as FakeElement | undefined
      expect(nextRoot).toBe(root)
      expect(nextDialog).toBe(dialog)
      expect((nextRoot as FakeElement & { __debugMarker?: string }).__debugMarker).toBe(
        'owner-root-live',
      )
      expect((nextDialog as FakeElement & { __debugMarker?: string }).__debugMarker).toBe(
        'owner-dialog-live',
      )
      expect(nextDialog?.open).toBe(true)
      expect(nextButton?.hasAttribute('aria-expanded')).toBe(true)
      expect(nextDialog?.textContent).toContain('Overview')
    })
  })

  it('flushes async signal writes without waiting for another DOM event', async () => {
    await withFakeNodeGlobal(async () => {
      let count!: { value: number }

      const App = __eclipsaComponent(
        () => {
          count = useSignal(0)
          return jsxDEV('span', { children: String(count.value) }, null, false, {})
        },
        'component-async-write',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'component-async-write',
        Promise.resolve({
          default: () => {
            return jsxDEV('span', { children: String(count.value) }, null, false, {})
          },
        }),
      )
      const host = new FakeElement('div')
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        host.appendChild(node)
      }

      expect(host.textContent).toContain('0')

      Promise.resolve().then(() => {
        count.value = 1
      })

      await flushAsync()
      await flushAsync()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(host.textContent).toContain('1')
    })
  })

  it('restores focus for bound inputs that rerender without an onInput handler', async () => {
    await withFakeNodeGlobal(async () => {
      let inputRef!: { value: HTMLInputElement | undefined }

      const AppBody = () => {
        const query = useSignal('')
        inputRef = useSignal<HTMLInputElement | undefined>()
        return jsxDEV(
          'input',
          { 'bind:value': query, ref: inputRef, type: 'text' },
          null,
          false,
          {},
        )
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
      const initialInput = nodes.find((node) => node instanceof FakeElement) as
        | FakeElement
        | undefined
      if (!initialInput) {
        throw new Error('Expected rendered input.')
      }
      initialInput.focus()
      initialInput.value = 'a'
      initialInput.selectionStart = 1
      initialInput.selectionEnd = 1

      await dispatchDocumentEvent(
        container,
        new TargetedInputEvent(initialInput as unknown as EventTarget),
      )
      await flushAsync()

      expect(inputRef.value).toBeDefined()
      expect(doc.activeElement).toBe(initialInput as unknown as Element)
      expect(initialInput.value).toBe('a')
      expect(initialInput.selectionStart).toBe(1)
      expect(initialInput.selectionEnd).toBe(1)
    })
  })

  it('restores focus for native input listeners that trigger rerenders outside delegated document events', async () => {
    await withFakeNodeGlobal(async () => {
      let inputRef!: { value: HTMLInputElement | undefined }
      let query!: { value: string }

      const renderBody = () =>
        jsxDEV(
          'div',
          {
            children: [
              jsxDEV('input', { ref: inputRef, type: 'text', value: query.value }, null, false, {}),
              jsxDEV('span', { children: query.value }, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )

      const App = __eclipsaComponent(
        () => {
          query = useSignal('')
          inputRef = useSignal<HTMLInputElement | undefined>()
          return renderBody()
        },
        'component-native-focus',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'component-native-focus',
        Promise.resolve({
          default: () => renderBody(),
        }),
      )
      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      for (const node of nodes as unknown as FakeNode[]) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const findLiveInput = () => {
        const visit = (node: FakeNode): FakeElement | null => {
          if (node instanceof FakeElement && node.tagName === 'input') {
            return node
          }
          for (const child of node.childNodes) {
            const found = visit(child)
            if (found) {
              return found
            }
          }
          return null
        }
        return visit(doc.body as unknown as FakeNode)
      }

      const initialInput = findLiveInput()
      if (!initialInput) {
        throw new Error('Expected rendered input.')
      }

      initialInput.addEventListener('input', () => {
        query.value = initialInput.value
      })
      initialInput.focus()
      initialInput.value = 'a'
      initialInput.selectionStart = 1
      initialInput.selectionEnd = 1
      initialInput.dispatchEvent(new Event('input'))

      await flushAsync()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const liveInput = findLiveInput()
      expect(liveInput).toBeTruthy()
      expect(doc.activeElement).toBe(liveInput as unknown as Element)
      expect(liveInput?.value).toBe('a')
      expect(liveInput?.selectionStart).toBe(1)
      expect(liveInput?.selectionEnd).toBe(1)
    })
  })

  it('waits for resume startup before dispatching non-link document events', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      let handled = 0
      let resolveReady!: () => void

      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const button = doc.createElement('button') as unknown as FakeElement
      button.setAttribute('data-e-onclick', 'startup-click-symbol:sc0')
      ;(doc.body as unknown as FakeElement).appendChild(button)
      container.scopes.set('sc0', [])
      container.imports.set(
        'startup-click-symbol',
        Promise.resolve({
          default: () => {
            handled += 1
          },
        }),
      )
      container.resumeReadyPromise = new Promise<void>((resolve) => {
        resolveReady = resolve
      })

      const pendingDispatch = dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )

      await flushAsync()
      expect(handled).toBe(0)

      resolveReady()
      await pendingDispatch

      expect(handled).toBe(1)
    })
  })

  it('reuses materialized event scopes across repeated resumable dispatches', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const seenScopes: unknown[][] = []
      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const button = doc.createElement('button') as unknown as FakeElement
      const count = createDetachedRuntimeSignal(container, 's0', 0)

      button.setAttribute('data-e-onclick', 'cached-scope-symbol:sc0')
      ;(doc.body as unknown as FakeElement).appendChild(button)
      container.scopes.set('sc0', [serializeContainerValue(container, count)])
      container.imports.set(
        'cached-scope-symbol',
        Promise.resolve({
          default: (scope: unknown[]) => {
            seenScopes.push(scope)
            ;(scope[0] as { value: number }).value += 1
          },
        }),
      )

      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )
      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )

      expect(seenScopes).toHaveLength(2)
      expect(seenScopes[0]).toBe(seenScopes[1])
      expect(count.value).toBe(2)
    })
  })

  it('includes successful submitter fields when dispatching action form submissions', async () => {
    await withFakeNodeGlobal(async () => {
      const OriginalFormData = globalThis.FormData
      const OriginalSubmitEvent = globalThis.SubmitEvent

      class CapturedFormData {
        readonly appended: Array<[string, string]> = []

        constructor(readonly form: unknown) {}

        append(name: string, value: string) {
          this.appended.push([name, value])
        }
      }

      class TargetedSubmitEvent extends Event {
        constructor(
          private readonly eventTarget: EventTarget | null,
          readonly submitter: HTMLElement | null,
        ) {
          super('submit', { bubbles: true, cancelable: true })
        }

        override get target() {
          return this.eventTarget
        }
      }

      globalThis.FormData = CapturedFormData as unknown as typeof FormData
      globalThis.SubmitEvent = TargetedSubmitEvent as unknown as typeof SubmitEvent

      try {
        const container = createContainer()
        const doc = container.doc as unknown as FakeDocument
        const form = doc.createElement('form') as unknown as FakeElement
        const submitter = doc.createElement('button') as unknown as FakeElement
        let submitted: unknown

        form.setAttribute(ACTION_FORM_ATTR, 'save')
        submitter.setAttribute('name', 'intent')
        submitter.setAttribute('value', 'publish')
        container.actions.set('save', {
          action: (input: unknown) => {
            submitted = input
            return Promise.resolve()
          },
        })

        await dispatchDocumentEvent(
          container,
          new TargetedSubmitEvent(
            form as unknown as EventTarget,
            submitter as unknown as HTMLElement,
          ),
        )

        expect(submitted).toBeInstanceOf(CapturedFormData)
        expect((submitted as CapturedFormData).form).toBe(form)
        expect((submitted as CapturedFormData).appended).toEqual([['intent', 'publish']])
      } finally {
        globalThis.FormData = OriginalFormData
        globalThis.SubmitEvent = OriginalSubmitEvent
      }
    })
  })

  it('dispatches live client event bindings without serializing resumable attrs', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      const seenScopes: unknown[][] = []
      host.appendChild(marker)

      container.imports.set(
        'live-click-symbol',
        Promise.resolve({
          default: (scope: unknown[]) => {
            seenScopes.push(scope)
          },
        }),
      )

      withRuntimeContainer(container, () => {
        insert(
          jsxDEV(
            'button',
            {
              children: 'Click me',
              onClick: __eclipsaEvent('click', 'live-click-symbol', () => [42]),
            },
            null,
            false,
            {},
          ),
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const button = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'button',
      )
      expect(button).toBeTruthy()
      expect(button?.getAttribute('data-eid')).toBeNull()
      expect(button?.getAttribute('data-e-onclick')).toBeNull()
      const scopeCountAfterRender = container.scopes.size

      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )

      expect(seenScopes).toEqual([[42]])
      expect(container.scopes.size).toBe(scopeCountAfterRender)
    })
  })

  it('dispatches live client event bindings when captures are inlined as arrays', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      const seenScopes: unknown[][] = []
      host.appendChild(marker)

      container.imports.set(
        'live-click-symbol',
        Promise.resolve({
          default: (scope: unknown[]) => {
            seenScopes.push(scope)
          },
        }),
      )

      withRuntimeContainer(container, () => {
        insert(
          jsxDEV(
            'button',
            {
              children: 'Click me',
              onClick: __eclipsaEvent('click', 'live-click-symbol', [42]),
            },
            null,
            false,
            {},
          ),
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const button = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'button',
      )
      expect(button).toBeTruthy()

      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )

      expect(seenScopes).toEqual([[42]])
    })
  })

  it('materializes captured live event descriptors as callable handlers', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      const open = { value: true }
      host.appendChild(marker)

      const closeModuleImport = Promise.resolve({
        default: (scope: unknown[]) => {
          ;(scope[0] as typeof open).value = false
        },
      })
      container.imports.set('nested-close-symbol', closeModuleImport)
      container.imports.set(
        'nested-overlay-symbol',
        Promise.resolve({
          default: (scope: unknown[], event: Event) => {
            if (event.target === event.currentTarget) {
              ;(scope[0] as () => void)()
            }
          },
        }),
      )

      withRuntimeContainer(container, () => {
        insert(
          jsxDEV(
            'div',
            {
              children: 'Overlay',
              onClick: __eclipsaEvent.__1(
                'click',
                'nested-overlay-symbol',
                __eclipsaEvent.__1('click', 'nested-close-symbol', open),
              ),
            },
            null,
            false,
            {},
          ),
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(container.imports.get('nested-close-symbol')).not.toBe(closeModuleImport)
      const closeImport = container.imports.get('nested-close-symbol')
      expect(closeImport).toBeTruthy()
      await closeImport
      const overlay = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'div',
      )
      expect(overlay).toBeTruthy()

      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(overlay as unknown as EventTarget),
      )

      expect(open.value).toBe(false)
    })
  })

  it('forwards delegated events through captured live event descriptors', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let forwardedCurrentTarget: EventTarget | null = null
      host.appendChild(marker)

      const receiverModuleImport = Promise.resolve({
        default: (_scope: unknown[], event: Event) => {
          forwardedCurrentTarget = event.currentTarget
        },
      })
      container.imports.set('nested-receiver-symbol', receiverModuleImport)
      container.imports.set(
        'nested-forwarder-symbol',
        Promise.resolve({
          default: (scope: unknown[], event: Event) => {
            ;(scope[0] as (event: Event) => void)(event)
          },
        }),
      )

      withRuntimeContainer(container, () => {
        insert(
          jsxDEV(
            'button',
            {
              children: 'Forward',
              onClick: __eclipsaEvent.__1(
                'click',
                'nested-forwarder-symbol',
                __eclipsaEvent.__0('click', 'nested-receiver-symbol'),
              ),
            },
            null,
            false,
            {},
          ),
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(container.imports.get('nested-receiver-symbol')).not.toBe(receiverModuleImport)
      const receiverImport = container.imports.get('nested-receiver-symbol')
      expect(receiverImport).toBeTruthy()
      await receiverImport
      const button = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'button',
      )
      expect(button).toBeTruthy()

      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )

      expect(forwardedCurrentTarget).toBe(button)
    })
  })

  it('does not walk document focus paths for live client event bindings', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let handled = 0
      host.appendChild(marker)

      container.imports.set(
        'live-focus-path-symbol',
        Promise.resolve({
          default: () => {
            handled += 1
          },
        }),
      )

      withRuntimeContainer(container, () => {
        insert(
          jsxDEV(
            'button',
            {
              children: 'Click me',
              onClick: __eclipsaEvent('click', 'live-focus-path-symbol', () => []),
            },
            null,
            false,
            {},
          ),
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const button = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'button',
      )
      expect(button).toBeTruthy()
      Object.defineProperty((container.doc as unknown as FakeDocument).body, 'children', {
        configurable: true,
        get() {
          throw new Error('live client events should not capture focus paths eagerly')
        },
      })

      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )

      expect(handled).toBe(1)
    })
  })

  it('warms live resumable event symbols when binding client event descriptors', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const button = (container.doc as unknown as FakeDocument).createElement(
        'button',
      ) as unknown as Element
      container.symbols.set(
        'warm-live-click-symbol',
        'data:text/javascript,export default () => {}',
      )

      withRuntimeContainer(container, () => {
        expect(
          bindRuntimeEvent(
            button,
            'click',
            __eclipsaEvent('click', 'warm-live-click-symbol', () => []),
          ),
        ).toBe(true)
      })

      const imported = container.imports.get('warm-live-click-symbol')
      expect(imported).toBeTruthy()
      await imported
    })
  })

  it('warms packed resumable event symbols when binding packed client events', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const button = (container.doc as unknown as FakeDocument).createElement(
        'button',
      ) as unknown as Element
      container.symbols.set(
        'warm-packed-click-symbol',
        'data:text/javascript,export default () => {}',
      )

      withRuntimeContainer(container, () => {
        bindPackedRuntimeEvent(container, button, 'click', 'warm-packed-click-symbol', 2, 1, 2)
      })

      const imported = container.imports.get('warm-packed-click-symbol')
      expect(imported).toBeTruthy()
      await imported
    })
  })

  it('skips the initial fixed-signal callback run when requested', () => {
    const container = createContainer()
    const value = createDetachedRuntimeSignal(container, 's0', 1)
    const seen: number[] = []

    withRuntimeContainer(container, () => {
      createFixedSignalEffect(
        value,
        (nextValue) => {
          seen.push(nextValue)
        },
        { skipInitialRun: true },
      )
    })

    expect(seen).toEqual([])

    value.value = 2

    expect(seen).toEqual([2])
  })

  it('keeps two fixed-signal bindings in the inline record slots before spilling to an array', () => {
    const container = createContainer()
    const value = createDetachedRuntimeSignal(container, 's0', 1)
    const seenA: number[] = []
    const seenB: number[] = []
    const seenC: number[] = []

    withRuntimeContainer(container, () => {
      createFixedSignalEffect(value, (nextValue) => {
        seenA.push(nextValue)
      })
      createFixedSignalEffect(value, (nextValue) => {
        seenB.push(nextValue)
      })
    })

    const recordAfterTwo = container.signals.get('s0')
    expect(recordAfterTwo?.fixedEffect).toBeTruthy()
    expect(recordAfterTwo?.secondFixedEffect).toBeTruthy()
    expect(recordAfterTwo?.fixedEffects).toBeNull()

    withRuntimeContainer(container, () => {
      createFixedSignalEffect(value, (nextValue) => {
        seenC.push(nextValue)
      })
    })

    const recordAfterThree = container.signals.get('s0')
    expect(recordAfterThree?.fixedEffects).toHaveLength(3)
    expect(recordAfterThree?.fixedEffect).toBeNull()
    expect(recordAfterThree?.secondFixedEffect).toBeNull()

    value.value = 2

    expect(seenA.at(-1)).toBe(2)
    expect(seenB.at(-1)).toBe(2)
    expect(seenC.at(-1)).toBe(2)
  })

  it('dispatches direct-mode live function bindings through document delegation', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const clicks = createDetachedRuntimeSignal(container, '$clicks', 0)
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let seenCurrentTarget: unknown = null
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        const button = container.doc.createElement('button')
        listenerStatic(button, 'click', (event: Event) => {
          seenCurrentTarget = event.currentTarget
          clicks.value += 1
        })
        insertStatic(button as unknown as Node, host as unknown as Node, marker as unknown as Node)
      })

      const button = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'button',
      )
      expect(button).toBeTruthy()
      expect(button?.getAttribute('data-e-onclick')).toBeNull()

      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )

      expect(clicks.value).toBe(1)
      expect(seenCurrentTarget).toBe(button)
    })
  })

  it('dispatches static event helpers through document delegation when a runtime container is active', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const clicks = createDetachedRuntimeSignal(container, '$clicks', 0)
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        const button = container.doc.createElement('button')
        eventStatic(button, 'click', () => {
          clicks.value += 1
        })
        insertStatic(button as unknown as Node, host as unknown as Node, marker as unknown as Node)
      })

      const button = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'button',
      )
      expect(button).toBeTruthy()

      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )

      expect(clicks.value).toBe(1)
    })
  })

  it('dispatches multiple delegated live function bindings from the same element', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedEvent extends Event {
        constructor(
          type: string,
          private readonly eventTarget: EventTarget | null,
        ) {
          super(type)
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const clicks = createDetachedRuntimeSignal(container, '$clicks', 0)
      const keydowns = createDetachedRuntimeSignal(container, '$keydowns', 0)
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        const button = container.doc.createElement('button')
        listenerStatic(button, 'click', () => {
          clicks.value += 1
        })
        listenerStatic(button, 'keydown', () => {
          keydowns.value += 1
        })
        insertStatic(button as unknown as Node, host as unknown as Node, marker as unknown as Node)
      })

      const button = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'button',
      )
      expect(button).toBeTruthy()

      await dispatchDocumentEvent(
        container,
        new TargetedEvent('click', button as unknown as EventTarget),
      )
      await dispatchDocumentEvent(
        container,
        new TargetedEvent('keydown', button as unknown as EventTarget),
      )

      expect(clicks.value).toBe(1)
      expect(keydowns.value).toBe(1)
    })
  })

  it('does not allocate resumable event scopes across rerenders for live client nodes', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      const label = createDetachedRuntimeSignal(container, 's0', 'A')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() => {
            const rowId = 42
            const handleClick = () => rowId
            return jsxDEV(
              'button',
              {
                children: label.value,
                onClick: handleClick,
              },
              null,
              false,
              {},
            )
          }) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const scopeCountAfterFirstRender = container.scopes.size
      const button = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'button',
      )
      expect(button?.getAttribute('data-eid')).toBeNull()
      expect(button?.getAttribute('data-e-onclick')).toBeNull()

      label.value = 'B'
      await flushAsync()

      const rerenderedButton = host.childNodes.find(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'button',
      )
      expect(rerenderedButton?.getAttribute('data-eid')).toBeNull()
      expect(rerenderedButton?.getAttribute('data-e-onclick')).toBeNull()
      expect(container.scopes.size).toBe(scopeCountAfterFirstRender)
    })
  })

  it('does not override programmatic focus changes during resumable document events', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const button = doc.createElement('button') as unknown as FakeElement
      const input = doc.createElement('input') as unknown as FakeElement

      button.setAttribute('data-e-onclick', 'focus-input-symbol:sc0')
      ;(doc.body as unknown as FakeElement).appendChild(button)
      ;(doc.body as unknown as FakeElement).appendChild(input)
      doc.activeElement = button as unknown as Element

      container.scopes.set('sc0', [])
      container.imports.set(
        'focus-input-symbol',
        Promise.resolve({
          default: () => {
            input.focus()
          },
        }),
      )

      await dispatchDocumentEvent(
        container,
        new TargetedClickEvent(button as unknown as EventTarget),
      )

      expect(doc.activeElement).toBe(input as unknown as Element)
    })
  })

  it('prefetches interactive handler symbols on pointer intent so click handlers can run immediately', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedEvent extends Event {
        constructor(
          type: string,
          private readonly eventTarget: EventTarget | null,
        ) {
          super(type)
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const button = doc.createElement('button') as unknown as FakeElement
      const input = doc.createElement('input') as unknown as FakeElement

      button.setAttribute('data-e-onclick', 'prefetch-click-symbol:sc0')
      ;(doc.body as unknown as FakeElement).appendChild(button)
      ;(doc.body as unknown as FakeElement).appendChild(input)
      doc.activeElement = button as unknown as Element

      container.scopes.set('sc0', [])

      let resolveImport!: (module: { default: () => void }) => void
      const imported = new Promise<{ default: () => void }>((resolve) => {
        resolveImport = resolve
      })
      container.imports.set('prefetch-click-symbol', imported)

      const cleanup = installResumeListeners(container)

      doc.dispatchEvent(new TargetedEvent('pointerdown', button as unknown as EventTarget))
      resolveImport({
        default: () => {
          input.focus()
        },
      })
      await flushAsync()

      doc.dispatchEvent(new TargetedEvent('click', button as unknown as EventTarget))

      expect(doc.activeElement).toBe(input as unknown as Element)
      cleanup()
    })
  })

  it('promotes prefetched seeded symbol imports into immediate click execution', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedEvent extends Event {
        constructor(
          type: string,
          private readonly eventTarget: EventTarget | null,
        ) {
          super(type)
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const button = doc.createElement('button') as unknown as FakeElement

      button.setAttribute('data-e-onclick', 'prefetch-cache-symbol:sc0')
      ;(doc.body as unknown as FakeElement).appendChild(button)
      container.scopes.set('sc0', [])

      let resolveImport!: (module: { default: () => void }) => void
      const imported = new Promise<{ default: () => void }>((resolve) => {
        resolveImport = resolve
      })
      container.imports.set('prefetch-cache-symbol', imported)

      let callCount = 0
      const cleanup = installResumeListeners(container)

      doc.dispatchEvent(new TargetedEvent('pointerdown', button as unknown as EventTarget))
      resolveImport({
        default: () => {
          callCount += 1
        },
      })
      await flushAsync()

      doc.dispatchEvent(new TargetedEvent('click', button as unknown as EventTarget))

      expect(callCount).toBe(1)
      cleanup()
    })
  })

  it('warms visible interactive handler symbols after listener installation so first clicks after navigation are immediate', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const button = doc.createElement('button') as unknown as FakeElement
      const input = doc.createElement('input') as unknown as FakeElement

      button.setAttribute('data-e-onclick', 'visible-click-symbol:sc0')
      ;(doc.body as unknown as FakeElement).appendChild(button)
      ;(doc.body as unknown as FakeElement).appendChild(input)
      doc.activeElement = button as unknown as Element

      container.scopes.set('sc0', [])

      let resolveImport!: (module: { default: () => void }) => void
      const imported = new Promise<{ default: () => void }>((resolve) => {
        resolveImport = resolve
      })
      container.imports.set('visible-click-symbol', imported)

      const cleanup = installResumeListeners(container)
      resolveImport({
        default: () => {
          input.focus()
        },
      })
      await flushAsync()

      doc.dispatchEvent(new TargetedClickEvent(button as unknown as EventTarget))

      expect(doc.activeElement).toBe(input as unknown as Element)
      cleanup()
    })
  })

  it('intercepts dynamically inserted route links through the document listener fallback', async () => {
    await withFakeNodeGlobal(async () => {
      const OriginalMouseEvent = globalThis.MouseEvent
      class FakeMouseEvent extends Event {
        altKey = false
        button = 0
        ctrlKey = false
        metaKey = false
        shiftKey = false

        constructor(type: string) {
          super(type, { bubbles: true, cancelable: true })
        }
      }
      globalThis.MouseEvent = FakeMouseEvent as unknown as typeof MouseEvent

      class TargetedMouseEvent extends FakeMouseEvent {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const OriginalHTMLAnchorElement = globalThis.HTMLAnchorElement
      globalThis.HTMLAnchorElement = FakeElement as unknown as typeof HTMLAnchorElement

      try {
        const container = createContainer()
        const doc = container.doc as unknown as FakeDocument & {
          location: Location
        }
        doc.location = {
          hash: '',
          href: 'http://local/docs/getting-started/overview',
          origin: 'http://local',
          pathname: '/docs/getting-started/overview',
          search: '',
        } as Location
        container.router = {
          currentPath: { value: '/docs/getting-started/overview' },
          currentRoute: null,
          currentUrl: { value: 'http://local/docs/getting-started/overview' },
          defaultTitle: '',
          isNavigating: { value: false },
          loadedRoutes: new Map(),
          location: doc.location,
          manifest: [
            {
              error: null,
              hasMiddleware: false,
              layouts: [],
              loading: null,
              notFound: null,
              page: '/app/docs/[...slug]/+page.tsx',
              routePath: '/docs/getting-started/overview',
              segments: [
                { kind: 'static', value: 'docs' },
                { kind: 'static', value: 'getting-started' },
                { kind: 'static', value: 'overview' },
              ],
              server: null,
            },
          ],
          navigate: (async () => {}) as any,
          prefetchedLoaders: new Map(),
          routeModuleBusts: new Map(),
          routePrefetches: new Map(),
          sequence: 0,
        } as unknown as RuntimeContainer['router']

        const cleanup = installResumeListeners(container)
        const link = doc.createElement('a') as unknown as FakeElement
        link.setAttribute('href', '/docs/getting-started/overview')
        link.setAttribute('data-e-link', '')
        ;(doc.body as unknown as FakeElement).appendChild(link)

        const event = new TargetedMouseEvent(link as unknown as EventTarget)
        doc.dispatchEvent(event)
        await container.eventDispatchPromise
        await flushAsync()

        expect(event.defaultPrevented).toBe(true)
        cleanup()
      } finally {
        globalThis.MouseEvent = OriginalMouseEvent
        globalThis.HTMLAnchorElement = OriginalHTMLAnchorElement
      }
    })
  })

  it('falls back to static HTML resume payloads when the route-data endpoint is unavailable', async () => {
    await withFakeNodeGlobal(async () => {
      const OriginalFetch = globalThis.fetch
      const OriginalMouseEvent = globalThis.MouseEvent
      const OriginalHTMLAnchorElement = globalThis.HTMLAnchorElement

      class FakeMouseEvent extends Event {
        altKey = false
        button = 0
        ctrlKey = false
        metaKey = false
        shiftKey = false

        constructor(
          type: string,
          private readonly eventTarget: EventTarget | null,
        ) {
          super(type, { bubbles: true, cancelable: true })
        }

        override get target() {
          return this.eventTarget
        }
      }

      globalThis.MouseEvent = FakeMouseEvent as unknown as typeof MouseEvent
      globalThis.HTMLAnchorElement = FakeElement as unknown as typeof HTMLAnchorElement

      try {
        const container = createContainer()
        const doc = container.doc as unknown as FakeDocument & {
          defaultView: {
            addEventListener: () => void
            history: {
              pushState: (_data: unknown, _unused: string, url: string) => void
              replaceState: (_data: unknown, _unused: string, url: string) => void
            }
            location: {
              assign: (url: string) => void
              replace: (url: string) => void
            }
            removeEventListener: () => void
            requestAnimationFrame: (callback: FrameRequestCallback) => number
            setTimeout: (callback: () => void) => number
          }
          location: Location
        }
        const applyLocation = (href: string | URL | null | undefined) => {
          if (!href) {
            return
          }
          const url = href instanceof URL ? href : new URL(href)
          doc.location = {
            hash: url.hash,
            href: url.href,
            origin: url.origin,
            pathname: url.pathname,
            search: url.search,
          } as Location
        }
        applyLocation('http://local/')
        doc.defaultView = {
          ...doc.defaultView,
          history: {
            pushState: (_data, _unused, url) => {
              applyLocation(url)
            },
            replaceState: (_data, _unused, url) => {
              applyLocation(url)
            },
          },
          location: {
            assign: (url) => {
              applyLocation(url)
            },
            replace: (url) => {
              applyLocation(url)
            },
          },
        }

        const htmlPayload = JSON.stringify({
          actions: {},
          components: {},
          loaders: {},
          scopes: {},
          signals: {},
          subscriptions: {},
          symbols: {},
          visibles: {},
          watches: {},
        })
        const routeDataRequests: string[] = []

        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

          if (
            url === 'http://local/__eclipsa/route-data?href=http%3A%2F%2Flocal%2Fdocs%2Fquick-start'
          ) {
            routeDataRequests.push(url)
            return {
              json: async () => ({ document: true, ok: false }),
              status: 404,
              text: async () => '',
              url,
            } as Response
          }

          if (url === 'http://local/docs/quick-start') {
            return {
              status: 200,
              text: async () =>
                `<html><body><script id="eclipsa-resume-final" type="application/eclipsa-resume+json">${htmlPayload}</script\t\n ignored></body></html>`,
              url,
            } as Response
          }

          throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetch

        const currentPage = () => jsxDEV('p', { children: 'home' }, null, false, {})
        const nextPage = () => jsxDEV('p', { children: 'quick start' }, null, false, {})

        container.rootElement = doc.body as unknown as HTMLElement
        container.router = {
          currentPath: { value: '/' },
          currentRoute: {
            entry: {
              error: null,
              hasMiddleware: false,
              layouts: [],
              loading: null,
              notFound: null,
              page: '/entries/home.js',
              routePath: '/',
              segments: [],
              server: null,
            },
            error: undefined,
            layouts: [],
            params: {},
            pathname: '/',
            page: {
              metadata: null,
              renderer: currentPage,
              symbol: null,
              url: '/entries/home.js',
            },
            render: () => jsxDEV(currentPage, {}, null, false, {}),
          },
          currentUrl: { value: 'http://local/' },
          defaultTitle: '',
          isNavigating: { value: false },
          loadedRoutes: new Map([
            [
              '/::page',
              {
                entry: {
                  error: null,
                  hasMiddleware: false,
                  layouts: [],
                  loading: null,
                  notFound: null,
                  page: '/entries/home.js',
                  routePath: '/',
                  segments: [],
                  server: null,
                },
                error: undefined,
                layouts: [],
                params: {},
                pathname: '/',
                page: {
                  metadata: null,
                  renderer: currentPage,
                  symbol: null,
                  url: '/entries/home.js',
                },
                render: () => jsxDEV(currentPage, {}, null, false, {}),
              },
            ],
            [
              '/docs/quick-start::page',
              {
                entry: {
                  error: null,
                  hasMiddleware: false,
                  layouts: [],
                  loading: null,
                  notFound: null,
                  page: '/entries/quick-start.js',
                  routePath: '/docs/quick-start',
                  segments: [
                    { kind: 'static', value: 'docs' },
                    { kind: 'static', value: 'quick-start' },
                  ],
                  server: null,
                },
                error: undefined,
                layouts: [],
                params: {},
                pathname: '/docs/quick-start',
                page: {
                  metadata: null,
                  renderer: nextPage,
                  symbol: null,
                  url: '/entries/quick-start.js',
                },
                render: () => jsxDEV(nextPage, {}, null, false, {}),
              },
            ],
          ]),
          location: doc.location,
          manifest: [
            {
              error: null,
              hasMiddleware: false,
              layouts: [],
              loading: null,
              notFound: null,
              page: '/entries/home.js',
              routePath: '/',
              segments: [],
              server: null,
            },
            {
              error: null,
              hasMiddleware: false,
              layouts: [],
              loading: null,
              notFound: null,
              page: '/entries/quick-start.js',
              routePath: '/docs/quick-start',
              segments: [
                { kind: 'static', value: 'docs' },
                { kind: 'static', value: 'quick-start' },
              ],
              server: null,
            },
          ],
          navigate: (async () => {}) as any,
          prefetchedLoaders: new Map(),
          routeDataEndpoint: false,
          routeModuleBusts: new Map(),
          routePrefetches: new Map(),
          sequence: 0,
        } as unknown as RuntimeContainer['router']

        const link = doc.createElement('a') as unknown as FakeElement
        link.setAttribute('href', '/docs/quick-start')
        link.setAttribute('data-e-link', '')
        ;(doc.body as unknown as FakeElement).appendChild(link)

        const cleanup = installResumeListeners(container)
        const event = new FakeMouseEvent('click', link as unknown as EventTarget)
        doc.dispatchEvent(event)
        await container.eventDispatchPromise
        await flushAsync()
        await flushAsync()
        await flushAsync()
        await flushAsync()

        expect(event.defaultPrevented).toBe(true)
        expect(routeDataRequests).toEqual([])
        expect((doc.body as unknown as FakeElement).textContent).toContain('quick start')
        expect(doc.location.pathname).toBe('/docs/quick-start')
        cleanup()
      } finally {
        globalThis.fetch = OriginalFetch
        globalThis.MouseEvent = OriginalMouseEvent
        globalThis.HTMLAnchorElement = OriginalHTMLAnchorElement
      }
    })
  })

  it('navigates to the previous route on popstate after the browser location has already changed', async () => {
    await withFakeNodeGlobal(async () => {
      const OriginalFetch = globalThis.fetch

      try {
        globalThis.fetch = (async () => {
          throw new Error('Unexpected fetch during popstate navigation test')
        }) as typeof fetch

        const container = createContainer()
        const doc = container.doc as unknown as FakeDocument & {
          defaultView: {
            addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
            history: {
              pushState: (_data: unknown, _unused: string, url: string) => void
              replaceState: (_data: unknown, _unused: string, url: string) => void
            }
            location: {
              assign: (url: string) => void
              replace: (url: string) => void
            }
            removeEventListener: (
              type: string,
              listener: EventListenerOrEventListenerObject,
            ) => void
            requestAnimationFrame: (callback: FrameRequestCallback) => number
            setTimeout: (callback: () => void) => number
          }
          location: Location
        }

        const applyLocation = (href: string | URL | null | undefined) => {
          if (!href) {
            return
          }
          const url = href instanceof URL ? href : new URL(href)
          doc.location = {
            hash: url.hash,
            href: url.href,
            origin: url.origin,
            pathname: url.pathname,
            search: url.search,
          } as Location
        }

        let popstateListener: unknown = null
        applyLocation('http://local/counter')
        doc.defaultView = {
          ...doc.defaultView,
          addEventListener: (type, listener) => {
            if (type === 'popstate') {
              popstateListener = listener
            }
          },
          history: {
            pushState: (_data, _unused, url) => {
              applyLocation(url)
            },
            replaceState: (_data, _unused, url) => {
              applyLocation(url)
            },
          },
          location: {
            assign: (url) => {
              applyLocation(url)
            },
            replace: (url) => {
              applyLocation(url)
            },
          },
          removeEventListener: (type, listener) => {
            if (type === 'popstate' && popstateListener === listener) {
              popstateListener = null
            }
          },
        }

        const homeEntry = {
          error: null,
          hasMiddleware: false,
          layouts: [],
          loading: null,
          notFound: null,
          page: '/entries/home.js',
          routePath: '/',
          segments: [],
          server: null,
        }
        const counterEntry = {
          error: null,
          hasMiddleware: false,
          layouts: [],
          loading: null,
          notFound: null,
          page: '/entries/counter.js',
          routePath: '/counter',
          segments: [{ kind: 'static' as const, value: 'counter' }],
          server: null,
        }
        const Home = () => jsxDEV('p', { children: 'home' }, null, false, {})
        const Counter = () => jsxDEV('p', { children: 'counter' }, null, false, {})
        const homeRoute = {
          entry: homeEntry,
          error: undefined,
          layouts: [],
          params: {},
          pathname: '/',
          page: {
            metadata: null,
            renderer: Home,
            symbol: null,
            url: '/entries/home.js',
          },
          render: () => jsxDEV(Home, {}, null, false, {}),
        }
        const counterRoute = {
          entry: counterEntry,
          error: undefined,
          layouts: [],
          params: {},
          pathname: '/counter',
          page: {
            metadata: null,
            renderer: Counter,
            symbol: null,
            url: '/entries/counter.js',
          },
          render: () => jsxDEV(Counter, {}, null, false, {}),
        }

        container.rootElement = doc.body as unknown as HTMLElement
        const router = {
          currentPath: { value: '/counter' },
          currentRoute: counterRoute,
          currentUrl: { value: 'http://local/counter' },
          defaultTitle: '',
          isNavigating: { value: false },
          loadedRoutes: new Map([
            ['/::page', homeRoute],
            ['/counter::page', counterRoute],
          ]),
          location: doc.location,
          manifest: [homeEntry, counterEntry],
          navigate: (async () => {}) as any,
          prefetchedLoaders: new Map(),
          routeModuleBusts: new Map(),
          routePrefetches: new Map([
            [
              '/',
              Promise.resolve({
                finalHref: 'http://local/',
                finalPathname: '/',
                kind: 'page' as const,
                loaders: {},
                ok: true as const,
              }),
            ],
          ]),
          sequence: 0,
        } as NonNullable<RuntimeContainer['router']>
        container.router = router

        const originalDocument = globalThis.document
        ;(globalThis as typeof globalThis & { document: Document }).document =
          container.doc as Document

        try {
          const nodes = withRuntimeContainer(container, () =>
            renderClientInsertable(counterRoute.render(), container),
          ) as unknown as FakeNode[]

          for (const node of nodes) {
            ;(doc.body as unknown as FakeElement).appendChild(node)
          }

          expect((doc.body as unknown as FakeElement).textContent).toContain('counter')

          const cleanup = installResumeListeners(container)

          applyLocation('http://local/')
          expect(doc.location.pathname).toBe('/')
          expect(router.currentPath.value).toBe('/counter')

          const popstateEvent = new Event('popstate')
          if (typeof popstateListener === 'function') {
            ;(popstateListener as (event: Event) => void)(popstateEvent)
          } else if (popstateListener && typeof popstateListener === 'object') {
            ;(popstateListener as { handleEvent(event: Event): void }).handleEvent(popstateEvent)
          }

          await flushAsync()
          await flushAsync()
          await flushAsync()

          expect(router.currentPath.value).toBe('/')
          expect(router.currentUrl.value).toBe('http://local/')
          expect((doc.body as unknown as FakeElement).textContent).toContain('home')
          expect((doc.body as unknown as FakeElement).textContent).not.toContain('counter')

          cleanup()
        } finally {
          globalThis.document = originalDocument
        }
      } finally {
        globalThis.fetch = OriginalFetch
      }
    })
  })

  it('prefetches route loader snapshots on pointer intent so mobile taps can render loader-backed routes without loader endpoints', async () => {
    await withFakeNodeGlobal(async () => {
      const OriginalFetch = globalThis.fetch
      const OriginalMouseEvent = globalThis.MouseEvent
      const OriginalHTMLAnchorElement = globalThis.HTMLAnchorElement

      class FakeMouseEvent extends Event {
        altKey = false
        button = 0
        ctrlKey = false
        metaKey = false
        shiftKey = false

        constructor(
          type: string,
          private readonly eventTarget: EventTarget | null,
        ) {
          super(type, { bubbles: true, cancelable: true })
        }

        override get target() {
          return this.eventTarget
        }
      }

      globalThis.MouseEvent = FakeMouseEvent as unknown as typeof MouseEvent
      globalThis.HTMLAnchorElement = FakeElement as unknown as typeof HTMLAnchorElement

      try {
        const container = createContainer()
        const doc = container.doc as unknown as FakeDocument & {
          defaultView: {
            addEventListener: () => void
            history: {
              pushState: (_data: unknown, _unused: string, url: string) => void
              replaceState: (_data: unknown, _unused: string, url: string) => void
            }
            location: {
              assign: (url: string) => void
              replace: (url: string) => void
            }
            removeEventListener: () => void
            requestAnimationFrame: (callback: FrameRequestCallback) => number
            setTimeout: (callback: () => void) => number
          }
          location: Location
        }
        const applyLocation = (href: string | URL | null | undefined) => {
          if (!href) {
            return
          }
          const url = href instanceof URL ? href : new URL(href)
          doc.location = {
            hash: url.hash,
            href: url.href,
            origin: url.origin,
            pathname: url.pathname,
            search: url.search,
          } as Location
        }
        applyLocation('http://local/docs/getting-started/overview')
        doc.defaultView = {
          ...doc.defaultView,
          history: {
            pushState: (_data, _unused, url) => {
              applyLocation(url)
            },
            replaceState: (_data, _unused, url) => {
              applyLocation(url)
            },
          },
          location: {
            assign: (url) => {
              applyLocation(url)
            },
            replace: (url) => {
              applyLocation(url)
            },
          },
        }

        const layoutLoaderId = 'mobile-route-layout-loader'
        const pageLoaderId = 'mobile-route-page-loader'
        const loaderRequests: string[] = []
        const routeDataRequests: string[] = []

        const htmlPayload = JSON.stringify({
          actions: {},
          components: {},
          loaders: {
            [layoutLoaderId]: {
              data: 'prefetched layout',
              error: null,
              loaded: true,
            },
            [pageLoaderId]: {
              data: 'prefetched page',
              error: null,
              loaded: true,
            },
          },
          scopes: {},
          signals: {},
          subscriptions: {},
          symbols: {},
          visibles: {},
          watches: {},
        })

        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

          if (
            url ===
            'http://local/__eclipsa/route-data?href=http%3A%2F%2Flocal%2Fdocs%2Fmaterials%2Frouting'
          ) {
            routeDataRequests.push(url)
            return {
              json: async () => ({ document: true, ok: false }),
              status: 404,
              text: async () => '',
              url,
            } as Response
          }

          if (url === 'http://local/docs/materials/routing') {
            return {
              status: 200,
              text: async () =>
                `<html><body><script id="eclipsa-resume-final" type="application/eclipsa-resume+json">${htmlPayload}</script></body></html>`,
              url,
            } as Response
          }

          if (url.startsWith('http://local/__eclipsa/loader/')) {
            loaderRequests.push(url)
            return {
              json: async () => ({
                error: { message: 'unexpected loader fetch' },
                ok: false,
              }),
              status: 404,
              url,
            } as Response
          }

          throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetch

        const useLayoutLoader = __eclipsaLoader(layoutLoaderId, [], async () => 'live layout')
        const usePageLoader = __eclipsaLoader(pageLoaderId, [], async () => 'live page')

        const PageBody = () => {
          const page = usePageLoader()
          return jsxDEV(
            'h1',
            { children: `page:${String(page.data ?? 'missing')}` },
            null,
            false,
            {},
          )
        }

        const LayoutBody = (props: { children: JSX.Childable }) => {
          const layout = useLayoutLoader()
          return jsxDEV(
            'main',
            {
              children: [
                jsxDEV(
                  'p',
                  { children: `layout:${String(layout.data ?? 'missing')}` },
                  null,
                  false,
                  {},
                ),
                props.children,
              ],
            },
            null,
            false,
            {},
          )
        }

        const Page = __eclipsaComponent(PageBody, 'mobile-route-loader-page', () => [])
        const Layout = __eclipsaComponent(LayoutBody, 'mobile-route-loader-layout', () => [], {
          children: 1,
        })

        const currentPage = () => jsxDEV('p', { children: 'home' }, null, false, {})
        const nextRender = () =>
          jsxDEV(
            Layout as any,
            {
              children: jsxDEV(Page as any, {}, null, false, {}),
            },
            null,
            false,
            {},
          )

        container.rootElement = doc.body as unknown as HTMLElement
        container.router = {
          currentPath: { value: '/docs/getting-started/overview' },
          currentRoute: {
            entry: {
              error: null,
              hasMiddleware: false,
              layouts: [],
              loading: null,
              notFound: null,
              page: '/entries/home.js',
              routePath: '/docs/getting-started/overview',
              segments: [
                { kind: 'static', value: 'docs' },
                { kind: 'static', value: 'getting-started' },
                { kind: 'static', value: 'overview' },
              ],
              server: null,
            },
            error: undefined,
            layouts: [],
            params: {},
            pathname: '/docs/getting-started/overview',
            page: {
              metadata: null,
              renderer: currentPage,
              symbol: null,
              url: '/entries/home.js',
            },
            render: () => jsxDEV(currentPage, {}, null, false, {}),
          },
          currentUrl: { value: 'http://local/docs/getting-started/overview' },
          defaultTitle: '',
          isNavigating: { value: false },
          loadedRoutes: new Map([
            [
              '/docs/getting-started/overview::page',
              {
                entry: {
                  error: null,
                  hasMiddleware: false,
                  layouts: [],
                  loading: null,
                  notFound: null,
                  page: '/entries/home.js',
                  routePath: '/docs/getting-started/overview',
                  segments: [
                    { kind: 'static', value: 'docs' },
                    { kind: 'static', value: 'getting-started' },
                    { kind: 'static', value: 'overview' },
                  ],
                  server: null,
                },
                error: undefined,
                layouts: [],
                params: {},
                pathname: '/docs/getting-started/overview',
                page: {
                  metadata: null,
                  renderer: currentPage,
                  symbol: null,
                  url: '/entries/home.js',
                },
                render: () => jsxDEV(currentPage, {}, null, false, {}),
              },
            ],
            [
              '/docs/materials/routing::page',
              {
                entry: {
                  error: null,
                  hasMiddleware: false,
                  layouts: ['/entries/docs-layout.js'],
                  loading: null,
                  notFound: null,
                  page: '/entries/docs-routing.js',
                  routePath: '/docs/materials/routing',
                  segments: [
                    { kind: 'static', value: 'docs' },
                    { kind: 'static', value: 'materials' },
                    { kind: 'static', value: 'routing' },
                  ],
                  server: null,
                },
                error: undefined,
                layouts: [
                  {
                    metadata: null,
                    renderer: Layout as unknown as JSX.Type,
                    symbol: 'mobile-route-loader-layout',
                    url: '/entries/docs-layout.js',
                  },
                ],
                params: {},
                pathname: '/docs/materials/routing',
                page: {
                  metadata: null,
                  renderer: Page as unknown as JSX.Type,
                  symbol: 'mobile-route-loader-page',
                  url: '/entries/docs-routing.js',
                },
                render: nextRender,
              },
            ],
          ]),
          location: doc.location,
          manifest: [
            {
              error: null,
              hasMiddleware: false,
              layouts: [],
              loading: null,
              notFound: null,
              page: '/entries/home.js',
              routePath: '/docs/getting-started/overview',
              segments: [
                { kind: 'static', value: 'docs' },
                { kind: 'static', value: 'getting-started' },
                { kind: 'static', value: 'overview' },
              ],
              server: null,
            },
            {
              error: null,
              hasMiddleware: false,
              layouts: ['/entries/docs-layout.js'],
              loading: null,
              notFound: null,
              page: '/entries/docs-routing.js',
              routePath: '/docs/materials/routing',
              segments: [
                { kind: 'static', value: 'docs' },
                { kind: 'static', value: 'materials' },
                { kind: 'static', value: 'routing' },
              ],
              server: null,
            },
          ],
          navigate: (async () => {}) as any,
          prefetchedLoaders: new Map(),
          routeModuleBusts: new Map(),
          routePrefetches: new Map(),
          sequence: 0,
        } as unknown as RuntimeContainer['router']

        const link = doc.createElement('a') as unknown as FakeElement
        link.setAttribute('href', '/docs/materials/routing')
        link.setAttribute('data-e-link', '')
        ;(doc.body as unknown as FakeElement).appendChild(link)

        const cleanup = installResumeListeners(container)

        link.dispatchEvent(new FakeMouseEvent('pointerdown', link as unknown as EventTarget))
        await flushAsync()
        await flushAsync()

        link.dispatchEvent(new FakeMouseEvent('click', link as unknown as EventTarget))
        await flushAsync()
        await flushAsync()
        await flushAsync()

        expect(routeDataRequests).toEqual([
          'http://local/__eclipsa/route-data?href=http%3A%2F%2Flocal%2Fdocs%2Fmaterials%2Frouting',
        ])
        expect(loaderRequests).toEqual([])
        expect((doc.body as unknown as FakeElement).textContent).toContain(
          'layout:prefetched layout',
        )
        expect((doc.body as unknown as FakeElement).textContent).toContain('page:prefetched page')
        expect(doc.location.pathname).toBe('/docs/materials/routing')
        cleanup()
      } finally {
        globalThis.fetch = OriginalFetch
        globalThis.MouseEvent = OriginalMouseEvent
        globalThis.HTMLAnchorElement = OriginalHTMLAnchorElement
      }
    })
  })

  it('requests route loader snapshots during click navigation when intent prefetch has not run yet', async () => {
    await withFakeNodeGlobal(async () => {
      const OriginalFetch = globalThis.fetch
      const OriginalMouseEvent = globalThis.MouseEvent
      const OriginalHTMLAnchorElement = globalThis.HTMLAnchorElement

      class FakeMouseEvent extends Event {
        altKey = false
        button = 0
        ctrlKey = false
        metaKey = false
        shiftKey = false

        constructor(
          type: string,
          private readonly eventTarget: EventTarget | null,
        ) {
          super(type, { bubbles: true, cancelable: true })
        }

        override get target() {
          return this.eventTarget
        }
      }

      globalThis.MouseEvent = FakeMouseEvent as unknown as typeof MouseEvent
      globalThis.HTMLAnchorElement = FakeElement as unknown as typeof HTMLAnchorElement

      try {
        const container = createContainer()
        const doc = container.doc as unknown as FakeDocument & {
          defaultView: {
            addEventListener: () => void
            history: {
              pushState: (_data: unknown, _unused: string, url: string) => void
              replaceState: (_data: unknown, _unused: string, url: string) => void
            }
            location: {
              assign: (url: string) => void
              replace: (url: string) => void
            }
            removeEventListener: () => void
            requestAnimationFrame: (callback: FrameRequestCallback) => number
            setTimeout: (callback: () => void) => number
          }
          location: Location
        }
        const applyLocation = (href: string | URL | null | undefined) => {
          if (!href) {
            return
          }
          const url = href instanceof URL ? href : new URL(href)
          doc.location = {
            hash: url.hash,
            href: url.href,
            origin: url.origin,
            pathname: url.pathname,
            search: url.search,
          } as Location
        }
        applyLocation('http://local/docs/getting-started/overview')
        doc.defaultView = {
          ...doc.defaultView,
          history: {
            pushState: (_data, _unused, url) => {
              applyLocation(url)
            },
            replaceState: (_data, _unused, url) => {
              applyLocation(url)
            },
          },
          location: {
            assign: (url) => {
              applyLocation(url)
            },
            replace: (url) => {
              applyLocation(url)
            },
          },
        }

        const layoutLoaderId = 'mobile-click-route-layout-loader'
        const pageLoaderId = 'mobile-click-route-page-loader'
        const loaderRequests: string[] = []
        const routeDataRequests: string[] = []

        const htmlPayload = JSON.stringify({
          actions: {},
          components: {},
          loaders: {
            [layoutLoaderId]: {
              data: 'prefetched layout',
              error: null,
              loaded: true,
            },
            [pageLoaderId]: {
              data: 'prefetched page',
              error: null,
              loaded: true,
            },
          },
          scopes: {},
          signals: {},
          subscriptions: {},
          symbols: {},
          visibles: {},
          watches: {},
        })

        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

          if (
            url ===
            'http://local/__eclipsa/route-data?href=http%3A%2F%2Flocal%2Fdocs%2Fmaterials%2Frouting'
          ) {
            routeDataRequests.push(url)
            return {
              json: async () => ({ document: true, ok: false }),
              status: 404,
              text: async () => '',
              url,
            } as Response
          }

          if (url === 'http://local/docs/materials/routing') {
            return {
              status: 200,
              text: async () =>
                `<html><body><script id="eclipsa-resume-final" type="application/eclipsa-resume+json">${htmlPayload}</script></body></html>`,
              url,
            } as Response
          }

          if (url.startsWith('http://local/__eclipsa/loader/')) {
            loaderRequests.push(url)
            return {
              json: async () => ({
                error: { message: 'unexpected loader fetch' },
                ok: false,
              }),
              status: 404,
              url,
            } as Response
          }

          throw new Error(`Unexpected fetch: ${url}`)
        }) as typeof fetch

        const useLayoutLoader = __eclipsaLoader(layoutLoaderId, [], async () => 'live layout')
        const usePageLoader = __eclipsaLoader(pageLoaderId, [], async () => 'live page')

        const PageBody = () => {
          const page = usePageLoader()
          return jsxDEV(
            'h1',
            { children: `page:${String(page.data ?? 'missing')}` },
            null,
            false,
            {},
          )
        }

        const LayoutBody = (props: { children: JSX.Childable }) => {
          const layout = useLayoutLoader()
          return jsxDEV(
            'main',
            {
              children: [
                jsxDEV(
                  'p',
                  { children: `layout:${String(layout.data ?? 'missing')}` },
                  null,
                  false,
                  {},
                ),
                props.children,
              ],
            },
            null,
            false,
            {},
          )
        }

        const Page = __eclipsaComponent(PageBody, 'mobile-click-route-loader-page', () => [])
        const Layout = __eclipsaComponent(
          LayoutBody,
          'mobile-click-route-loader-layout',
          () => [],
          {
            children: 1,
          },
        )

        const currentPage = () => jsxDEV('p', { children: 'home' }, null, false, {})
        const nextRender = () =>
          jsxDEV(
            Layout as any,
            {
              children: jsxDEV(Page as any, {}, null, false, {}),
            },
            null,
            false,
            {},
          )

        container.rootElement = doc.body as unknown as HTMLElement
        container.router = {
          currentPath: { value: '/docs/getting-started/overview' },
          currentRoute: {
            entry: {
              error: null,
              hasMiddleware: false,
              layouts: [],
              loading: null,
              notFound: null,
              page: '/entries/home.js',
              routePath: '/docs/getting-started/overview',
              segments: [
                { kind: 'static', value: 'docs' },
                { kind: 'static', value: 'getting-started' },
                { kind: 'static', value: 'overview' },
              ],
              server: null,
            },
            error: undefined,
            layouts: [],
            params: {},
            pathname: '/docs/getting-started/overview',
            page: {
              metadata: null,
              renderer: currentPage,
              symbol: null,
              url: '/entries/home.js',
            },
            render: () => jsxDEV(currentPage, {}, null, false, {}),
          },
          currentUrl: { value: 'http://local/docs/getting-started/overview' },
          defaultTitle: '',
          isNavigating: { value: false },
          loadedRoutes: new Map([
            [
              '/docs/getting-started/overview::page',
              {
                entry: {
                  error: null,
                  hasMiddleware: false,
                  layouts: [],
                  loading: null,
                  notFound: null,
                  page: '/entries/home.js',
                  routePath: '/docs/getting-started/overview',
                  segments: [
                    { kind: 'static', value: 'docs' },
                    { kind: 'static', value: 'getting-started' },
                    { kind: 'static', value: 'overview' },
                  ],
                  server: null,
                },
                error: undefined,
                layouts: [],
                params: {},
                pathname: '/docs/getting-started/overview',
                page: {
                  metadata: null,
                  renderer: currentPage,
                  symbol: null,
                  url: '/entries/home.js',
                },
                render: () => jsxDEV(currentPage, {}, null, false, {}),
              },
            ],
            [
              '/docs/materials/routing::page',
              {
                entry: {
                  error: null,
                  hasMiddleware: false,
                  layouts: ['/entries/docs-layout.js'],
                  loading: null,
                  notFound: null,
                  page: '/entries/docs-routing.js',
                  routePath: '/docs/materials/routing',
                  segments: [
                    { kind: 'static', value: 'docs' },
                    { kind: 'static', value: 'materials' },
                    { kind: 'static', value: 'routing' },
                  ],
                  server: null,
                },
                error: undefined,
                layouts: [
                  {
                    metadata: null,
                    renderer: Layout as unknown as JSX.Type,
                    symbol: 'mobile-click-route-loader-layout',
                    url: '/entries/docs-layout.js',
                  },
                ],
                params: {},
                pathname: '/docs/materials/routing',
                page: {
                  metadata: null,
                  renderer: Page as unknown as JSX.Type,
                  symbol: 'mobile-click-route-loader-page',
                  url: '/entries/docs-routing.js',
                },
                render: nextRender,
              },
            ],
          ]),
          location: doc.location,
          manifest: [
            {
              error: null,
              hasMiddleware: false,
              layouts: [],
              loading: null,
              notFound: null,
              page: '/entries/home.js',
              routePath: '/docs/getting-started/overview',
              segments: [
                { kind: 'static', value: 'docs' },
                { kind: 'static', value: 'getting-started' },
                { kind: 'static', value: 'overview' },
              ],
              server: null,
            },
            {
              error: null,
              hasMiddleware: false,
              layouts: ['/entries/docs-layout.js'],
              loading: null,
              notFound: null,
              page: '/entries/docs-routing.js',
              routePath: '/docs/materials/routing',
              segments: [
                { kind: 'static', value: 'docs' },
                { kind: 'static', value: 'materials' },
                { kind: 'static', value: 'routing' },
              ],
              server: null,
            },
          ],
          navigate: (async () => {}) as any,
          prefetchedLoaders: new Map(),
          routeModuleBusts: new Map(),
          routePrefetches: new Map(),
          sequence: 0,
        } as unknown as RuntimeContainer['router']

        const link = doc.createElement('a') as unknown as FakeElement
        link.setAttribute('href', '/docs/materials/routing')
        link.setAttribute('data-e-link', '')
        ;(doc.body as unknown as FakeElement).appendChild(link)

        const cleanup = installResumeListeners(container)

        link.dispatchEvent(new FakeMouseEvent('click', link as unknown as EventTarget))
        await container.eventDispatchPromise
        await flushAsync()
        await flushAsync()
        await flushAsync()
        await flushAsync()
        await flushAsync()
        await flushAsync()

        expect(routeDataRequests).toEqual([
          'http://local/__eclipsa/route-data?href=http%3A%2F%2Flocal%2Fdocs%2Fmaterials%2Frouting',
        ])
        expect(loaderRequests).toEqual([])
        expect((doc.body as unknown as FakeElement).textContent).toContain(
          'layout:prefetched layout',
        )
        expect((doc.body as unknown as FakeElement).textContent).toContain('page:prefetched page')
        expect(doc.location.pathname).toBe('/docs/materials/routing')
        cleanup()
      } finally {
        globalThis.fetch = OriginalFetch
        globalThis.MouseEvent = OriginalMouseEvent
        globalThis.HTMLAnchorElement = OriginalHTMLAnchorElement
      }
    })
  })

  it('dispatches delegated keyboard and composition events through document listeners', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedEvent extends Event {
        constructor(
          type: string,
          private readonly eventTarget: EventTarget | null,
        ) {
          super(type)
        }

        override get target() {
          return this.eventTarget
        }
      }

      let keydownHandled = 0
      let compositionHandled = 0

      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const input = doc.createElement('input') as unknown as FakeElement

      input.setAttribute('data-e-onkeydown', 'keydown-symbol:sc0')
      input.setAttribute('data-e-oncompositionend', 'composition-symbol:sc1')
      ;(doc.body as unknown as FakeElement).appendChild(input)

      container.scopes.set('sc0', [])
      container.scopes.set('sc1', [])
      container.imports.set(
        'keydown-symbol',
        Promise.resolve({
          default: () => {
            keydownHandled += 1
          },
        }),
      )
      container.imports.set(
        'composition-symbol',
        Promise.resolve({
          default: () => {
            compositionHandled += 1
          },
        }),
      )

      const cleanup = installResumeListeners(container)
      await flushAsync()

      doc.dispatchEvent(new TargetedEvent('keydown', input as unknown as EventTarget))
      doc.dispatchEvent(new TargetedEvent('compositionend', input as unknown as EventTarget))
      await container.eventDispatchPromise
      await flushAsync()

      expect(keydownHandled).toBe(1)
      expect(compositionHandled).toBe(1)
      cleanup()
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
                void value.value
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

  it('keeps external island roots stable across local signal rerenders', async () => {
    await withFakeNodeGlobal(async () => {
      const events: string[] = []
      let label!: { value: string }

      const ExternalBody = setExternalComponentMeta((() => null) as any, {
        async hydrate(host, props) {
          events.push(`hydrate:${String((props as { label: string }).label)}`)
          ;(host as Element).setAttribute(
            'data-external-label',
            String((props as { label: string }).label),
          )
          return { host }
        },
        kind: 'react',
        async renderToString(props) {
          return `<div data-external-label="${String((props as { label: string }).label)}"><e-slot-host data-e-slot="children"></e-slot-host></div>`
        },
        slots: ['children'],
        async unmount() {
          events.push('unmount')
        },
        async update(instance, host, props) {
          events.push(`update:${String((props as { label: string }).label)}`)
          ;(host as Element).setAttribute(
            'data-external-label',
            String((props as { label: string }).label),
          )
          return instance
        },
      })

      const External = __eclipsaComponent(
        ExternalBody as any,
        'external-stable-child',
        () => [],
        { children: 1 },
        { external: { kind: 'react', slots: ['children'] } },
      )

      const App = __eclipsaComponent(
        () => {
          label = useSignal('first')
          return jsxDEV(
            External as any,
            {
              label: label.value,
              children: jsxDEV('span', { children: 'slot content' }, null, false, {}),
            },
            null,
            false,
            {},
          )
        },
        'external-stable-parent',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'external-stable-parent',
        Promise.resolve({
          default: () =>
            jsxDEV(
              External as any,
              {
                label: label.value,
                children: jsxDEV('span', { children: 'slot content' }, null, false, {}),
              },
              null,
              false,
              {},
            ),
        }),
      )
      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      await flushAsync()

      const host = queryFakeElements(
        doc.body as unknown as FakeNode,
        'e-island-root[data-e-external-root]',
      )[0] as unknown as FakeElement
      expect(host.getAttribute('data-external-label')).toBe('first')

      label.value = 'second'
      await flushDirtyComponents(container)
      await flushAsync()

      const nextHost = queryFakeElements(
        doc.body as unknown as FakeNode,
        'e-island-root[data-e-external-root]',
      )[0] as unknown as FakeElement

      expect(nextHost).toBe(host)
      expect(nextHost.getAttribute('data-external-label')).toBe('second')
      expect(events).toEqual(['hydrate:first', 'update:second'])
    })
  })

  it('preserves external root bodies when a matching client host is still empty', async () => {
    await withFakeNodeGlobal(async () => {
      const doc = new FakeDocument()
      const currentHost = doc.createElement('e-island-root') as unknown as FakeElement
      currentHost.setAttribute('data-e-external-root', 'true')
      currentHost.setAttribute('data-e-external-component', 'c-old')

      const slotHost = doc.createElement('e-slot-host') as unknown as FakeElement
      slotHost.setAttribute('data-e-slot', 'children')
      slotHost.appendChild(doc.createComment('ec:c:c-old.0:start') as unknown as FakeNode)
      slotHost.appendChild(doc.createTextNode('live child') as unknown as FakeNode)
      slotHost.appendChild(doc.createComment('ec:c:c-old.0:end') as unknown as FakeNode)
      currentHost.appendChild(slotHost as unknown as FakeNode)

      const nextHost = doc.createElement('e-island-root') as unknown as FakeElement
      nextHost.setAttribute('data-e-external-root', 'true')
      nextHost.setAttribute('data-e-external-component', 'c-new')

      const preserved = preserveReusableContentInRoots(
        [currentHost as unknown as Node],
        [nextHost as unknown as Node],
      )

      expect(nextHost.childNodes).toEqual([slotHost])
      expect([...preserved]).toContain('c-old.0')
    })
  })

  it('runs external island cleanup when the boundary is removed', async () => {
    await withFakeNodeGlobal(async () => {
      const events: string[] = []
      let visible!: { value: boolean }

      const ExternalBody = setExternalComponentMeta((() => null) as any, {
        async hydrate(host) {
          ;(host as Element).setAttribute('data-external-mounted', 'true')
          events.push('hydrate')
          return { host }
        },
        kind: 'vue',
        async renderToString() {
          return '<div data-external-mounted="true"></div>'
        },
        slots: ['children'],
        async unmount() {
          events.push('unmount')
        },
        async update(instance) {
          return instance
        },
      })

      const External = __eclipsaComponent(
        ExternalBody as any,
        'external-cleanup-child',
        () => [],
        { children: 1 },
        { external: { kind: 'vue', slots: ['children'] } },
      )

      const App = __eclipsaComponent(
        () => {
          visible = useSignal(true)
          return visible.value
            ? jsxDEV(External as any, { children: null }, null, false, {})
            : jsxDEV('div', { children: 'fallback' }, null, false, {})
        },
        'external-cleanup-parent',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'external-cleanup-parent',
        Promise.resolve({
          default: () =>
            visible.value
              ? jsxDEV(External as any, { children: null }, null, false, {})
              : jsxDEV('div', { children: 'fallback' }, null, false, {}),
        }),
      )
      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      await flushAsync()
      expect(events).toEqual(['hydrate'])

      visible.value = false
      await flushDirtyComponents(container)
      await flushAsync()

      expect(events).toEqual(['hydrate', 'unmount'])
      expect(
        queryFakeElements(doc.body as unknown as FakeNode, 'e-island-root[data-e-external-root]'),
      ).toHaveLength(0)
      expect((doc.body as unknown as FakeElement).textContent).toContain('fallback')
    })
  })

  it('keeps signal subscriptions after resumable signal rerenders', async () => {
    await withFakeNodeGlobal(async () => {
      let count!: { value: number }

      const CounterBody = () => {
        count = useSignal(0)
        return jsxDEV('button', { children: `Count ${count.value}` }, null, false, {})
      }

      const Counter = __eclipsaComponent(CounterBody, 'component-counter', () => [])

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
        parent.childNodes.find((node) => node instanceof FakeElement) as FakeElement | undefined

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
        renderEffectCleanupSlot: createCleanupSlot(),
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
                  style: open.value
                    ? 'max-height: 64px; opacity: 1'
                    : 'max-height: 0px; opacity: 0',
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
        renderClientInsertable(
          jsxDEV(Dir as any, { title: 'Materials' }, null, false, {}),
          container,
        ),
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
      const doc = container.doc as unknown as FakeDocument
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
        renderEffectCleanupSlot: createCleanupSlot(),
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
      container.imports.set(
        'component-local-signal',
        Promise.resolve({
          default: () => {
            const panel = doc.createElement('div')
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
        const getEffectCount = () => (signalRecord.effect ? 1 : (signalRecord.effects?.size ?? 0))

        expect(getEffectCount()).toBe(0)

        await restoreResumedLocalSignalEffects(container)

        const livePanel = parent.childNodes[1] as FakeElement | undefined
        expect(livePanel).toBeInstanceOf(FakeElement)
        expect(livePanel).not.toBe(initialPanel)
        expect(livePanel?.getAttribute('style')).toBe('opacity: 1')
        expect(getEffectCount()).toBe(1)

        open.value = false

        expect(container.dirty.size).toBe(0)
        expect(parent.childNodes[1]).toBe(livePanel)
        expect(livePanel?.getAttribute('style')).toBe('opacity: 0')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('rerenders resumed components when a local signal is read in render and also drives an effect', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const parent = doc.body as unknown as FakeElement
      const start = doc.createComment('ec:c:c0:start') as unknown as FakeNode
      const initialPanel = new FakeElement('div')
      const end = doc.createComment('ec:c:c0:end') as unknown as FakeNode
      const originalDocument = globalThis.document

      parent.appendChild(start)
      parent.appendChild(initialPanel)
      parent.appendChild(end)

      createDetachedRuntimeSignal(container, 's0', '')

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
        renderEffectCleanupSlot: createCleanupSlot(),
        reuseExistingDomOnActivate: true,
        reuseProjectionSlotDomOnActivate: false,
        scopeId: 'sc0',
        signalIds: ['s0'],
        start: start as unknown as Comment,
        symbol: 'component-local-bind-rerender',
        suspensePromise: null,
        visibleCount: 0,
        watchCount: 0,
      })
      container.scopes.set('sc0', [])
      container.imports.set(
        'component-local-bind-rerender',
        Promise.resolve({
          default: () => {
            const query = useSignal('')
            return jsxDEV(
              'div',
              {
                children: [
                  jsxDEV('input', { 'bind:value': query, type: 'text' }, null, false, {}),
                  jsxDEV('span', { children: query.value || 'empty' }, null, false, {}),
                ],
              },
              null,
              false,
              {},
            )
          },
        }),
      )

      const findFirst = (tagName: string) => {
        const visit = (node: FakeNode): FakeElement | null => {
          if (node instanceof FakeElement && node.tagName === tagName) {
            return node
          }
          for (const child of node.childNodes) {
            const found = visit(child)
            if (found) {
              return found
            }
          }
          return null
        }
        return visit(parent as unknown as FakeNode)
      }

      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        await restoreResumedLocalSignalEffects(container)

        const input = findFirst('input')
        const span = findFirst('span')
        expect(input).toBeTruthy()
        expect(span?.textContent).toBe('empty')

        if (!input) {
          throw new Error('Expected rendered input.')
        }

        input.value = 'ov'
        expect(syncBoundElementSignal(container, input as unknown as EventTarget)).toBe(true)

        await flushAsync()
        await new Promise((resolve) => setTimeout(resolve, 0))

        const nextSpan = findFirst('span')
        expect(nextSpan?.textContent).toBe('ov')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('runs resumed watch callbacks from restored subscriptions without activating the component', async () => {
    await withFakeNodeGlobal(async () => {
      const OriginalDocument = globalThis.Document
      const originalWindow = globalThis.window
      const doc = new FakeDocument() as unknown as Document
      ;(doc as unknown as { location: Location }).location = {
        hash: '',
        href: 'http://example.com/',
        origin: 'http://example.com',
        pathname: '/',
        search: '',
      } as Location
      const body = (doc as unknown as FakeDocument).body as unknown as FakeElement
      body.appendChild(
        (doc as unknown as FakeDocument).createComment('ec:c:c0:start') as unknown as FakeNode,
      )
      body.appendChild(
        (doc as unknown as FakeDocument).createComment('ec:c:c0:end') as unknown as FakeNode,
      )

      const events: string[] = []
      ;(globalThis as typeof globalThis & { Document: typeof Document }).Document =
        FakeDocument as unknown as typeof Document
      ;(globalThis as { window: Window & typeof globalThis }).window = (
        doc as unknown as FakeDocument
      ).defaultView as unknown as Window & typeof globalThis
      try {
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
              symbol: 'component-watch-resume',
              visibleCount: 0,
              watchCount: 1,
            },
          },
          loaders: {},
          scopes: {
            sc0: [],
            sc1: [{ __eclipsa_type: 'ref', kind: 'signal', token: 's0' }],
          },
          signals: {
            s0: 0,
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
          watches: {
            'c0:w0': {
              componentId: 'c0',
              mode: 'explicit',
              scope: 'sc1',
              signals: ['s0'],
              symbol: 'watch-resume-symbol',
            },
          },
        })

        container.imports.set(
          'watch-resume-symbol',
          Promise.resolve({
            default: (scope: unknown[], propsOrArg?: unknown) => {
              const [count] = scope as [{ value: number }]
              const mode = propsOrArg as 'run' | 'track' | undefined
              if (mode === 'track') {
                void count.value
                return
              }
              events.push(`run:${count.value}`)
            },
          }),
        )

        container.signals.get('s0')!.handle.value = 1
        await flushAsync()
        await flushAsync()

        expect(events).toEqual(['run:1'])
        expect(container.components.get('c0')?.active).toBe(false)
      } finally {
        globalThis.Document = OriginalDocument
        if (originalWindow === undefined) {
          delete (globalThis as { window?: Window }).window
        } else {
          globalThis.window = originalWindow
        }
      }
    })
  })

  it('does not rerun resumed watches when restoring local signal effects on the client', async () => {
    await withFakeNodeGlobal(async () => {
      const OriginalDocument = globalThis.Document
      const originalWindow = globalThis.window
      const doc = new FakeDocument() as unknown as Document
      ;(doc as unknown as { location: Location }).location = {
        hash: '',
        href: 'http://example.com/',
        origin: 'http://example.com',
        pathname: '/',
        search: '',
      } as Location
      const body = (doc as unknown as FakeDocument).body as unknown as FakeElement
      body.appendChild(
        (doc as unknown as FakeDocument).createComment('ec:c:c0:start') as unknown as FakeNode,
      )
      body.appendChild(new FakeElement('div'))
      body.appendChild(
        (doc as unknown as FakeDocument).createComment('ec:c:c0:end') as unknown as FakeNode,
      )

      const events: string[] = []
      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { Document: typeof Document }).Document =
        FakeDocument as unknown as typeof Document
      ;(globalThis as { window: Window & typeof globalThis }).window = (
        doc as unknown as FakeDocument
      ).defaultView as unknown as Window & typeof globalThis
      try {
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
              symbol: 'component-watch-resume',
              visibleCount: 0,
              watchCount: 1,
            },
          },
          loaders: {},
          scopes: {
            sc0: [],
            sc1: [{ __eclipsa_type: 'ref', kind: 'signal', token: 's0' }],
          },
          signals: {
            s0: 0,
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
          watches: {
            'c0:w0': {
              componentId: 'c0',
              mode: 'explicit',
              scope: 'sc1',
              signals: ['s0'],
              symbol: 'watch-resume-symbol',
            },
          },
        })

        container.imports.set(
          'component-watch-resume',
          Promise.resolve({
            default: () => {
              const count = useSignal(0)
              useWatch(
                __eclipsaWatch(
                  'watch-resume-symbol',
                  () => {
                    events.push(`run:${count.value}`)
                  },
                  () => [count],
                ),
                [count],
              )
              return jsxDEV('div', { children: count.value }, null, false, {})
            },
          }),
        )

        ;(globalThis as typeof globalThis & { document: Document }).document = doc
        await restoreResumedLocalSignalEffects(container)

        expect(events).toEqual([])

        container.signals.get('s0')!.handle.value = 1
        expect(events).toEqual(['run:1'])
      } finally {
        globalThis.Document = OriginalDocument
        globalThis.document = originalDocument
        if (originalWindow === undefined) {
          delete (globalThis as { window?: Window }).window
        } else {
          globalThis.window = originalWindow
        }
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
        insert(renderPanel, host as unknown as Node, marker as unknown as Node)
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
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
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
        'ec:c:c0.$iinsert-marker.0:start',
        'ec:c:c0.$iinsert-marker.0:end',
        'ec:c:c0.$iinsert-marker.1:start',
        'ec:c:c0.$iinsert-marker.1:end',
      ])

      ;(panel as FakeElement & { __debugMarker?: string }).__debugMarker = 'live'
      open.value = false

      const nextOuter = host.childNodes[1] as FakeElement | undefined
      const nextPanel = nextOuter?.childNodes[0] as FakeElement | undefined
      expect(nextPanel).toBe(panel)
      expect((nextPanel as FakeElement & { __debugMarker?: string }).__debugMarker).toBe('live')
      expect(nextPanel?.getAttribute('style')).toBe('opacity: 0; max-height: 0px')
      expect(collectComments(nextPanel?.childNodes ?? [])).toEqual([
        'ec:c:c0.$iinsert-marker.0:start',
        'ec:c:c0.$iinsert-marker.0:end',
        'ec:c:c0.$iinsert-marker.1:start',
        'ec:c:c0.$iinsert-marker.1:end',
      ])
    })
  })

  it('keeps insert effects targeting the live parent after nodes move during an in-place patch', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const doc = container.doc as unknown as FakeDocument
      const host = new FakeElement('div')
      host.ownerDocument = doc
      const originalInsertBefore = host.insertBefore.bind(host)
      host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
        if (referenceNode && referenceNode.parentNode !== host) {
          throw new Error('insertBefore reference node must be a child of the target parent')
        }
        return originalInsertBefore(node, referenceNode)
      }) as typeof host.insertBefore
      const detachedParent = new FakeElement('div')
      detachedParent.ownerDocument = doc
      const marker = new FakeComment('marker')
      detachedParent.appendChild(marker)
      const count = createDetachedRuntimeSignal(container, 's0', 0)

      const Child = __eclipsaComponent(
        () => jsxDEV('span', { children: String(count.value) }, null, false, {}),
        'insert-live-parent-child',
        () => [],
      )

      container.imports.set(
        'insert-live-parent-child',
        Promise.resolve({
          default: () => jsxDEV('span', { children: String(count.value) }, null, false, {}),
        }),
      )

      withRuntimeContainer(container, () => {
        insert(
          asInsertable(jsxDEV(Child as any, {}, null, false, {})),
          detachedParent as unknown as Node,
          marker as unknown as Node,
        )
      })

      for (const node of Array.from(detachedParent.childNodes)) {
        host.appendChild(node)
      }

      expect(host.textContent).toContain('0')

      count.value = 1
      await flushDirtyComponents(container)

      expect(host.textContent).toContain('1')
      expect(detachedParent.textContent).not.toContain('1')
    })
  })

  it('keeps detached insert renders off the live DOM when the current render is not reusing existing nodes', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const doc = container.doc as unknown as FakeDocument
        const createTreeWalker = vi.spyOn(doc, 'createTreeWalker')
        const liveParent = new FakeElement('div')
        liveParent.ownerDocument = doc
        const liveText = new FakeText('live')
        liveText.ownerDocument = doc
        const liveMarker = new FakeComment('ec:i:shared-marker')
        liveMarker.ownerDocument = doc
        liveParent.appendChild(liveText)
        liveParent.appendChild(liveMarker)
        ;(doc.body as unknown as FakeElement).appendChild(liveParent)

        const DetachedBody = () => {
          const root = document.createElement('div')
          const marker = document.createComment('ec:i:shared-marker')
          root.appendChild(marker)
          insert('detached', root as unknown as Node, marker as unknown as Node)
          return root as unknown as JSX.Element
        }

        const Detached = __eclipsaComponent(DetachedBody, 'detached-insert-target', () => [])

        const rendered = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Detached as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        expect(liveParent.textContent).toBe('liveec:i:shared-marker')
        const detachedRoot = rendered[1] as FakeElement | undefined
        expect(detachedRoot).toBeInstanceOf(FakeElement)
        expect(detachedRoot?.textContent).toContain('detached')
        expect(createTreeWalker).not.toHaveBeenCalled()
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('reconnects existing owner-insert ranges when a boundary activates over resumed DOM', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()

      const PanelBody = () =>
        jsxDEV('div', { 'data-panel': '', children: 'panel' }, null, false, {})

      const Panel = __eclipsaComponent(PanelBody, 'resume-owner-insert-panel', () => [])

      const SearchDialogBody = () => {
        const host = document.createElement('div')
        const marker = document.createComment('ec:i:resume-owner-range')
        host.appendChild(marker)
        insert(
          asInsertable(jsxDEV(Panel as any, {}, null, false, {})),
          host as unknown as Node,
          marker,
        )
        return host as unknown as JSX.Element
      }

      const SearchDialog = __eclipsaComponent(
        SearchDialogBody,
        'resume-owner-insert-search-dialog',
        () => [],
      )

      container.imports.set(
        'resume-owner-insert-search-dialog',
        Promise.resolve({
          default: () => SearchDialogBody(),
        }),
      )
      container.imports.set(
        'resume-owner-insert-panel',
        Promise.resolve({
          default: () => PanelBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(SearchDialog as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        expect(queryFakeElements(host, 'div[data-panel]')).toHaveLength(1)

        const boundary = [...container.components.values()].find(
          (component) => component.symbol === 'resume-owner-insert-search-dialog',
        )
        expect(boundary).toBeTruthy()

        boundary!.active = false
        boundary!.reuseExistingDomOnActivate = true
        boundary!.reuseProjectionSlotDomOnActivate = false
        container.dirty.add(boundary!.id)

        await flushDirtyComponents(container)

        expect(queryFakeElements(host, 'div[data-panel]')).toHaveLength(1)
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('does not duplicate nested managed children when a resumed parent boundary is reactivated', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()

      const ChildBody = () =>
        jsxDEV('div', { 'data-panel': '', children: 'panel' }, null, false, {})
      const Child = __eclipsaComponent(ChildBody, 'resume-nested-child', () => [])

      const ParentBody = () =>
        jsxDEV(
          'div',
          {
            children: jsxDEV(
              'div',
              {
                class: 'mx-auto',
                children: jsxDEV(Child as any, {}, null, false, {}),
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

      const Parent = __eclipsaComponent(ParentBody, 'resume-nested-parent', () => [])

      container.imports.set(
        'resume-nested-parent',
        Promise.resolve({
          default: () => ParentBody(),
        }),
      )
      container.imports.set(
        'resume-nested-child',
        Promise.resolve({
          default: () => ChildBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Parent as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        expect(queryFakeElements(host, 'div[data-panel]')).toHaveLength(1)

        for (const component of container.components.values()) {
          component.active = false
          component.reuseExistingDomOnActivate = true
          component.reuseProjectionSlotDomOnActivate = false
        }

        const parentBoundary = [...container.components.values()].find(
          (component) => component.symbol === 'resume-nested-parent',
        )
        expect(parentBoundary).toBeTruthy()
        container.dirty.add(parentBoundary!.id)

        await flushDirtyComponents(container)

        expect(queryFakeElements(host, 'div[data-panel]')).toHaveLength(1)
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('keeps inserted child event scopes live across a fresh route-style root render', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()

      const SearchDialogBody = () => {
        const open = useSignal(false)
        return jsxDEV(
          'button',
          {
            'aria-controls': 'docs-search-dialog',
            children: open.value ? 'open' : 'closed',
            onClick: __eclipsaEvent('click', 'fresh-route-search-open', () => [open]),
            type: 'button',
          },
          null,
          false,
          {},
        )
      }

      const SearchDialog = __eclipsaComponent(
        SearchDialogBody,
        'fresh-route-search-dialog',
        () => [],
      )

      const LayoutBody = () => {
        const nav = document.createElement('nav')
        const marker = document.createComment('ec:i:search-trigger')
        nav.appendChild(marker)
        insert(asInsertable(jsxDEV(SearchDialog as any, {}, null, false, {})), nav, marker)
        return nav as unknown as JSX.Element
      }

      const Layout = __eclipsaComponent(LayoutBody, 'fresh-route-layout', () => [])
      const RouteRootBody = () => jsxDEV(Layout as any, {}, null, false, {})
      const RouteRoot = __eclipsaComponent(RouteRootBody, 'fresh-route-root', () => [])

      container.imports.set(
        'fresh-route-root',
        Promise.resolve({
          default: () => RouteRootBody(),
        }),
      )
      container.imports.set(
        'fresh-route-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'fresh-route-search-dialog',
        Promise.resolve({
          default: () => SearchDialogBody(),
        }),
      )
      container.imports.set(
        'fresh-route-search-open',
        Promise.resolve({
          default: (scope: unknown[]) => {
            const [open] = scope as [{ value: boolean }]
            open.value = true
          },
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(RouteRoot as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const button = queryFakeElements(host, 'button[aria-controls]')[0] as unknown as
          | FakeElement
          | undefined
        expect(button).toBeTruthy()
        expect(button?.textContent).toBe('closed')

        await dispatchDocumentEvent(
          container,
          new TargetedClickEvent(button as unknown as EventTarget),
        )
        await flushDirtyComponents(container)

        expect(button?.textContent).toBe('open')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('preloads projection slot render refs before rerendering resumable children', async () => {
    await withFakeNodeGlobal(async () => {
      let open!: { value: boolean }

      const PageLinkBody = (props: { label: string }) =>
        jsxDEV('span', { children: props.label }, null, false, {})

      const PageLink = __eclipsaComponent(PageLinkBody, 'component-page-link', () => [])

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

      const Dir = __eclipsaComponent(DirBody, 'component-dir', () => [], { children: 1 })

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

      const Probe = __eclipsaComponent(ProbeBody, 'probe-route-slot-patch-symbol', () => [], {
        children: 1,
      })

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

  it('does not duplicate projection slot bodies when a parent shell falls back to replacement', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/a')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/a',
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

      const ChildBody = () =>
        jsxDEV('article', { 'data-page': '', children: 'page content' }, null, false, {})
      const Child = __eclipsaComponent(ChildBody, 'projection-slot-preserve-child', () => [])

      const ParentBody = (props: { children?: unknown }) => {
        const location = useLocation()
        return jsxDEV(
          'section',
          {
            children: [
              location.pathname === '/docs/a'
                ? jsxDEV('p', { children: 'intro' }, null, false, {})
                : null,
              jsxDEV('div', { children: props.children }, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Parent = __eclipsaComponent(ParentBody, 'projection-slot-preserve-parent', () => [], {
        children: 1,
      })

      container.imports.set(
        'projection-slot-preserve-parent',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            ParentBody((propsOrArg as { children?: unknown } | undefined) ?? {}),
        }),
      )
      container.imports.set(
        'projection-slot-preserve-child',
        Promise.resolve({
          default: () => ChildBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(
            jsxDEV(
              Parent as any,
              {
                children: jsxDEV(Child as any, {}, null, false, {}),
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

        expect(queryFakeElements(host, 'article[data-page]')).toHaveLength(1)
        expect(host.textContent).toContain('intro')
        expect(host.textContent).toContain('page content')

        currentPath.value = '/docs/b'
        currentUrl.value = 'http://local/docs/b'
        await flushDirtyComponents(container)

        expect(queryFakeElements(host, 'article[data-page]')).toHaveLength(1)
        expect(host.textContent).not.toContain('intro')
        expect(host.textContent).toContain('page content')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('keeps fresh projection slot bodies when the current shell has no slot content to preserve', () => {
    withFakeNodeGlobal(() => {
      const doc = new FakeDocument()
      const current = doc.createElement('section') as unknown as FakeElement
      const next = doc.createElement('section') as unknown as FakeElement

      current.appendChild(doc.createComment('ec:s:parent:children:0:start') as unknown as FakeNode)
      current.appendChild(doc.createComment('ec:s:parent:children:0:end') as unknown as FakeNode)

      next.appendChild(doc.createComment('ec:s:parent:children:0:start') as unknown as FakeNode)
      const article = doc.createElement('article') as unknown as FakeElement
      article.setAttribute('data-page', '')
      article.appendChild(doc.createTextNode('page content') as unknown as FakeNode)
      next.appendChild(article as unknown as FakeNode)
      next.appendChild(doc.createComment('ec:s:parent:children:0:end') as unknown as FakeNode)

      expect(
        tryPatchElementShellInPlace(current as unknown as Element, next as unknown as Element),
      ).toBe(true)

      expect(queryFakeElements(current as unknown as FakeNode, 'article[data-page]')).toHaveLength(
        1,
      )
      expect(current.textContent).toContain('page content')
      expect(collectComments([current as unknown as FakeNode])).toEqual([
        'ec:s:parent:children:0:start',
        'ec:s:parent:children:0:end',
      ])
    })
  })

  it('records managed attribute snapshots for shell patch children after moving them into place', () => {
    withFakeNodeGlobal(() => {
      const doc = new FakeDocument()
      const current = doc.createElement('section') as unknown as FakeElement
      const next = doc.createElement('section') as unknown as FakeElement

      const staleChild = doc.createElement('article') as unknown as FakeElement
      staleChild.setAttribute('data-page', 'old')
      current.appendChild(staleChild)

      const freshChild = doc.createElement('article') as unknown as FakeElement
      freshChild.setAttribute('data-page', 'new')
      freshChild.setAttribute('class', 'active')
      next.appendChild(freshChild)

      expect(
        tryPatchElementShellInPlace(current as unknown as Element, next as unknown as Element),
      ).toBe(true)

      expect(current.firstChild).toBe(freshChild)
      expect(getManagedAttributeSnapshot(freshChild as unknown as Element)).toEqual(
        new Set(['data-page', 'class']),
      )
    })
  })

  it('keeps the detached next shell tree intact after an in-place shell patch', () => {
    withFakeNodeGlobal(() => {
      const doc = new FakeDocument()
      const current = doc.createElement('button') as unknown as FakeElement
      current.setAttribute('type', 'button')
      const next = doc.createElement('button') as unknown as FakeElement
      next.setAttribute('type', 'button')

      const currentIcon = doc.createElement('div') as unknown as FakeElement
      currentIcon.setAttribute('data-icon', 'current')
      const currentTitle = doc.createElement('div') as unknown as FakeElement
      currentTitle.appendChild(doc.createTextNode('Current') as unknown as FakeNode)
      const currentMarker = doc.createComment('ec:i:7') as unknown as FakeNode
      current.appendChild(currentIcon)
      current.appendChild(currentTitle)
      current.appendChild(currentMarker)

      const nextIcon = doc.createElement('div') as unknown as FakeElement
      nextIcon.setAttribute('data-icon', 'next')
      const nextTitle = doc.createElement('div') as unknown as FakeElement
      nextTitle.appendChild(doc.createTextNode('Materials') as unknown as FakeNode)
      const nextMarker = doc.createComment('ec:i:16') as unknown as FakeNode
      next.appendChild(nextIcon)
      next.appendChild(nextTitle)
      next.appendChild(nextMarker)

      expect(
        tryPatchElementShellInPlace(current as unknown as Element, next as unknown as Element),
      ).toBe(true)

      expect(current.textContent).toContain('Materials')
      expect(next.textContent).toContain('Materials')
      expect(current.childNodes).toHaveLength(3)
      expect(next.childNodes).toHaveLength(3)
      expect(collectComments([next as unknown as FakeNode])).toEqual(['ec:i:16'])
    })
  })

  it('does not duplicate resumed owner ranges when insert marker ownership has not been measured yet', () => {
    withFakeNodeGlobal(() => {
      const doc = new FakeDocument()
      const current = doc.createElement('section') as unknown as FakeElement
      const next = doc.createElement('section') as unknown as FakeElement

      current.appendChild(doc.createComment('ec:c:c0.$i0.0:start') as unknown as FakeNode)
      const currentPanel = doc.createElement('div') as unknown as FakeElement
      currentPanel.setAttribute('data-panel', '')
      currentPanel.appendChild(doc.createTextNode('panel') as unknown as FakeNode)
      current.appendChild(currentPanel)
      current.appendChild(doc.createComment('ec:c:c0.$i0.0:end') as unknown as FakeNode)
      current.appendChild(doc.createComment('ec:i:42') as unknown as FakeNode)

      next.appendChild(doc.createComment('ec:i:42') as unknown as FakeNode)
      next.appendChild(doc.createComment('ec:c:c0.$i0.0:start') as unknown as FakeNode)
      const nextPanel = doc.createElement('div') as unknown as FakeElement
      nextPanel.setAttribute('data-panel', '')
      nextPanel.appendChild(doc.createTextNode('panel') as unknown as FakeNode)
      next.appendChild(nextPanel)
      next.appendChild(doc.createComment('ec:c:c0.$i0.0:end') as unknown as FakeNode)

      expect(
        tryPatchElementShellInPlace(current as unknown as Element, next as unknown as Element),
      ).toBe(true)

      expect(queryFakeElements(current as unknown as FakeNode, 'div[data-panel]')).toHaveLength(1)
      expect(collectComments([current as unknown as FakeNode])).toEqual([
        'ec:i:42',
        'ec:c:c0.$i0.0:start',
        'ec:c:c0.$i0.0:end',
      ])
    })
  })

  it('does not preserve component boundaries through insert markers during shell patching', () => {
    withFakeNodeGlobal(() => {
      const doc = new FakeDocument()
      const current = doc.createElement('section') as unknown as FakeElement
      const next = doc.createElement('section') as unknown as FakeElement

      const start = doc.createComment('ec:c:c0.$i0.0:start') as unknown as FakeNode
      const panel = doc.createElement('div') as unknown as FakeElement
      panel.setAttribute('data-panel', '')
      panel.appendChild(doc.createTextNode('panel') as unknown as FakeNode)
      const end = doc.createComment('ec:c:c0.$i0.0:end') as unknown as FakeNode
      const marker = doc.createComment('ec:i:42') as unknown as FakeNode

      current.appendChild(start)
      current.appendChild(panel)
      current.appendChild(end)
      current.appendChild(marker)
      rememberInsertMarkerRange(
        marker as unknown as Comment,
        [start, panel, end] as unknown as Node[],
      )

      next.appendChild(doc.createComment('ec:i:42') as unknown as FakeNode)

      expect(
        tryPatchElementShellInPlace(current as unknown as Element, next as unknown as Element),
      ).toBe(true)

      expect(queryFakeElements(current as unknown as FakeNode, 'div[data-panel]')).toHaveLength(0)
      expect(collectComments([current as unknown as FakeNode])).toEqual(['ec:i:42'])
    })
  })

  it('treats hidden route params as render-affecting props during component reuse checks', () => {
    withFakeNodeGlobal(() => {
      const PageBody = () => {
        const params = useRouteParams()
        return jsxDEV(
          'div',
          {
            children: Array.isArray(params.slug)
              ? params.slug.join('/')
              : String(params.slug ?? ''),
          },
          null,
          false,
          {},
        )
      }

      const Page = __eclipsaComponent(PageBody, 'route-params-rerender-page', () => [])
      const container = createContainer()

      const firstProps: Record<string, unknown> = {}
      Object.defineProperty(firstProps, '__eclipsa_route_params', {
        configurable: true,
        enumerable: false,
        value: {
          slug: ['getting-started', 'overview'],
        },
      })

      const firstNodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(Page as any, firstProps, null, false, {}), container),
      ) as unknown as FakeNode[]
      const firstHost = new FakeElement('div')
      for (const node of firstNodes) {
        firstHost.appendChild(node)
      }
      expect(firstHost.textContent).toContain('getting-started/overview')

      container.rootChildCursor = 0

      const secondProps: Record<string, unknown> = {}
      Object.defineProperty(secondProps, '__eclipsa_route_params', {
        configurable: true,
        enumerable: false,
        value: {
          slug: ['materials', 'routing'],
        },
      })

      const secondNodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(Page as any, secondProps, null, false, {}), container),
      ) as unknown as FakeNode[]
      const secondHost = new FakeElement('div')
      for (const node of secondNodes) {
        secondHost.appendChild(node)
      }

      expect(secondHost.textContent).toContain('materials/routing')
      expect(secondHost.textContent).not.toContain('getting-started/overview')
    })
  })

  it('keeps managed Link elements stable when route-location subscribers rerender', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(
        container,
        '$router:path',
        '/loader-nav/overview',
      )
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
        const isActive = useComputed(
          () => location.pathname === props.href,
          [() => location.pathname, () => props.href],
        )

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
            PageLinkBody(propsOrArg as { href: string; label: string; stateTestId: string }),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
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

  it('keeps nested dialog shells stable after a route-location parent rerender followed by a local child update', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      let query!: { value: string }

      const SearchResultsBodyRender = (props: { query: string }) => {
        if (props.query.trim() === '') {
          return jsxDEV(
            'div',
            { children: 'Search titles, headings, content, and code.' },
            null,
            false,
            {},
          )
        }
        return jsxDEV('div', { children: 'No results found.' }, null, false, {})
      }

      const SearchResultsBody = __eclipsaComponent(
        SearchResultsBodyRender,
        'search-results-body-route-parent',
        () => [],
      )

      const SearchDialogBody = () => {
        query = useSignal('')
        return jsxDEV(
          'div',
          {
            children: [
              jsxDEV('button', { children: 'Search docs' }, null, false, {}),
              jsxDEV(
                'dialog',
                {
                  children: [
                    jsxDEV('input', { type: 'text', value: query.value }, null, false, {}),
                    jsxDEV(SearchResultsBody as any, { query: query.value }, null, false, {}),
                  ],
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

      const SearchDialog = __eclipsaComponent(
        SearchDialogBody,
        'search-dialog-route-parent',
        () => [],
      )

      const LayoutBody = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: [
              jsxDEV('span', { children: location.pathname }, null, false, {}),
              jsxDEV(SearchDialog as any, {}, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'layout-route-parent', () => [])

      container.imports.set(
        'layout-route-parent',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'search-dialog-route-parent',
        Promise.resolve({
          default: () => SearchDialogBody(),
        }),
      )
      container.imports.set(
        'search-results-body-route-parent',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            SearchResultsBodyRender(propsOrArg as { query: string }),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = container.doc?.body as unknown as FakeElement
        host.childNodes = []
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const findFirst = (tagName: string) => {
          const visit = (node: FakeNode): FakeElement | null => {
            if (node instanceof FakeElement && node.tagName === tagName) {
              return node
            }
            for (const child of node.childNodes) {
              const found = visit(child)
              if (found) {
                return found
              }
            }
            return null
          }
          return visit(host)
        }

        currentPath.value = '/docs/quick-start'
        currentUrl.value = 'http://local/docs/quick-start'
        await flushDirtyComponents(container)

        const hostContainsNode = (target: FakeNode | undefined) => {
          if (!target) {
            return false
          }
          const find = (node: FakeNode): boolean => {
            if (node === target) {
              return true
            }
            return node.childNodes.some((child) => find(child))
          }
          return find(host)
        }

        expect(
          hostContainsNode(container.components.get('c0.0')?.start as FakeNode | undefined),
        ).toBe(true)
        expect(
          hostContainsNode(container.components.get('c0.0.0')?.start as FakeNode | undefined),
        ).toBe(true)

        const trigger = findFirst('button')
        const dialog = findFirst('dialog')
        expect(trigger).toBeTruthy()
        expect(dialog).toBeTruthy()
        ;(trigger as FakeElement & { __debugMarker?: string }).__debugMarker = 'trigger-live'
        ;(dialog as FakeElement & { __debugMarker?: string }).__debugMarker = 'dialog-live'
        dialog?.showModal()
        expect(dialog?.open).toBe(true)

        query.value = 'o'
        await flushDirtyComponents(container)
        await new Promise((resolve) => setTimeout(resolve, 0))

        const nextTrigger = findFirst('button')
        const nextDialog = findFirst('dialog')
        expect(nextTrigger).toBe(trigger)
        expect(nextDialog).toBe(dialog)
        expect((nextTrigger as FakeElement & { __debugMarker?: string }).__debugMarker).toBe(
          'trigger-live',
        )
        expect((nextDialog as FakeElement & { __debugMarker?: string }).__debugMarker).toBe(
          'dialog-live',
        )
        expect(nextDialog?.open).toBe(true)
        expect(nextDialog?.textContent).toContain('No results found.')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('keeps dialog shells stable when a local update lands during the opening rerender flush', async () => {
    await withFakeNodeGlobal(async () => {
      let open!: { value: boolean }
      let query!: { value: string }

      const SearchResultsBodyRender = (props: { query: string }) => {
        if (props.query.trim() === '') {
          return jsxDEV(
            'div',
            { children: 'Search titles, headings, content, and code.' },
            null,
            false,
            {},
          )
        }

        return jsxDEV('div', { children: 'No results found.' }, null, false, {})
      }

      const SearchResultsBody = __eclipsaComponent(
        SearchResultsBodyRender,
        'search-results-body-overlap-open',
        () => [],
      )

      const SearchDialogBody = () => {
        open = useSignal(false)
        query = useSignal('')
        return jsxDEV(
          'div',
          {
            class: 'contents',
            children: [
              jsxDEV(
                'button',
                {
                  'aria-expanded': open.value,
                  children: 'Search docs',
                },
                null,
                false,
                {},
              ),
              jsxDEV(
                'dialog',
                {
                  children: jsxDEV(
                    'div',
                    {
                      children: jsxDEV(
                        'div',
                        {
                          children: [
                            jsxDEV(
                              'div',
                              {
                                children: [
                                  jsxDEV('div', { children: 'search' }, null, false, {}),
                                  jsxDEV(
                                    'input',
                                    { type: 'text', value: query.value },
                                    null,
                                    false,
                                    {},
                                  ),
                                  jsxDEV('button', { children: 'close' }, null, false, {}),
                                ],
                              },
                              null,
                              false,
                              {},
                            ),
                            jsxDEV(
                              'div',
                              {
                                children: jsxDEV(
                                  SearchResultsBody as any,
                                  { query: query.value },
                                  null,
                                  false,
                                  {},
                                ),
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
              ),
            ],
          },
          null,
          false,
          {},
        )
      }

      const SearchDialog = __eclipsaComponent(
        SearchDialogBody,
        'search-dialog-overlap-open',
        () => [],
      )

      const container = createContainer()
      container.imports.set(
        'search-dialog-overlap-open',
        Promise.resolve({
          default: () => SearchDialogBody(),
        }),
      )
      container.imports.set(
        'search-results-body-overlap-open',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            SearchResultsBodyRender(propsOrArg as { query: string }),
        }),
      )

      const host = new FakeElement('div')
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(SearchDialog as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        host.appendChild(node)
      }

      const findFirst = (tagName: string) => {
        const visit = (node: FakeNode): FakeElement | null => {
          if (node instanceof FakeElement && node.tagName === tagName) {
            return node
          }
          for (const child of node.childNodes) {
            const found = visit(child)
            if (found) {
              return found
            }
          }
          return null
        }
        return visit(host)
      }

      const dialog = findFirst('dialog')
      const button = findFirst('button')
      const wrapper = findFirst('div')
      expect(dialog).toBeTruthy()
      expect(button).toBeTruthy()
      expect(wrapper).toBeTruthy()
      ;(dialog as FakeElement & { __debugMarker?: string }).__debugMarker = 'dialog-live'
      ;(button as FakeElement & { __debugMarker?: string }).__debugMarker = 'button-live'
      ;(wrapper as FakeElement & { __debugMarker?: string }).__debugMarker = 'wrapper-live'
      dialog?.showModal()
      expect(dialog?.open).toBe(true)

      open.value = true
      const openingFlush = flushDirtyComponents(container)
      query.value = 'ov'
      await openingFlush
      await flushAsync()
      await flushDirtyComponents(container)

      const nextDialog = findFirst('dialog')
      const nextButton = findFirst('button')
      const nextWrapper = findFirst('div')
      expect(nextDialog).toBe(dialog)
      expect(nextButton).toBe(button)
      expect(nextWrapper).toBe(wrapper)
      expect((nextDialog as FakeElement & { __debugMarker?: string }).__debugMarker).toBe(
        'dialog-live',
      )
      expect((nextButton as FakeElement & { __debugMarker?: string }).__debugMarker).toBe(
        'button-live',
      )
      expect((nextWrapper as FakeElement & { __debugMarker?: string }).__debugMarker).toBe(
        'wrapper-live',
      )
      expect(nextDialog?.open).toBe(true)
      expect(nextButton?.hasAttribute('aria-expanded')).toBe(true)
      expect(nextDialog?.textContent).toContain('No results found.')
    })
  })

  it('keeps compiled insert effects bound to live DOM after a route-location parent rerender', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      let query!: { value: string }

      const ResultsBody = () => {
        query = useSignal('')
        const root = document.createElement('div')
        const marker = document.createComment('results-marker')
        root.appendChild(marker)
        insert(
          () =>
            query.value.trim() === ''
              ? 'Search titles, headings, content, and code.'
              : 'No results found.',
          root,
          marker,
        )
        return root as unknown as JSX.Element
      }

      const Child = __eclipsaComponent(ResultsBody, 'compiled-insert-route-child', () => [])

      const LayoutBody = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: [
              jsxDEV('span', { children: location.pathname }, null, false, {}),
              jsxDEV(Child as any, {}, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'compiled-insert-route-layout', () => [])

      container.imports.set(
        'compiled-insert-route-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'compiled-insert-route-child',
        Promise.resolve({
          default: () => ResultsBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        ;(container.doc as unknown as FakeDocument).body.appendChild(host as unknown as Node)
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        currentPath.value = '/docs/quick-start'
        currentUrl.value = 'http://local/docs/quick-start'
        await flushDirtyComponents(container)

        query.value = 'ov'
        await flushAsync()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(host.textContent).toContain('No results found.')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('preserves marker-backed inserted children when a route-location parent rerender patches a live shell', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      const SearchTriggerBody = () =>
        jsxDEV(
          'button',
          {
            'aria-controls': 'docs-search-dialog',
            children: 'Search docs',
            type: 'button',
          },
          null,
          false,
          {},
        )

      const SearchTrigger = __eclipsaComponent(
        SearchTriggerBody,
        'compiled-insert-search-trigger',
        () => [],
      )

      const LayoutBody = () => {
        const location = useLocation()
        const nav = document.createElement('nav')
        const path = document.createElement('span')
        path.appendChild(document.createTextNode(location.pathname))
        nav.appendChild(path)
        const marker = document.createComment('ec:i:search-trigger')
        nav.appendChild(marker)
        insert(asInsertable(jsxDEV(SearchTrigger as any, {}, null, false, {})), nav, marker)
        return nav as unknown as JSX.Element
      }

      const Layout = __eclipsaComponent(LayoutBody, 'compiled-insert-search-layout', () => [])

      container.imports.set(
        'compiled-insert-search-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'compiled-insert-search-trigger',
        Promise.resolve({
          default: () => SearchTriggerBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const collectButtons = () => queryFakeElements(host, 'button[aria-controls]')
        expect(collectButtons()).toHaveLength(1)
        expect(host.textContent).toContain('/docs/overview')
        expect(host.textContent).toContain('Search docs')

        currentPath.value = '/docs/quick-start'
        currentUrl.value = 'http://local/docs/quick-start'
        await flushDirtyComponents(container)

        const buttons = collectButtons()
        expect(buttons).toHaveLength(1)
        expect(buttons[0]?.textContent).toBe('Search docs')
        expect(host.textContent).toContain('/docs/quick-start')
        expect(host.textContent).toContain('Search docs')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('keeps owner-scoped insert trees bound to live DOM after a route-location parent rerender', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      let query!: { value: string }

      const SearchDialogBody = () => {
        query = useSignal('')
        const host = document.createElement('div')
        insert(
          asInsertable(() =>
            jsxDEV(
              'dialog',
              {
                children: jsxDEV(
                  'div',
                  {
                    children:
                      query.value.trim() === ''
                        ? 'Search titles, headings, content, and code.'
                        : 'No results found.',
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
          ),
          host as unknown as Node,
        )
        return host as unknown as JSX.Element
      }

      const SearchDialog = __eclipsaComponent(
        SearchDialogBody,
        'owner-insert-route-parent-child',
        () => [],
      )

      const LayoutBody = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: [
              jsxDEV('span', { children: location.pathname }, null, false, {}),
              jsxDEV(SearchDialog as any, {}, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'owner-insert-route-parent-layout', () => [])

      container.imports.set(
        'owner-insert-route-parent-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'owner-insert-route-parent-child',
        Promise.resolve({
          default: () => SearchDialogBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        currentPath.value = '/docs/quick-start'
        currentUrl.value = 'http://local/docs/quick-start'
        await flushDirtyComponents(container)

        query.value = 'ov'
        await flushAsync()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(host.textContent).toContain('No results found.')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('preserves marker-backed section button titles when a route-location parent rerender patches a live shell', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      const ChevronBody = () =>
        jsxDEV(
          'div',
          {
            'data-chevron': '',
            children: 'v',
          },
          null,
          false,
          {},
        )

      const Chevron = __eclipsaComponent(ChevronBody, 'sidebar-dir-chevron', () => [])

      const DirBody = (props: { activeHref: string; title: string }) => {
        const root = document.createElement('section')
        root.setAttribute('data-dir-root', props.title)

        const button = document.createElement('button')
        button.setAttribute('class', 'min-h-8')
        button.setAttribute('data-dir-button', props.title)
        button.setAttribute('type', 'button')
        const buttonMarker = document.createComment('sidebar-dir-button-marker')
        button.appendChild(buttonMarker)

        const icon = document.createElement('div')
        icon.setAttribute('data-dir-icon', props.title)

        const title = document.createElement('div')
        title.setAttribute('data-dir-title', props.title)
        title.appendChild(document.createTextNode(props.title))

        const grow = document.createElement('div')
        grow.setAttribute('class', 'grow')

        insert(
          asInsertable([
            icon as unknown as JSX.Element,
            title as unknown as JSX.Element,
            grow as unknown as JSX.Element,
            jsxDEV(Chevron as any, {}, null, false, {}),
          ]),
          button,
          buttonMarker,
        )

        const links = document.createElement('div')
        links.setAttribute('data-dir-links', props.title)

        const overview = document.createElement('a')
        overview.setAttribute(
          'class',
          props.activeHref === '/docs/overview' ? 'active' : 'inactive',
        )
        overview.setAttribute('data-dir-link', 'Overview')
        overview.appendChild(document.createTextNode('Overview'))
        links.appendChild(overview)

        const routing = document.createElement('a')
        routing.setAttribute(
          'class',
          props.activeHref === '/docs/materials/routing' ? 'active' : 'inactive',
        )
        routing.setAttribute('data-dir-link', 'Routing')
        routing.appendChild(document.createTextNode('Routing'))
        links.appendChild(routing)

        root.appendChild(button)
        root.appendChild(links)
        return root as unknown as JSX.Element
      }

      const Dir = __eclipsaComponent(DirBody as any, 'sidebar-dir', () => [])

      const LayoutBody = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: [
              jsxDEV('span', { children: location.pathname }, null, false, {}),
              jsxDEV(
                Dir as any,
                {
                  activeHref: location.pathname,
                  title: 'Materials',
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

      const Layout = __eclipsaComponent(LayoutBody, 'sidebar-dir-layout', () => [])

      container.imports.set(
        'sidebar-dir-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'sidebar-dir',
        Promise.resolve({
          default: (_scope: unknown, props: { activeHref: string; title: string }) =>
            DirBody(props),
        }),
      )
      container.imports.set(
        'sidebar-dir-chevron',
        Promise.resolve({
          default: () => ChevronBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        ;(container.doc as unknown as FakeDocument).body.appendChild(host as unknown as Node)
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const getButton = () =>
          queryFakeElements(host as unknown as FakeNode, 'button[data-dir-button]')[0] ?? null
        const getTitles = () =>
          queryFakeElements(host as unknown as FakeNode, 'div[data-dir-title]')
        const getLinks = () => queryFakeElements(host as unknown as FakeNode, 'a[data-dir-link]')

        expect(getButton()?.textContent).toContain('Materials')
        expect(getTitles()).toHaveLength(1)
        expect(getLinks().map((link) => link.getAttribute('class'))).toEqual(['active', 'inactive'])

        currentPath.value = '/docs/materials/routing'
        currentUrl.value = 'http://local/docs/materials/routing'
        await flushDirtyComponents(container)
        await flushAsync()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(getButton()?.textContent).toContain('Materials')
        expect(getTitles()).toHaveLength(1)
        expect(getLinks().map((link) => link.getAttribute('class'))).toEqual(['inactive', 'active'])
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('preserves compiled anchor elements when insert marker tokens change across rerenders', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      const CompiledLinkBody = () => {
        const location = useLocation()
        const link = document.createElement('a') as unknown as FakeElement
        link.setAttribute('href', '/docs/quick-start')
        const stateSpan = document.createElement('span') as unknown as FakeElement
        const labelSpan = document.createElement('span') as unknown as FakeElement
        const stateMarker = document.createComment('link-state') as unknown as FakeComment
        const labelMarker = document.createComment('link-label') as unknown as FakeComment
        stateSpan.appendChild(stateMarker)
        labelSpan.appendChild(labelMarker)
        link.appendChild(stateSpan)
        link.appendChild(labelSpan)
        const isActive = location.pathname === '/docs/quick-start'

        attr(link as unknown as Element, 'class', () =>
          isActive ? 'link active' : 'link inactive',
        )
        insert(
          () => (isActive ? ' active' : ' inactive'),
          stateSpan as unknown as Node,
          stateMarker as unknown as Node,
        )
        insert(() => 'Quick Start', labelSpan as unknown as Node, labelMarker as unknown as Node)

        return link as unknown as JSX.Element
      }

      const CompiledLink = __eclipsaComponent(
        CompiledLinkBody,
        'compiled-anchor-stable-markers',
        () => [],
      )

      container.imports.set(
        'compiled-anchor-stable-markers',
        Promise.resolve({
          default: () => CompiledLinkBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(CompiledLink as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const collectAnchors = () => queryFakeElements(host, 'a[href]')
        const anchorsBefore = collectAnchors()
        expect(anchorsBefore).toHaveLength(1)
        const anchorBefore = anchorsBefore[0]
        expect(anchorBefore?.textContent).toContain('inactive')

        currentPath.value = '/docs/quick-start'
        currentUrl.value = 'http://local/docs/quick-start'
        await flushDirtyComponents(container)

        const anchorsAfter = collectAnchors()
        expect(anchorsAfter).toHaveLength(1)
        expect(anchorsAfter[0]).toBe(anchorBefore)
        expect(anchorsAfter[0]?.textContent).toContain('active')
        expect(anchorsAfter[0]?.textContent).toContain('Quick Start')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('preserves styled wrapper elements across rerenders with descendant component boundaries', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      let open!: { value: boolean }

      const ChildBody = (props: { href: string; label: string; onSelect: () => void }) =>
        jsxDEV(
          'a',
          {
            href: props.href,
            onClick: props.onSelect,
            children: props.label,
          },
          null,
          false,
          {},
        )
      const Child = __eclipsaComponent(ChildBody, 'patch-wrapper-descendant-child', () => [])

      const renderBody = () =>
        jsxDEV(
          'div',
          {
            children: [
              jsxDEV(
                'button',
                {
                  'aria-expanded': open.value ? 'true' : 'false',
                  onClick: () => {
                    open.value = !open.value
                  },
                  children: open.value ? 'open' : 'closed',
                },
                null,
                false,
                {},
              ),
              jsxDEV(
                'div',
                {
                  id: 'wrapper',
                  style: open.value
                    ? 'opacity: 1; transform: translate3d(0px, 0px, 0px); transition: opacity 0.2s ease, transform 0.2s ease;'
                    : 'opacity: 0; transform: translate3d(0px, -12px, 0px); transition: opacity 0.2s ease, transform 0.2s ease;',
                  children: [
                    jsxDEV(
                      Child as any,
                      {
                        href: '/docs/getting-started/overview',
                        label: 'Docs',
                        onSelect: () => {
                          open.value = false
                        },
                      },
                      null,
                      false,
                      {},
                    ),
                    jsxDEV(
                      Child as any,
                      {
                        href: '/playground',
                        label: 'Playground',
                        onSelect: () => {
                          open.value = false
                        },
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
              ),
            ],
          },
          null,
          false,
          {},
        )

      const App = __eclipsaComponent(
        () => {
          open = useSignal(false)
          return renderBody()
        },
        'patch-wrapper-descendant-parent',
        () => [],
      )

      container.imports.set(
        'patch-wrapper-descendant-parent',
        Promise.resolve({
          default: () => renderBody(),
        }),
      )

      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const findWrapper = () => {
        const visit = (node: FakeNode): FakeElement | null => {
          if (node instanceof FakeElement && node.getAttribute('id') === 'wrapper') {
            return node
          }
          for (const child of node.childNodes) {
            const found = visit(child)
            if (found) {
              return found
            }
          }
          return null
        }
        return visit(doc.body as unknown as FakeNode)
      }

      const wrapper = findWrapper()
      expect(wrapper).toBeTruthy()
      expect(wrapper?.getAttribute('style')).toContain('opacity: 0')

      open.value = true
      await flushDirtyComponents(container)
      await flushAsync()

      const button = queryFakeElements(doc.body as unknown as FakeNode, 'button[aria-expanded]')[0]
      expect(button?.getAttribute('aria-expanded')).toBe('true')
      expect(button?.textContent).toBe('open')

      const liveWrapper = findWrapper()
      expect(liveWrapper).toBe(wrapper)
      expect(liveWrapper?.getAttribute('style')).toContain('opacity: 1')
      expect(liveWrapper?.textContent).toContain('Docs')
      expect(liveWrapper?.textContent).toContain('Playground')
    })
  })

  it('keeps layout render effects live when patching with projection-slot DOM reuse', async () => {
    await withFakeNodeGlobal(async () => {
      let query!: { value: string }

      const LayoutBody = (props: { children?: JSX.Element }) => {
        query = useSignal('')
        const panel = document.createElement('div')
        const marker = document.createComment('layout-results-marker')
        panel.appendChild(marker)
        insert(
          () =>
            query.value.trim() === ''
              ? 'Search titles, headings, content, and code.'
              : 'No results found.',
          panel as unknown as Node,
          marker as unknown as Node,
        )

        return jsxDEV(
          'nav',
          {
            children: [panel as unknown as JSX.Element, props.children ?? null],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'projection-reuse-layout-effects', () => [], {
        children: 1,
      })

      const container = createContainer()
      container.imports.set(
        'projection-reuse-layout-effects',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) => LayoutBody(propsOrArg as any),
        }),
      )
      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(
            jsxDEV(
              Layout as any,
              {
                children: jsxDEV('main', { children: 'overview' }, null, false, {}),
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

        const layout = container.components.get('c0')
        expect(layout).toBeTruthy()
        expect(host.textContent).toContain('Search titles, headings, content, and code.')

        const nextChildren = jsxDEV('main', { children: 'quick-start' }, null, false, {})
        layout!.props = { children: nextChildren }
        layout!.rawProps = { children: nextChildren }
        layout!.active = false
        layout!.activateModeOnFlush = 'patch'
        layout!.reuseExistingDomOnActivate = true
        layout!.reuseProjectionSlotDomOnActivate = true
        container.dirty.add('c0')
        await flushDirtyComponents(container)

        query.value = 'ov'
        await flushAsync()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(host.textContent).toContain('No results found.')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('keeps owner-scoped inserted child components live when patching with projection-slot DOM reuse', async () => {
    await withFakeNodeGlobal(async () => {
      let query!: { value: string }

      const SearchDialogBody = () => {
        query = useSignal('')
        return jsxDEV(
          'div',
          {
            children:
              query.value.trim() === ''
                ? 'Search titles, headings, content, and code.'
                : 'No results found.',
          },
          null,
          false,
          {},
        )
      }

      const SearchDialog = __eclipsaComponent(
        SearchDialogBody,
        'projection-reuse-owner-insert-child',
        () => [],
      )

      const LayoutBody = (props: { children?: JSX.Element }) => {
        const panel = document.createElement('div')
        insert(asInsertable(jsxDEV(SearchDialog as any, {}, null, false, {})), panel)

        return jsxDEV(
          'nav',
          {
            children: [panel as unknown as JSX.Element, props.children ?? null],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(
        LayoutBody,
        'projection-reuse-owner-insert-layout',
        () => [],
        { children: 1 },
      )

      const container = createContainer()
      container.imports.set(
        'projection-reuse-owner-insert-layout',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) => LayoutBody(propsOrArg as any),
        }),
      )
      container.imports.set(
        'projection-reuse-owner-insert-child',
        Promise.resolve({
          default: () => SearchDialogBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(
            jsxDEV(
              Layout as any,
              {
                children: jsxDEV('main', { children: 'overview' }, null, false, {}),
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

        const layout = container.components.get('c0')
        expect(layout).toBeTruthy()
        expect(host.textContent).toContain('Search titles, headings, content, and code.')

        const nextChildren = jsxDEV('main', { children: 'quick-start' }, null, false, {})
        layout!.props = { children: nextChildren }
        layout!.rawProps = { children: nextChildren }
        layout!.active = false
        layout!.activateModeOnFlush = 'patch'
        layout!.reuseExistingDomOnActivate = true
        layout!.reuseProjectionSlotDomOnActivate = true
        container.dirty.add('c0')
        await flushDirtyComponents(container)

        query.value = 'ov'
        await flushDirtyComponents(container)
        await flushAsync()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(host.textContent).toContain('No results found.')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('isolates owner-scoped insert component ids from later sibling components', async () => {
    await withFakeNodeGlobal(async () => {
      let query!: { value: string }

      const SearchDialogBody = () => {
        query = useSignal('')
        return jsxDEV(
          'div',
          {
            children:
              query.value.trim() === ''
                ? 'Search titles, headings, content, and code.'
                : 'No results found.',
          },
          null,
          false,
          {},
        )
      }

      const SearchDialog = __eclipsaComponent(
        SearchDialogBody,
        'owner-insert-id-layout-search-dialog',
        () => [],
      )

      const ContentBody = (props: { label: string }) =>
        jsxDEV('main', { children: props.label }, null, false, {})

      const Content = __eclipsaComponent(ContentBody, 'owner-insert-id-layout-content', () => [])

      const LayoutBody = () => {
        const panel = document.createElement('div')
        insert(asInsertable(jsxDEV(SearchDialog as any, {}, null, false, {})), panel)

        return jsxDEV(
          'section',
          {
            children: [
              panel as unknown as JSX.Element,
              jsxDEV(Content as any, { label: 'overview' }, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'owner-insert-id-layout-parent', () => [])

      const container = createContainer()
      container.imports.set(
        'owner-insert-id-layout-parent',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'owner-insert-id-layout-search-dialog',
        Promise.resolve({
          default: () => SearchDialogBody(),
        }),
      )
      container.imports.set(
        'owner-insert-id-layout-content',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) => ContentBody(propsOrArg as any),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        expect(host.textContent).toContain('Search titles, headings, content, and code.')
        expect(host.textContent).toContain('overview')
        expect(container.components.has('c0.0')).toBe(true)
        expect([...container.components.keys()].some((id) => id.startsWith('c0.$i0'))).toBe(true)

        query.value = 'ov'
        await flushDirtyComponents(container)
        await flushAsync()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(host.textContent).toContain('No results found.')
        expect(host.textContent).toContain('overview')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('keeps resumable child input handlers wired to live local signals after a route-location parent rerender', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedInputEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('input')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      const ChildBody = () => {
        const query = useSignal('')
        return jsxDEV(
          'div',
          {
            children: [
              jsxDEV(
                'input',
                {
                  onInput: __eclipsaEvent('input', 'route-parent-child-input-symbol', () => [
                    query,
                  ]),
                  type: 'text',
                  value: query.value,
                },
                null,
                false,
                {},
              ),
              jsxDEV('span', { children: query.value }, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Child = __eclipsaComponent(ChildBody, 'route-parent-child-input-component', () => [])

      const LayoutBody = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: [
              jsxDEV('span', { children: location.pathname }, null, false, {}),
              jsxDEV(Child as any, {}, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'route-parent-input-layout', () => [])

      container.imports.set(
        'route-parent-input-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'route-parent-child-input-component',
        Promise.resolve({
          default: () => ChildBody(),
        }),
      )
      container.imports.set(
        'route-parent-child-input-symbol',
        Promise.resolve({
          default: (scope: unknown[], propsOrArg?: unknown) => {
            const event = propsOrArg as Event
            const [query] = scope as [{ value: string }]
            if (!(event.currentTarget instanceof FakeElement)) {
              throw new Error('Expected fake input currentTarget.')
            }
            query.value = event.currentTarget.value
          },
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const findFirst = (tagName: string) => {
          const visit = (node: FakeNode): FakeElement | null => {
            if (node instanceof FakeElement && node.tagName === tagName) {
              return node
            }
            for (const child of node.childNodes) {
              const found = visit(child)
              if (found) {
                return found
              }
            }
            return null
          }
          return visit(host)
        }

        currentPath.value = '/docs/quick-start'
        currentUrl.value = 'http://local/docs/quick-start'
        await flushDirtyComponents(container)

        const input = findFirst('input')
        expect(input).toBeTruthy()
        input!.value = 'ov'
        await dispatchDocumentEvent(
          container,
          new TargetedInputEvent(input as unknown as EventTarget),
        )
        await flushDirtyComponents(container)

        const text = host.textContent ?? ''
        expect(text).toContain('ov')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('keeps child refs attached to live elements when a route-location parent rerenders', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      let inputRef!: { value: HTMLInputElement | undefined }

      const ChildBody = () => {
        inputRef = useSignal<HTMLInputElement | undefined>()
        return jsxDEV(
          'input',
          {
            ref: inputRef,
            type: 'text',
            value: 'stable',
          },
          null,
          false,
          {},
        )
      }

      const Child = __eclipsaComponent(ChildBody, 'route-parent-child-ref-component', () => [])

      const LayoutBody = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: [
              jsxDEV('span', { children: location.pathname }, null, false, {}),
              jsxDEV(Child as any, {}, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'route-parent-ref-layout', () => [])

      container.imports.set(
        'route-parent-ref-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'route-parent-child-ref-component',
        Promise.resolve({
          default: () => ChildBody(),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const findFirst = (tagName: string) => {
          const visit = (node: FakeNode): FakeElement | null => {
            if (node instanceof FakeElement && node.tagName === tagName) {
              return node
            }
            for (const child of node.childNodes) {
              const found = visit(child)
              if (found) {
                return found
              }
            }
            return null
          }
          return visit(host)
        }

        const initialInput = findFirst('input')
        expect(initialInput).toBeTruthy()
        expect(inputRef.value).toBe(initialInput)

        currentPath.value = '/docs/quick-start'
        currentUrl.value = 'http://local/docs/quick-start'
        await flushDirtyComponents(container)

        const nextInput = findFirst('input')
        expect(nextInput).toBeTruthy()
        expect(inputRef.value).toBe(nextInput)
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('does not preserve stale child boundary DOM when a route-location parent rerender changes child symbols and props', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      const NavLinkBody = (props: { href: string; label: string }) =>
        jsxDEV('a', { children: props.label, href: props.href }, null, false, {})

      const NavLink = __eclipsaComponent(NavLinkBody, 'route-parent-nav-link', () => [])

      const HomeBody = () =>
        jsxDEV(
          'div',
          {
            children: [
              jsxDEV('p', { children: 'Home page' }, null, false, {}),
              jsxDEV(
                'p',
                {
                  children: jsxDEV(
                    NavLink as any,
                    {
                      href: '/guarded',
                      label: 'Open guarded route with Link',
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
            ],
          },
          null,
          false,
          {},
        )

      const Home = __eclipsaComponent(HomeBody, 'route-parent-home-page', () => [])

      const CounterBody = () =>
        jsxDEV(
          'div',
          {
            children: [
              jsxDEV('p', { children: 'Counter page' }, null, false, {}),
              jsxDEV(
                'p',
                {
                  children: jsxDEV(
                    NavLink as any,
                    {
                      href: '/',
                      label: 'Back home with Link',
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
            ],
          },
          null,
          false,
          {},
        )

      const Counter = __eclipsaComponent(CounterBody, 'route-parent-counter-page', () => [])

      const LayoutBody = () => {
        const location = useLocation()
        return jsxDEV(
          'main',
          {
            children:
              location.pathname === '/docs/overview'
                ? jsxDEV(Home as any, {}, null, false, {})
                : jsxDEV(Counter as any, {}, null, false, {}),
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'route-parent-symbol-layout', () => [])

      container.imports.set(
        'route-parent-symbol-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'route-parent-home-page',
        Promise.resolve({
          default: () => HomeBody(),
        }),
      )
      container.imports.set(
        'route-parent-counter-page',
        Promise.resolve({
          default: () => CounterBody(),
        }),
      )
      container.imports.set(
        'route-parent-nav-link',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            NavLinkBody(propsOrArg as { href: string; label: string }),
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        expect(host.textContent).toContain('Home page')
        expect(host.textContent).toContain('Open guarded route with Link')

        currentPath.value = '/docs/counter'
        currentUrl.value = 'http://local/docs/counter'
        await flushDirtyComponents(container)

        const text = host.textContent ?? ''
        expect(text).toContain('Counter page')
        expect(text).toContain('Back home with Link')
        expect(text).not.toContain('Open guarded route with Link')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('preserves resumable child event scopes when a route-location parent falls back to shell replacement', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      const ChildBody = () => {
        const open = useSignal(false)
        return jsxDEV(
          'button',
          {
            children: open.value ? 'open' : 'closed',
            onClick: __eclipsaEvent('click', 'route-parent-shell-fallback-click-symbol', () => [
              open,
            ]),
            type: 'button',
          },
          null,
          false,
          {},
        )
      }

      const Child = __eclipsaComponent(ChildBody, 'route-parent-shell-fallback-child', () => [])

      const LayoutBody = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: [
              location.pathname === '/docs/overview'
                ? jsxDEV('span', { children: location.pathname }, null, false, {})
                : jsxDEV(
                    'div',
                    {
                      children: jsxDEV('span', { children: location.pathname }, null, false, {}),
                    },
                    null,
                    false,
                    {},
                  ),
              jsxDEV(Child as any, {}, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'route-parent-shell-fallback-layout', () => [])

      container.imports.set(
        'route-parent-shell-fallback-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'route-parent-shell-fallback-child',
        Promise.resolve({
          default: () => ChildBody(),
        }),
      )
      container.imports.set(
        'route-parent-shell-fallback-click-symbol',
        Promise.resolve({
          default: (scope: unknown[]) => {
            const [open] = scope as [{ value: boolean }]
            open.value = true
          },
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const findFirst = (tagName: string) => {
          const visit = (node: FakeNode): FakeElement | null => {
            if (node instanceof FakeElement && node.tagName === tagName) {
              return node
            }
            for (const child of node.childNodes) {
              const found = visit(child)
              if (found) {
                return found
              }
            }
            return null
          }
          return visit(host)
        }

        currentPath.value = '/docs/quick-start'
        currentUrl.value = 'http://local/docs/quick-start'
        await flushDirtyComponents(container)

        const button = findFirst('button')
        expect(button).toBeTruthy()
        expect(button?.textContent).toBe('closed')

        await dispatchDocumentEvent(
          container,
          new TargetedClickEvent(button as unknown as EventTarget),
        )
        await flushDirtyComponents(container)

        expect(findFirst('button')?.textContent).toBe('open')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('keeps owner-scoped inserted child event handlers wired after a route-location parent rerender', async () => {
    await withFakeNodeGlobal(async () => {
      class TargetedClickEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('click')
        }

        override get target() {
          return this.eventTarget
        }
      }

      class TargetedInputEvent extends Event {
        constructor(private readonly eventTarget: EventTarget | null) {
          super('input')
        }

        override get target() {
          return this.eventTarget
        }
      }

      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(container, '$router:path', '/docs/overview')
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/overview',
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

      const SearchDialogBody = () => {
        const open = useSignal(false)
        const query = useSignal('')
        return jsxDEV(
          'div',
          {
            children: [
              jsxDEV(
                'button',
                {
                  children: open.value ? 'open' : 'closed',
                  onClick: __eclipsaEvent('click', 'owner-insert-route-click-symbol', () => [open]),
                },
                null,
                false,
                {},
              ),
              jsxDEV(
                'input',
                {
                  onInput: __eclipsaEvent('input', 'owner-insert-route-input-symbol', () => [
                    query,
                  ]),
                  type: 'text',
                  value: query.value,
                },
                null,
                false,
                {},
              ),
              jsxDEV('span', { children: query.value || 'empty' }, null, false, {}),
            ],
          },
          null,
          false,
          {},
        )
      }

      const SearchDialog = __eclipsaComponent(
        SearchDialogBody,
        'owner-insert-route-search-dialog',
        () => [],
      )

      const LayoutBody = () => {
        const location = useLocation()
        const panel = document.createElement('div')
        insert(asInsertable(jsxDEV(SearchDialog as any, {}, null, false, {})), panel)
        return jsxDEV(
          'nav',
          {
            children: [
              jsxDEV('span', { children: location.pathname }, null, false, {}),
              panel as unknown as JSX.Element,
            ],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'owner-insert-route-layout', () => [])

      container.imports.set(
        'owner-insert-route-layout',
        Promise.resolve({
          default: () => LayoutBody(),
        }),
      )
      container.imports.set(
        'owner-insert-route-search-dialog',
        Promise.resolve({
          default: () => SearchDialogBody(),
        }),
      )
      container.imports.set(
        'owner-insert-route-click-symbol',
        Promise.resolve({
          default: (scope: unknown[]) => {
            const [open] = scope as [{ value: boolean }]
            open.value = true
          },
        }),
      )
      container.imports.set(
        'owner-insert-route-input-symbol',
        Promise.resolve({
          default: (scope: unknown[], propsOrArg?: unknown) => {
            const event = propsOrArg as Event
            const [query] = scope as [{ value: string }]
            if (!(event.currentTarget instanceof FakeElement)) {
              throw new Error('Expected fake input currentTarget.')
            }
            query.value = event.currentTarget.value
          },
        }),
      )

      const originalDocument = globalThis.document
      ;(globalThis as typeof globalThis & { document: Document }).document =
        container.doc as Document
      try {
        const host = new FakeElement('div')
        const nodes = withRuntimeContainer(container, () =>
          renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
        ) as unknown as FakeNode[]

        for (const node of nodes) {
          host.appendChild(node)
        }

        const findFirst = (tagName: string) => {
          const visit = (node: FakeNode): FakeElement | null => {
            if (node instanceof FakeElement && node.tagName === tagName) {
              return node
            }
            for (const child of node.childNodes) {
              const found = visit(child)
              if (found) {
                return found
              }
            }
            return null
          }
          return visit(host)
        }

        currentPath.value = '/docs/quick-start'
        currentUrl.value = 'http://local/docs/quick-start'
        await flushDirtyComponents(container)

        const button = findFirst('button')
        const input = findFirst('input')
        expect(button).toBeTruthy()
        expect(input).toBeTruthy()

        await dispatchDocumentEvent(
          container,
          new TargetedClickEvent(button as unknown as EventTarget),
        )
        input!.value = 'ov'
        await dispatchDocumentEvent(
          container,
          new TargetedInputEvent(input as unknown as EventTarget),
        )
        await flushDirtyComponents(container)

        expect(host.textContent).toContain('open')
        expect(host.textContent).toContain('ov')
      } finally {
        globalThis.document = originalDocument
      }
    })
  })

  it('updates external projection slot children when a route-location parent rerender changes active links', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(
        container,
        '$router:path',
        '/docs/getting-started/overview',
      )
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/getting-started/overview',
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

      const ensureExternalSlotHost = (host: HTMLElement) => {
        const fakeHost = host as unknown as FakeElement
        const existing = queryFakeElements(
          fakeHost as unknown as FakeNode,
          'e-slot-host[data-e-slot="children"]',
        )[0]
        if (existing) {
          return
        }
        const shell = new FakeElement('div')
        shell.setAttribute('data-panel', '')
        const slotHost = new FakeElement('e-slot-host')
        slotHost.setAttribute('data-e-slot', 'children')
        shell.appendChild(slotHost)
        fakeHost.appendChild(shell)
      }

      const ExternalBody = setExternalComponentMeta((() => null) as any, {
        async hydrate(host) {
          ensureExternalSlotHost(host)
          return { host }
        },
        kind: 'react',
        async renderToString() {
          return '<div data-panel=""><e-slot-host data-e-slot="children"></e-slot-host></div>'
        },
        slots: ['children'],
        async unmount() {},
        async update(instance, host) {
          ensureExternalSlotHost(host)
          return instance
        },
      })

      const ExternalPanel = __eclipsaComponent(
        ExternalBody as any,
        'route-location-external-panel',
        () => [],
        { children: 1 },
        { external: { kind: 'react', slots: ['children'] } },
      )

      const DocLink = __eclipsaComponent(
        (props: { activeHref: string; href: string; label: string }) =>
          jsxDEV(
            'a',
            {
              class: props.activeHref === props.href ? 'active' : 'inactive',
              'data-doc-link': '',
              href: props.href,
              children: props.label,
            },
            null,
            false,
            {},
          ),
        'route-location-external-doc-link',
        () => [],
      )

      const renderSidebar = () => {
        const location = useLocation()
        return jsxDEV(
          ExternalPanel as any,
          {
            children: [
              jsxDEV(
                DocLink as any,
                {
                  activeHref: location.pathname,
                  href: '/docs/getting-started/overview',
                  label: 'Overview',
                },
                '/docs/getting-started/overview',
                false,
                {},
              ),
              jsxDEV(
                DocLink as any,
                {
                  activeHref: location.pathname,
                  href: '/docs/materials/routing',
                  label: 'Routing',
                },
                '/docs/materials/routing',
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

      const Sidebar = __eclipsaComponent(
        () => renderSidebar(),
        'route-location-external-sidebar',
        () => [],
      )

      container.imports.set(
        'route-location-external-sidebar',
        Promise.resolve({
          default: () => renderSidebar(),
        }),
      )

      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(Sidebar as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      await flushAsync()
      await flushAsync()

      const initialLinks = queryFakeElements(doc.body as unknown as FakeNode, 'a[data-doc-link]')
      expect(initialLinks).toHaveLength(2)
      expect(initialLinks[0]?.getAttribute('class')).toBe('active')
      expect(initialLinks[1]?.getAttribute('class')).toBe('inactive')

      currentPath.value = '/docs/materials/routing'
      currentUrl.value = 'http://local/docs/materials/routing'
      await flushDirtyComponents(container)
      await flushAsync()
      await flushAsync()

      const updatedLinks = queryFakeElements(doc.body as unknown as FakeNode, 'a[data-doc-link]')
      expect(updatedLinks).toHaveLength(2)
      expect(updatedLinks[0]?.textContent).toBe('Overview')
      expect(updatedLinks[1]?.textContent).toBe('Routing')
      expect(updatedLinks[0]?.getAttribute('class')).toBe('inactive')
      expect(updatedLinks[1]?.getAttribute('class')).toBe('active')
    })
  })

  it('updates getter-backed child props when a route-location parent rerender changes active links', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(
        container,
        '$router:path',
        '/docs/getting-started/overview',
      )
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/getting-started/overview',
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

      const Panel = __eclipsaComponent(
        (props: { children?: JSX.Element | JSX.Element[] }) =>
          jsxDEV('div', { children: props.children }, null, false, {}),
        'route-location-inline-panel',
        () => [],
      )

      const Dir = __eclipsaComponent(
        (props: { activeHref: string; links: Array<{ href: string; label: string }> }) =>
          jsxDEV(
            Panel as any,
            {
              children: props.links.map((link) =>
                jsxDEV(
                  'a',
                  {
                    class: props.activeHref === link.href ? 'active' : 'inactive',
                    'data-doc-link': '',
                    href: link.href,
                    children: link.label,
                  },
                  link.href,
                  false,
                  {},
                ),
              ),
            },
            null,
            false,
            {},
          ),
        'route-location-inline-dir',
        () => [],
      )

      const sections = [
        {
          links: [
            { href: '/docs/getting-started/overview', label: 'Overview' },
            { href: '/docs/materials/routing', label: 'Routing' },
          ],
          title: 'Docs',
        },
      ]

      const renderLayout = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: sections.map((section) => {
              const props = Object.create(null) as Record<string, unknown>
              Object.defineProperties(props, {
                activeHref: {
                  configurable: true,
                  enumerable: true,
                  get() {
                    return location.pathname
                  },
                },
                links: {
                  configurable: true,
                  enumerable: true,
                  get() {
                    return [...section.links]
                  },
                },
              })
              return jsxDEV(Dir as any, props, section.title, false, {})
            }),
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(
        () => renderLayout(),
        'route-location-inline-layout',
        () => [],
      )

      container.imports.set(
        'route-location-inline-layout',
        Promise.resolve({
          default: () => renderLayout(),
        }),
      )
      container.imports.set(
        'route-location-inline-dir',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            Dir(
              (propsOrArg as {
                activeHref: string
                links: Array<{ href: string; label: string }>
              }) ?? {
                activeHref: '',
                links: [],
              },
            ),
        }),
      )
      container.imports.set(
        'route-location-inline-panel',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            Panel((propsOrArg as { children?: JSX.Element | JSX.Element[] }) ?? {}),
        }),
      )

      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const initialLinks = queryFakeElements(doc.body as unknown as FakeNode, 'a[data-doc-link]')
      expect(initialLinks).toHaveLength(2)
      expect(initialLinks[0]?.getAttribute('class')).toBe('active')
      expect(initialLinks[1]?.getAttribute('class')).toBe('inactive')

      currentPath.value = '/docs/materials/routing'
      currentUrl.value = 'http://local/docs/materials/routing'
      await flushDirtyComponents(container)

      const updatedLinks = queryFakeElements(doc.body as unknown as FakeNode, 'a[data-doc-link]')
      expect(updatedLinks).toHaveLength(2)
      expect(updatedLinks[0]?.getAttribute('class')).toBe('inactive')
      expect(updatedLinks[1]?.getAttribute('class')).toBe('active')
    })
  })

  it('updates motion-wrapped child links when a route-location parent rerender changes active links', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(
        container,
        '$router:path',
        '/docs/getting-started/overview',
      )
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/getting-started/overview',
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

      const Dir = __eclipsaComponent(
        (props: { activeHref: string; links: Array<{ href: string; label: string }> }) =>
          jsxDEV(
            motion.div as any,
            {
              children: props.links.map((link) =>
                jsxDEV(
                  'a',
                  {
                    class: props.activeHref === link.href ? 'active' : 'inactive',
                    'data-doc-link': '',
                    href: link.href,
                    children: link.label,
                  },
                  link.href,
                  false,
                  {},
                ),
              ),
            },
            null,
            false,
            {},
          ),
        'route-location-motion-dir',
        () => [],
      )

      const sections = [
        {
          links: [
            { href: '/docs/getting-started/overview', label: 'Overview' },
            { href: '/docs/materials/routing', label: 'Routing' },
          ],
          title: 'Docs',
        },
      ]

      const renderLayout = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: sections.map((section) => {
              const props = Object.create(null) as Record<string, unknown>
              Object.defineProperties(props, {
                activeHref: {
                  configurable: true,
                  enumerable: true,
                  get() {
                    return location.pathname
                  },
                },
                links: {
                  configurable: true,
                  enumerable: true,
                  get() {
                    return [...section.links]
                  },
                },
              })
              return jsxDEV(Dir as any, props, section.title, false, {})
            }),
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(
        () => renderLayout(),
        'route-location-motion-layout',
        () => [],
      )

      container.imports.set(
        'route-location-motion-layout',
        Promise.resolve({
          default: () => renderLayout(),
        }),
      )
      container.imports.set(
        'route-location-motion-dir',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            Dir(
              (propsOrArg as {
                activeHref: string
                links: Array<{ href: string; label: string }>
              }) ?? {
                activeHref: '',
                links: [],
              },
            ),
        }),
      )

      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const initialLinks = queryFakeElements(doc.body as unknown as FakeNode, 'a[data-doc-link]')
      expect(initialLinks).toHaveLength(2)
      expect(initialLinks[0]?.getAttribute('class')).toBe('active')
      expect(initialLinks[1]?.getAttribute('class')).toBe('inactive')

      currentPath.value = '/docs/materials/routing'
      currentUrl.value = 'http://local/docs/materials/routing'
      await flushDirtyComponents(container)

      const updatedLinks = queryFakeElements(doc.body as unknown as FakeNode, 'a[data-doc-link]')
      expect(updatedLinks).toHaveLength(2)
      expect(updatedLinks[0]?.getAttribute('class')).toBe('inactive')
      expect(updatedLinks[1]?.getAttribute('class')).toBe('active')
    })
  })

  it('updates docs-like motion links when a route-location parent rerender changes active links', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(
        container,
        '$router:path',
        '/docs/getting-started/overview',
      )
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/getting-started/overview',
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

      const Dir = __eclipsaComponent(
        (props: {
          activeHref: string
          links: Array<{ href: string; label: string }>
          onLinkClick?: () => void
        }) =>
          jsxDEV(
            motion.div as any,
            {
              children: props.links.map((link) =>
                props.onLinkClick
                  ? jsxDEV(
                      Link as any,
                      {
                        class: props.activeHref === link.href ? 'active' : 'inactive',
                        'data-doc-link': '',
                        href: link.href,
                        onClick: props.onLinkClick,
                        children: [
                          jsxDEV(
                            'div',
                            {
                              class: props.activeHref === link.href ? 'line active-line' : 'line',
                            },
                            null,
                            false,
                            {},
                          ),
                          jsxDEV(
                            'div',
                            {
                              class: 'label',
                              children: link.label,
                            },
                            null,
                            false,
                            {},
                          ),
                        ],
                      },
                      link.href,
                      false,
                      {},
                    )
                  : jsxDEV(
                      Link as any,
                      {
                        class: props.activeHref === link.href ? 'active' : 'inactive',
                        'data-doc-link': '',
                        href: link.href,
                        children: [
                          jsxDEV(
                            'div',
                            {
                              class: props.activeHref === link.href ? 'line active-line' : 'line',
                            },
                            null,
                            false,
                            {},
                          ),
                          jsxDEV(
                            'div',
                            {
                              class: 'label',
                              children: link.label,
                            },
                            null,
                            false,
                            {},
                          ),
                        ],
                      },
                      link.href,
                      false,
                      {},
                    ),
              ),
            },
            null,
            false,
            {},
          ),
        'route-location-docs-like-dir',
        () => [],
      )

      const sections = [
        {
          links: [
            { href: '/docs/getting-started/overview', label: 'Overview' },
            { href: '/docs/materials/routing', label: 'Routing' },
          ],
          title: 'Docs',
        },
      ]

      const renderLayout = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: sections.map((section) => {
              const props = Object.create(null) as Record<string, unknown>
              Object.defineProperties(props, {
                activeHref: {
                  configurable: true,
                  enumerable: true,
                  get() {
                    return location.pathname
                  },
                },
                links: {
                  configurable: true,
                  enumerable: true,
                  get() {
                    return [...section.links]
                  },
                },
              })
              return jsxDEV(Dir as any, props, section.title, false, {})
            }),
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(
        () => renderLayout(),
        'route-location-docs-like-layout',
        () => [],
      )

      container.imports.set(
        'route-location-docs-like-layout',
        Promise.resolve({
          default: () => renderLayout(),
        }),
      )
      container.imports.set(
        'route-location-docs-like-dir',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            Dir(
              (propsOrArg as {
                activeHref: string
                links: Array<{ href: string; label: string }>
                onLinkClick?: () => void
              }) ?? {
                activeHref: '',
                links: [],
              },
            ),
        }),
      )

      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      const initialLinks = queryFakeElements(doc.body as unknown as FakeNode, 'a[data-doc-link]')
      expect(initialLinks).toHaveLength(2)
      expect(initialLinks[0]?.getAttribute('class')).toBe('active')
      expect(initialLinks[1]?.getAttribute('class')).toBe('inactive')

      currentPath.value = '/docs/materials/routing'
      currentUrl.value = 'http://local/docs/materials/routing'
      await flushDirtyComponents(container)

      const updatedLinks = queryFakeElements(doc.body as unknown as FakeNode, 'a[data-doc-link]')
      expect(updatedLinks).toHaveLength(2)
      expect(updatedLinks[0]?.getAttribute('class')).toBe('inactive')
      expect(updatedLinks[1]?.getAttribute('class')).toBe('active')
    })
  })

  it('updates docs-like motion links after component state is resumed into an inactive tree', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(
        container,
        '$router:path',
        '/docs/getting-started/overview',
      )
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/getting-started/overview',
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

      const Dir = __eclipsaComponent(
        (props: {
          activeHref: string
          links: Array<{ href: string; label: string }>
          onLinkClick?: () => void
        }) =>
          jsxDEV(
            motion.div as any,
            {
              children: props.links.map((link) =>
                jsxDEV(
                  Link as any,
                  {
                    class: props.activeHref === link.href ? 'active' : 'inactive',
                    'data-doc-link': '',
                    href: link.href,
                    children: [
                      jsxDEV(
                        'div',
                        {
                          class: props.activeHref === link.href ? 'line active-line' : 'line',
                        },
                        null,
                        false,
                        {},
                      ),
                      jsxDEV(
                        'div',
                        {
                          class: 'label',
                          children: link.label,
                        },
                        null,
                        false,
                        {},
                      ),
                    ],
                  },
                  link.href,
                  false,
                  {},
                ),
              ),
            },
            null,
            false,
            {},
          ),
        'route-location-docs-like-resume-dir',
        () => [],
      )

      const sections = [
        {
          links: [
            { href: '/docs/getting-started/overview', label: 'Overview' },
            { href: '/docs/materials/routing', label: 'Routing' },
          ],
          title: 'Docs',
        },
      ]

      const renderLayout = () => {
        const location = useLocation()
        return jsxDEV(
          'nav',
          {
            children: sections.map((section) => {
              const props = Object.create(null) as Record<string, unknown>
              Object.defineProperties(props, {
                activeHref: {
                  configurable: true,
                  enumerable: true,
                  get() {
                    return location.pathname
                  },
                },
                links: {
                  configurable: true,
                  enumerable: true,
                  get() {
                    return [...section.links]
                  },
                },
              })
              return jsxDEV(Dir as any, props, section.title, false, {})
            }),
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(
        () => renderLayout(),
        'route-location-docs-like-resume-layout',
        () => [],
      )

      container.imports.set(
        'route-location-docs-like-resume-layout',
        Promise.resolve({
          default: () => renderLayout(),
        }),
      )
      container.imports.set(
        'route-location-docs-like-resume-dir',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            Dir(
              (propsOrArg as {
                activeHref: string
                links: Array<{ href: string; label: string }>
                onLinkClick?: () => void
              }) ?? {
                activeHref: '',
                links: [],
              },
            ),
        }),
      )

      const doc = container.doc as unknown as FakeDocument
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(Layout as any, {}, null, false, {}), container),
      ) as unknown as FakeNode[]

      for (const node of nodes) {
        ;(doc.body as unknown as FakeElement).appendChild(node)
      }

      for (const component of container.components.values()) {
        component.active = false
        component.didMount = false
        component.rawProps = null
      }

      currentPath.value = '/docs/materials/routing'
      currentUrl.value = 'http://local/docs/materials/routing'
      await flushDirtyComponents(container)

      const updatedLinks = queryFakeElements(doc.body as unknown as FakeNode, 'a[data-doc-link]')
      expect(updatedLinks).toHaveLength(2)
      expect(updatedLinks[0]?.getAttribute('class')).toBe('inactive')
      expect(updatedLinks[1]?.getAttribute('class')).toBe('active')
    })
  })

  it('updates keyed docs sidebar links when a shared layout patch rerenders a live shell', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const currentPath = createDetachedRuntimeSignal(
        container,
        '$router:path',
        '/docs/getting-started/overview',
      )
      const currentUrl = createDetachedRuntimeSignal(
        container,
        '$router:url',
        'http://local/docs/getting-started/overview',
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

      const sections = [
        {
          links: [
            { href: '/docs/getting-started/overview', label: 'Overview' },
            { href: '/docs/getting-started/quick-start', label: 'Quick Start' },
          ],
          title: 'Getting Started',
        },
        {
          links: [
            { href: '/docs/materials/routing', label: 'Routing' },
            { href: '/docs/materials/signal', label: 'Signal' },
          ],
          title: 'Materials',
        },
      ]

      const Dir = __eclipsaComponent(
        (props: {
          activeHref: string
          links: Array<{ href: string; label: string }>
          title: string
        }) =>
          jsxDEV(
            'div',
            {
              children: [
                jsxDEV(
                  'button',
                  {
                    'data-doc-section': props.title,
                    type: 'button',
                    children: [
                      jsxDEV('div', { class: 'icon' }, null, false, {}),
                      jsxDEV(
                        'div',
                        {
                          class: 'section-title',
                          children: props.title,
                        },
                        null,
                        false,
                        {},
                      ),
                      jsxDEV('div', { class: 'grow' }, null, false, {}),
                      jsxDEV(
                        motion.div as any,
                        {
                          class: 'chevron',
                          initial: false,
                          animate: {
                            rotate: 0,
                          },
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
                ),
                jsxDEV(
                  motion.div as any,
                  {
                    children: props.links.map((link) =>
                      jsxDEV(
                        Link as any,
                        {
                          class: props.activeHref === link.href ? 'active' : 'inactive',
                          'data-doc-link': `${props.title}:${link.label}`,
                          href: link.href,
                          children: [
                            jsxDEV(
                              'div',
                              {
                                class: props.activeHref === link.href ? 'line active-line' : 'line',
                              },
                              null,
                              false,
                              {},
                            ),
                            jsxDEV(
                              'div',
                              {
                                class: 'label',
                                children: link.label,
                              },
                              null,
                              false,
                              {},
                            ),
                          ],
                        },
                        link.href,
                        false,
                        {},
                      ),
                    ),
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
          ),
        'shared-layout-docs-dir',
        () => [],
      )

      const LayoutBody = (props: { children?: JSX.Element }) => {
        const location = useLocation()
        return jsxDEV(
          'div',
          {
            children: [
              jsxDEV(
                'nav',
                {
                  children: sections.map((section) =>
                    jsxDEV(
                      Dir as any,
                      {
                        activeHref: location.pathname,
                        links: [...section.links],
                        title: section.title,
                      },
                      section.title,
                      false,
                      {},
                    ),
                  ),
                },
                null,
                false,
                {},
              ),
              props.children ?? null,
            ],
          },
          null,
          false,
          {},
        )
      }

      const Layout = __eclipsaComponent(LayoutBody, 'shared-layout-docs-layout', () => [], {
        children: 1,
      })

      container.imports.set(
        'shared-layout-docs-layout',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            LayoutBody((propsOrArg as { children?: JSX.Element }) ?? {}),
        }),
      )
      container.imports.set(
        'shared-layout-docs-dir',
        Promise.resolve({
          default: (_scope: unknown[], propsOrArg?: unknown) =>
            Dir(
              (propsOrArg as {
                activeHref: string
                links: Array<{ href: string; label: string }>
                title: string
              }) ?? {
                activeHref: '',
                links: [],
                title: '',
              },
            ),
        }),
      )

      const host = new FakeElement('div')
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          jsxDEV(
            Layout as any,
            {
              children: jsxDEV('main', { children: 'overview' }, null, false, {}),
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

      const getLink = (label: string) =>
        queryFakeElements(host as unknown as FakeNode, 'a[data-doc-link]').find(
          (link) => link.textContent === label,
        ) ?? null
      const getSectionButton = (title: string) =>
        queryFakeElements(host as unknown as FakeNode, 'button[data-doc-section]').find(
          (button) => button.getAttribute('data-doc-section') === title,
        ) ?? null
      const getLine = (label: string) => {
        const link = getLink(label)
        if (!link) {
          return null
        }
        return (
          link.childNodes.find(
            (child): child is FakeElement =>
              child instanceof FakeElement && child.tagName === 'div',
          ) ?? null
        )
      }

      expect(getLink('Overview')?.getAttribute('class')).toBe('active')
      expect(getLink('Routing')?.getAttribute('class')).toBe('inactive')
      expect(getSectionButton('Getting Started')?.textContent).toContain('Getting Started')
      expect(getSectionButton('Materials')?.textContent).toContain('Materials')

      const layout = container.components.get('c0')
      expect(layout).toBeTruthy()

      const nextChildren = jsxDEV('main', { children: 'routing' }, null, false, {})
      const nextProps = Object.create(null) as Record<string, unknown>
      Object.defineProperties(
        nextProps,
        Object.getOwnPropertyDescriptors((layout!.props as Record<string, unknown>) ?? {}),
      )
      Object.defineProperty(nextProps, 'children', {
        configurable: true,
        enumerable: true,
        value: nextChildren,
        writable: true,
      })

      layout!.props = nextProps
      layout!.rawProps = nextProps
      layout!.active = false
      layout!.activateModeOnFlush = 'patch'
      layout!.reuseExistingDomOnActivate = true
      layout!.reuseProjectionSlotDomOnActivate = true

      currentPath.value = '/docs/materials/routing'
      currentUrl.value = 'http://local/docs/materials/routing'
      container.dirty.add('c0')
      await flushDirtyComponents(container)

      expect(getLink('Overview')?.getAttribute('class')).toBe('inactive')
      expect(getLink('Routing')?.getAttribute('class')).toBe('active')
      expect(getLine('Overview')?.getAttribute('class')).toBe('line')
      expect(getLine('Routing')?.getAttribute('class')).toBe('line active-line')
      expect(getSectionButton('Getting Started')?.textContent).toContain('Getting Started')
      expect(getSectionButton('Materials')?.textContent).toContain('Materials')
    })
  })

  it('serializes router subscriptions when useLocation is only read through getter-backed child props', async () => {
    const Dir = __eclipsaComponent(
      (props: { activeHref: string }) =>
        jsxDEV(
          'a',
          { class: props.activeHref === '/docs/getting-started/overview' ? 'active' : 'inactive' },
          null,
          false,
          {},
        ),
      'ssr-route-location-dir',
      () => [],
    )

    const Layout = __eclipsaComponent(
      () => {
        const location = useLocation()
        const props = Object.create(null) as Record<string, unknown>
        Object.defineProperty(props, 'activeHref', {
          configurable: true,
          enumerable: true,
          get() {
            return location.pathname
          },
        })
        return jsxDEV(Dir as any, props, 'docs', false, {})
      },
      'ssr-route-location-layout',
      () => [],
    )

    const { payload } = await renderSSRAsync(() => jsxDEV(Layout as any, {}, null, false, {}), {
      prepare(container) {
        primeLocationState(container, 'https://example.com/docs/getting-started/overview')
      },
    })

    expect(payload.subscriptions['$router:url']).toContain('c0')
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
        tryPatchBoundaryContentsInPlace(start as unknown as Comment, end as unknown as Comment, [
          next as unknown as Node,
        ]),
      ).toBe(true)
      expect(current.getAttribute('class')).toBe('after')
      expect(current.textContent).toBe('Quick Start')
    })
  })

  it('does not clear a live element shell when patching the same node instance', () => {
    withFakeNodeGlobal(() => {
      const button = new FakeElement('button')
      const icon = new FakeElement('div')
      const title = new FakeElement('div')
      title.appendChild(new FakeText('Materials'))
      const grow = new FakeElement('div')
      button.appendChild(icon)
      button.appendChild(title)
      button.appendChild(grow)

      expect(
        tryPatchElementShellInPlace(button as unknown as Element, button as unknown as Element),
      ).toBe(true)
      expect(button.childNodes).toHaveLength(3)
      expect(button.textContent).toContain('Materials')
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
        tryPatchBoundaryContentsInPlace(start as unknown as Comment, end as unknown as Comment, [
          next as unknown as Node,
        ]),
      ).toBe(true)
    })
  })

  it('switches Show branches through live insert updates', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const open = createDetachedRuntimeSignal<boolean | number>(container, 's0', true)
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              Show as any,
              {
                children: (value: unknown) =>
                  jsxDEV(
                    'strong',
                    { children: value === true ? 'open' : String(value) },
                    null,
                    false,
                    {},
                  ),
                fallback: (value: unknown) =>
                  jsxDEV(
                    'span',
                    { children: value === false ? 'closed' : String(value) },
                    null,
                    false,
                    {},
                  ),
                when: open.value,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect((host.childNodes[0] as FakeElement | undefined)?.tagName).toBe('strong')
      expect(host.textContent).toContain('open')

      open.value = false
      await flushAsync()

      expect((host.childNodes[0] as FakeElement | undefined)?.tagName).toBe('span')
      expect(host.textContent).toContain('closed')

      open.value = 0
      await flushAsync()
      expect((host.childNodes[0] as FakeElement | undefined)?.tagName).toBe('span')
      expect(host.textContent).toContain('0')
    })
  })

  it('preserves keyed For row identity when order changes', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const items = createDetachedRuntimeSignal(container, 's0', [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) =>
                  jsxDEV('li', { children: item.label }, null, false, {}),
                key: (item: { id: string; label: string }) => item.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const initialRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      expect(initialRows).toHaveLength(2)

      const [firstRow, secondRow] = initialRows
      items.value = [
        { id: 'b', label: 'B' },
        { id: 'a', label: 'A' },
      ]
      await flushAsync()

      const reorderedRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      expect(reorderedRows).toHaveLength(2)
      expect(reorderedRows[0]).toBe(secondRow)
      expect(reorderedRows[1]).toBe(firstRow)
      expect(reorderedRows.map((row) => row.textContent)).toEqual(['B', 'A'])
    })
  })

  it('moves only displaced keyed For boundaries when swapping distant rows', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const fourth = { id: 'd', label: 'D' }
      const fifth = { id: 'e', label: 'E' }
      const items = createDetachedRuntimeSignal(container, 's0', [
        first,
        second,
        third,
        fourth,
        fifth,
      ])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let insertBeforeCount = 0
      const originalInsertBefore = host.insertBefore.bind(host)
      host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
        insertBeforeCount += 1
        return originalInsertBefore(node, referenceNode)
      }) as typeof host.insertBefore
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) =>
                  jsxDEV('li', { children: item.label }, null, false, {}),
                key: (item: { id: string; label: string }) => item.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const initialRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      insertBeforeCount = 0
      items.value = [first, fourth, third, second, fifth]
      await flushAsync()

      const reorderedRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      expect(reorderedRows.map((row) => row.textContent)).toEqual(['A', 'D', 'C', 'B', 'E'])
      expect(reorderedRows[0]).toBe(initialRows[0])
      expect(reorderedRows[1]).toBe(initialRows[3])
      expect(reorderedRows[2]).toBe(initialRows[2])
      expect(reorderedRows[3]).toBe(initialRows[1])
      expect(reorderedRows[4]).toBe(initialRows[4])
      expect(insertBeforeCount).toBeLessThanOrEqual(2)
    })
  })

  it('avoids full item-only keyed For key recomputation when reordering rows by identity', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const fourth = { id: 'd', label: 'D' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third, fourth])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let keyCalls = 0
      let insertBeforeCount = 0
      const originalInsertBefore = host.insertBefore.bind(host)
      host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
        insertBeforeCount += 1
        return originalInsertBefore(node, referenceNode)
      }) as typeof host.insertBefore
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { value: { id: string; label: string } }) =>
                  jsxDEV('li', { children: item.value.label }, null, false, {}),
                key: (item: { id: string; label: string }) => {
                  keyCalls += 1
                  return item.id
                },
                reactiveIndex: false,
                reactiveRows: true,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(keyCalls).toBe(4)
      let fragmentCount = 0
      const fakeDocument = container.doc as unknown as FakeDocument
      const originalCreateDocumentFragment = fakeDocument.createDocumentFragment.bind(fakeDocument)
      fakeDocument.createDocumentFragment = () => {
        fragmentCount += 1
        return originalCreateDocumentFragment()
      }
      insertBeforeCount = 0
      items.value = [first, fourth, third, second]
      await flushAsync()

      const reorderedRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      expect(reorderedRows.map((row) => row.textContent)).toEqual(['A', 'D', 'C', 'B'])
      expect(insertBeforeCount).toBeLessThanOrEqual(2)
      expect(fragmentCount).toBe(0)
      expect(keyCalls).toBe(4)
    })
  })

  it('does not move surviving keyed For rows when removing one row', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const fourth = { id: 'd', label: 'D' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third, fourth])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let insertBeforeCount = 0
      const originalInsertBefore = host.insertBefore.bind(host)
      host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
        insertBeforeCount += 1
        return originalInsertBefore(node, referenceNode)
      }) as typeof host.insertBefore
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) =>
                  jsxDEV('li', { children: item.label }, null, false, {}),
                key: (item: { id: string; label: string }) => item.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const initialRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      insertBeforeCount = 0
      items.value = [first, second, fourth]
      await flushAsync()

      const survivingRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      expect(survivingRows.map((row) => row.textContent)).toEqual(['A', 'B', 'D'])
      expect(survivingRows[0]).toBe(initialRows[0])
      expect(survivingRows[1]).toBe(initialRows[1])
      expect(survivingRows[2]).toBe(initialRows[3])
      expect(insertBeforeCount).toBe(0)
    })
  })

  it('does not recompute item-only keyed For row keys when deleting rows by identity', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const fourth = { id: 'd', label: 'D' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third, fourth])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let keyCalls = 0
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) =>
                  jsxDEV('li', { children: item.label }, null, false, {}),
                key: (item: { id: string; label: string }) => {
                  keyCalls += 1
                  return item.id
                },
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(keyCalls).toBe(4)

      keyCalls = 0
      items.value = [first, second, fourth]
      await flushAsync()

      const rows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      expect(rows.map((row) => row.textContent)).toEqual(['A', 'B', 'D'])
      expect(keyCalls).toBe(0)
    })
  })

  it('does not treat ignored reactive row indexes as stable-order dirtiness', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 1, label: 'A' }
      const second = { id: 2, label: 'B' }
      const third = { id: 3, label: 'C' }
      const rows = createDetachedRuntimeSignal(container, 'rows', [first, second, third])
      const host = new FakeElement('tbody')
      const marker = new FakeComment('marker')
      let keyCalls = 0
      let renderCalls = 0
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insertFor(
          {
            arrSignal: rows,
            directRowUpdates: true,
            domOnlyRows: true,
            fn: (row: { value: { id: number; label: string } }) => {
              renderCalls += 1
              const element = new FakeElement('tr')
              const label = new FakeText(row.value.label)
              element.appendChild(label)
              textNodeSignalMember(row, 'label', label as unknown as Node)
              return element as unknown as JSX.Element
            },
            key: (row: { id: number }) => {
              keyCalls += 1
              return row.id
            },
            reactiveIndex: false,
            reactiveRows: true,
          },
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      await flushAsync()
      expect(keyCalls).toBe(3)
      expect(renderCalls).toBe(3)

      rows.value = [third, second, first]
      await flushAsync()
      expect(keyCalls).toBe(3)
      expect(renderCalls).toBe(3)

      rows.value = [third, second, { id: 1, label: 'A2' }]
      await flushAsync()

      const renderedRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'tr',
      )
      expect(renderedRows.map((row) => row.textContent)).toEqual(['C', 'B', 'A2'])
      expect(keyCalls).toBe(4)
      expect(renderCalls).toBe(3)
    })
  })

  it('uses compiler-provided keyed For member keys without calling the key function', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let keyCalls = 0
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { value: { id: string; label: string } }) =>
                  jsxDEV('li', { children: item.value.label }, null, false, {}),
                key: (item: { id: string; label: string }) => {
                  keyCalls += 1
                  return item.id
                },
                keyMember: 'id',
                reactiveIndex: false,
                reactiveRows: true,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(keyCalls).toBe(0)

      items.value = [third, second, first]
      await flushAsync()

      const rows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      expect(rows.map((row) => row.textContent)).toEqual(['C', 'B', 'A'])
      expect(keyCalls).toBe(0)
    })
  })

  it('does not reuse keyed ranges across sibling parents with overlapping keys', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const page = createDetachedRuntimeSignal(container, 's0', {
        headings: [{ key: 'Why eclipsa?', label: 'Toc Why eclipsa?' }],
        sections: [
          { key: 'Getting Started', label: 'Nav Getting Started' },
          { key: 'Materials', label: 'Nav Materials' },
          { key: 'Integrations', label: 'Nav Integrations' },
        ],
      })
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              'div',
              {
                children: [
                  jsxDEV(
                    'nav',
                    {
                      children: page.value.sections.map((section) =>
                        jsxDEV('a', { children: section.label }, section.key, false, {}),
                      ),
                    },
                    null,
                    false,
                    {},
                  ),
                  jsxDEV(
                    'aside',
                    {
                      children: page.value.headings.map((heading) =>
                        jsxDEV('a', { children: heading.label }, heading.key, false, {}),
                      ),
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
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const getRoot = () =>
        host.childNodes.find(
          (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'div',
        )!
      const getRegionLinks = (tagName: 'aside' | 'nav') => {
        const region = getRoot().childNodes.find(
          (node): node is FakeElement => node instanceof FakeElement && node.tagName === tagName,
        )
        return (
          region?.childNodes.filter(
            (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'a',
          ) ?? []
        )
      }

      expect(getRegionLinks('nav').map((link) => link.textContent)).toEqual([
        'Nav Getting Started',
        'Nav Materials',
        'Nav Integrations',
      ])
      expect(getRegionLinks('aside').map((link) => link.textContent)).toEqual(['Toc Why eclipsa?'])

      const initialNavMaterialsLink = getRegionLinks('nav')[1]!

      page.value = {
        headings: [
          { key: 'Materials', label: 'Toc Materials' },
          { key: 'Integrations', label: 'Toc Integrations' },
        ],
        sections: [...page.value.sections],
      }
      await flushAsync()

      const navLinks = getRegionLinks('nav')
      const asideLinks = getRegionLinks('aside')
      expect(navLinks.map((link) => link.textContent)).toEqual([
        'Nav Getting Started',
        'Nav Materials',
        'Nav Integrations',
      ])
      expect(asideLinks.map((link) => link.textContent)).toEqual([
        'Toc Materials',
        'Toc Integrations',
      ])
      expect(asideLinks[0]).not.toBe(initialNavMaterialsLink)
    })
  })

  it('keeps keyed child component contents when same-key items survive an update', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const items = createDetachedRuntimeSignal(container, 's0', [
        { id: 'first-example', label: 'First example' },
        { id: 'returned-handle', label: 'Returned handle' },
        { id: 'form-submission', label: 'Form submission' },
      ])
      const TocLinkBody = (props: { label: string }) =>
        jsxDEV('a', { children: props.label }, null, false, {})
      const TocLink = __eclipsaComponent(TocLinkBody, 'keyed-toc-link', () => [])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              'aside',
              {
                children: items.value.map((item) =>
                  jsxDEV(TocLink, { label: item.label }, item.id, false, {}),
                ),
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const getLinks = () =>
        host.childNodes.flatMap((node) =>
          node instanceof FakeElement && node.tagName === 'aside'
            ? node.childNodes.filter(
                (child): child is FakeElement =>
                  child instanceof FakeElement && child.tagName === 'a',
              )
            : [],
        )

      expect(getLinks().map((link) => link.textContent)).toEqual([
        'First example',
        'Returned handle',
        'Form submission',
      ])

      items.value = [
        { id: 'first-example', label: 'First example' },
        { id: 'returned-handle', label: 'Returned handle' },
        { id: 'manual-reload', label: 'Manual reload' },
      ]
      await flushAsync()

      expect(getLinks().map((link) => link.textContent)).toEqual([
        'First example',
        'Returned handle',
        'Manual reload',
      ])
    })
  })

  it('renders keyed row elements inside For after live updates', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const todos = createDetachedRuntimeSignal(container, 's0', ['ToDo1'])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              'ul',
              {
                children: jsxDEV(
                  For as any,
                  {
                    arr: todos.value,
                    fn: (todo: string, i: number) => jsxDEV('li', { children: todo }, i, false, {}),
                  },
                  null,
                  false,
                  {},
                ),
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const getRows = (): FakeElement[] =>
        host.childNodes.flatMap((node) =>
          node instanceof FakeComment || !(node instanceof FakeElement)
            ? []
            : node.tagName === 'ul'
              ? node.childNodes.filter(
                  (child): child is FakeElement =>
                    child instanceof FakeElement && child.tagName === 'li',
                )
              : [],
        )

      expect(getRows()).toHaveLength(1)
      todos.value = ['ToDo1', 'Ship e2e']
      await flushAsync()

      const rows = getRows()
      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.textContent)).toEqual(['ToDo1', 'Ship e2e'])
    })
  })

  it('batches initial keyed For row insertion through a single parent insert', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const items = createDetachedRuntimeSignal(container, 's0', [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)
      let insertBeforeCount = 0
      const originalInsertBefore = host.insertBefore.bind(host)
      host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
        insertBeforeCount += 1
        return originalInsertBefore(node, referenceNode)
      }) as typeof host.insertBefore

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) =>
                  jsxDEV('li', { children: item.label }, null, false, {}),
                key: (item: { id: string; label: string }) => item.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(insertBeforeCount).toBe(1)
    })
  })

  it('appends keyed For rows after map-free initial row creation', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) =>
                  jsxDEV('li', { children: item.label }, null, false, {}),
                key: (item: { id: string; label: string }) => item.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const initialRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      items.value = [first, second, third]
      await flushAsync()

      const rows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      expect(rows).toHaveLength(3)
      expect(rows[0]).toBe(initialRows[0])
      expect(rows[1]).toBe(initialRows[1])
      expect(rows.map((row) => row.textContent)).toEqual(['A', 'B', 'C'])
    })
  })

  it('rerenders only changed keyed For rows when surviving items keep the same key and index', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third])
      const renderCounts = new Map<string, number>()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) => {
                  renderCounts.set(item.id, (renderCounts.get(item.id) ?? 0) + 1)
                  return jsxDEV('li', { children: item.label }, null, false, {})
                },
                key: (item: { id: string; label: string }) => item.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(renderCounts).toEqual(
        new Map([
          ['a', 1],
          ['b', 1],
          ['c', 1],
        ]),
      )

      items.value = [first, { id: 'b', label: 'B2' }, third]
      await flushAsync()

      expect(renderCounts).toEqual(
        new Map([
          ['a', 1],
          ['b', 2],
          ['c', 1],
        ]),
      )

      const rows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
      )
      expect(rows.map((row) => row.textContent)).toEqual(['A', 'B2', 'C'])
    })
  })

  it('does not reinsert stable keyed For rows when only row contents change', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let insertBeforeCount = 0
      const originalInsertBefore = host.insertBefore.bind(host)
      host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
        insertBeforeCount += 1
        return originalInsertBefore(node, referenceNode)
      }) as typeof host.insertBefore
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) =>
                  jsxDEV('li', { children: item.label }, null, false, {}),
                key: (item: { id: string; label: string }) => item.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      insertBeforeCount = 0
      items.value = [first, { id: 'b', label: 'B2' }, third]
      await flushAsync()

      expect(insertBeforeCount).toBe(0)
    })
  })

  it('updates benchmark-style keyed For rows across repeated every-10th-row patches', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const rows = createDetachedRuntimeSignal(
        container,
        'rows',
        Array.from({ length: 1000 }, (_, index) => ({
          id: index + 1,
          label: `Row ${index + 1}`,
        })),
      )
      const selected = createDetachedRuntimeSignal<number | null>(container, 'selected', null)
      const host = new FakeElement('tbody')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      const getRenderedLabels = () =>
        host.childNodes
          .filter(
            (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'tr',
          )
          .map((row) => {
            const labelCell = row.childNodes[1]
            if (!(labelCell instanceof FakeElement)) {
              return ''
            }
            const anchor = labelCell.childNodes[0]
            return anchor instanceof FakeElement ? anchor.textContent : ''
          })

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: rows.value,
                fn: (row: { id: number; label: string }) => {
                  const rowId = row.id
                  const label = row.label
                  const handleSelect = () => {
                    selected.value = rowId
                  }

                  return jsxDEV(
                    'tr',
                    {
                      class: (() => (selected.value === rowId ? 'danger' : '')) as () => string,
                      children: [
                        jsxDEV('td', { class: 'col-md-1', children: rowId }, null, false, {}),
                        jsxDEV(
                          'td',
                          {
                            class: 'col-md-4',
                            children: jsxDEV(
                              'a',
                              { onClick: handleSelect, children: label },
                              null,
                              false,
                              {},
                            ),
                          },
                          null,
                          false,
                          {},
                        ),
                        jsxDEV('td', { class: 'col-md-1' }, null, false, {}),
                        jsxDEV('td', { class: 'col-md-6' }, null, false, {}),
                      ],
                    },
                    null,
                    true,
                    {},
                  )
                },
                key: (row: { id: number; label: string }) => row.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      for (let iteration = 0; iteration < 16; iteration += 1) {
        rows.value = rows.value.map((row, index) =>
          index % 10 === 0
            ? {
                ...row,
                label: `${row.label} !!!`,
              }
            : row,
        )
        await flushAsync()
      }

      const labels = getRenderedLabels()
      expect(labels).toHaveLength(1000)
      expect(labels[990]).toBe(
        'Row 991 !!! !!! !!! !!! !!! !!! !!! !!! !!! !!! !!! !!! !!! !!! !!! !!!',
      )
      expect(labels[991]).toBe('Row 992')
    })
  })

  it('keeps DOM-only keyed For row owners out of the component registry', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const rows = createDetachedRuntimeSignal(container, 'rows', [
        { id: 1, label: 'Row 1' },
        { id: 2, label: 'Row 2' },
        { id: 3, label: 'Row 3' },
      ])
      const selected = createDetachedRuntimeSignal<number | null>(container, 'selected', null)
      const host = new FakeElement('tbody')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: rows.value,
                fn: (row: { id: number; label: string }) => {
                  const rowId = row.id
                  return jsxDEV(
                    'tr',
                    {
                      class: (() => (selected.value === rowId ? 'danger' : '')) as () => string,
                      children: [
                        jsxDEV('td', { children: row.id }, null, false, {}),
                        jsxDEV(
                          'td',
                          {
                            children: jsxDEV('a', { children: row.label }, null, false, {}),
                          },
                          null,
                          false,
                          {},
                        ),
                      ],
                    },
                    null,
                    true,
                    {},
                  )
                },
                key: (row: { id: number; label: string }) => row.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const registeredRowOwners = [...container.components.values()].filter(
        (component) =>
          component.symbol === CLIENT_INSERT_OWNER_SYMBOL && component.id.includes('.'),
      )
      expect(registeredRowOwners).toHaveLength(0)

      selected.value = 2
      await flushAsync()

      expect(
        [...container.components.values()].filter(
          (component) =>
            component.symbol === CLIENT_INSERT_OWNER_SYMBOL && component.id.includes('.'),
        ),
      ).toHaveLength(0)
    })
  })

  it('does not recompute keyed For row keys for untouched stable rows', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      let keyCalls = 0
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) =>
                  jsxDEV('li', { children: item.label }, null, false, {}),
                key: (item: { id: string; label: string }) => {
                  keyCalls += 1
                  return item.id
                },
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(keyCalls).toBe(3)

      keyCalls = 0
      items.value = [first, { id: 'b', label: 'B2' }, third]
      await flushAsync()

      expect(keyCalls).toBe(1)
    })
  })

  it('updates same-key keyed rows through row-local signals without rerunning the row callback', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third])
      const renderCounts = new Map<string, number>()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { value: { id: string; label: string } }, i: { value: number }) => {
                  renderCounts.set(item.value.id, (renderCounts.get(item.value.id) ?? 0) + 1)
                  const li = new FakeElement('li')
                  const marker = new FakeComment('marker')
                  li.appendChild(marker)
                  insert(
                    () => `${i.value}:${item.value.label}`,
                    li as unknown as Node,
                    marker as unknown as Node,
                  )
                  return li as unknown as JSX.Element
                },
                key: (item: { id: string; label: string }) => item.id,
                reactiveRows: true,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(renderCounts).toEqual(
        new Map([
          ['a', 1],
          ['b', 1],
          ['c', 1],
        ]),
      )
      const getRowText = (row: FakeElement) =>
        row.childNodes.find((node): node is FakeText => node instanceof FakeText)?.data ?? ''
      const getRowTexts = () =>
        host.childNodes
          .filter(
            (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
          )
          .map(getRowText)
      expect(getRowTexts()).toEqual(['0:A', '1:B', '2:C'])

      items.value = [first, { id: 'b', label: 'B2' }, third]
      await flushAsync()

      expect(renderCounts).toEqual(
        new Map([
          ['a', 1],
          ['b', 1],
          ['c', 1],
        ]),
      )
      expect(getRowTexts()).toEqual(['0:A', '1:B2', '2:C'])

      items.value = [third, first, { id: 'b', label: 'B2' }]
      await flushAsync()

      expect(renderCounts).toEqual(
        new Map([
          ['a', 1],
          ['b', 1],
          ['c', 1],
        ]),
      )
      expect(getRowTexts()).toEqual(['0:C', '1:A', '2:B2'])
    })
  })

  it('refreshes keyed row node counts when text bindings later promote into element inserts', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A', decorated: false }
      const second = { id: 'b', label: 'B', decorated: false }
      const third = { id: 'c', label: 'C', decorated: false }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      const getRows = () =>
        host.childNodes.filter(
          (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
        )

      const getVisibleText = (node: FakeNode): string => {
        if (node instanceof FakeComment) {
          return ''
        }
        if (node instanceof FakeText) {
          return node.data
        }
        return node.childNodes.map(getVisibleText).join('')
      }

      const getRowSummaries = () =>
        getRows().map((row) => ({
          id: row.attributes.get('data-row-id') ?? '',
          hasSpan: row.childNodes.some(
            (node) => node instanceof FakeElement && node.tagName === 'span',
          ),
          text: getVisibleText(row),
        }))

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (
                  item: { value: { id: string; label: string; decorated: boolean } },
                  i: { value: number },
                ) => {
                  const li = new FakeElement('li')
                  li.setAttribute('data-row-id', item.value.id)
                  const rowMarker = new FakeComment('marker')
                  li.appendChild(rowMarker)
                  text(
                    () =>
                      item.value.decorated
                        ? jsxDEV(
                            'span',
                            { children: `${i.value}:${item.value.label}` },
                            null,
                            false,
                            {},
                          )
                        : `${i.value}:${item.value.label}`,
                    li as unknown as Node,
                    rowMarker as unknown as Node,
                  )
                  return li as unknown as JSX.Element
                },
                key: (item: { id: string }) => item.id,
                reactiveRows: true,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(getRowSummaries()).toEqual([
        { id: 'a', text: '0:A', hasSpan: false },
        { id: 'b', text: '1:B', hasSpan: false },
        { id: 'c', text: '2:C', hasSpan: false },
      ])

      items.value = [first, { id: 'b', label: 'B2', decorated: true }, third]
      await flushAsync()

      expect(getRowSummaries()).toEqual([
        { id: 'a', text: '0:A', hasSpan: false },
        { id: 'b', text: '1:B2', hasSpan: true },
        { id: 'c', text: '2:C', hasSpan: false },
      ])

      items.value = [third, first, { id: 'b', label: 'B2', decorated: true }]
      await flushAsync()

      expect(getRowSummaries()).toEqual([
        { id: 'c', text: '0:C', hasSpan: false },
        { id: 'a', text: '1:A', hasSpan: false },
        { id: 'b', text: '2:B2', hasSpan: true },
      ])
    })
  })

  it('does not subscribe keyed row owners when reactive row callbacks read stable row fields outside effects', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second])
      let renderCount = 0
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { value: { id: string; label: string } }) => {
                  renderCount += 1
                  const rowId = item.value.id
                  const li = new FakeElement('li')
                  const marker = new FakeComment('marker')
                  li.appendChild(marker)
                  insert(
                    () => `${rowId}:${item.value.label}`,
                    li as unknown as Node,
                    marker as unknown as Node,
                  )
                  return li as unknown as JSX.Element
                },
                key: (item: { id: string; label: string }) => item.id,
                reactiveRows: true,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(renderCount).toBe(2)

      items.value = [first, { id: 'b', label: 'B2' }]
      await flushAsync()

      expect(renderCount).toBe(2)
      let rowTexts = host.childNodes
        .filter((node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li')
        .map(
          (row) =>
            row.childNodes.find((node): node is FakeText => node instanceof FakeText)?.data ?? '',
        )
      expect(rowTexts).toEqual(['a:A', 'b:B2'])

      items.value = [{ id: 'b', label: 'B2' }, first]
      await flushAsync()

      expect(renderCount).toBe(2)
      rowTexts = host.childNodes
        .filter((node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li')
        .map(
          (row) =>
            row.childNodes.find((node): node is FakeText => node instanceof FakeText)?.data ?? '',
        )
      expect(rowTexts).toEqual(['b:B2', 'a:A'])
    })
  })

  it('batches reactive keyed For row signal updates so each row effect reruns once per reconciliation', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const first = { id: 'a', label: 'A' }
      const second = { id: 'b', label: 'B' }
      const third = { id: 'c', label: 'C' }
      const items = createDetachedRuntimeSignal(container, 's0', [first, second, third])
      const effectCounts = new Map<string, number>()
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { value: { id: string; label: string } }, i: { value: number }) => {
                  const li = new FakeElement('li')
                  const rowMarker = new FakeComment('marker')
                  li.appendChild(rowMarker)
                  insert(
                    () => {
                      const id = item.value.id
                      effectCounts.set(id, (effectCounts.get(id) ?? 0) + 1)
                      return `${i.value}:${item.value.label}`
                    },
                    li as unknown as Node,
                    rowMarker as unknown as Node,
                  )
                  return li as unknown as JSX.Element
                },
                key: (item: { id: string; label: string }) => item.id,
                reactiveRows: true,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(effectCounts).toEqual(
        new Map([
          ['a', 1],
          ['b', 1],
          ['c', 1],
        ]),
      )

      items.value = [third, first, { id: 'b', label: 'B2' }]
      await flushAsync()

      expect(effectCounts).toEqual(
        new Map([
          ['a', 2],
          ['b', 2],
          ['c', 2],
        ]),
      )
    })
  })

  it('preserves static text when inserting a primitive before a template marker', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const count = createDetachedRuntimeSignal(container, 's0', 0)
      const button = new FakeElement('button')
      const staticText = new FakeText('Layout count: ')
      const marker = new FakeComment('marker')
      button.appendChild(staticText)
      button.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() => count.value) as Parameters<typeof insert>[0],
          button as unknown as Node,
          marker as unknown as Node,
        )
      })

      expect(button.childNodes).toHaveLength(3)
      expect(button.childNodes[0]).toBe(staticText)
      expect((button.childNodes[1] as FakeText).data).toBe('0')

      count.value = 1
      await flushAsync()

      expect(button.childNodes).toHaveLength(3)
      expect(button.childNodes[0]).toBe(staticText)
      expect((button.childNodes[1] as FakeText).data).toBe('1')
    })
  })

  it('normalizes render references without an explicit static flag during serialization', () => {
    const container = createContainer()
    const serialized = serializeContainerValue(container, {
      props: {
        src: '/app/+client.dev.tsx',
        type: 'module',
      },
      type: 'script',
    })

    expect(serialized).toEqual({
      __eclipsa_type: 'ref',
      data: [
        'element',
        'script',
        null,
        {
          __eclipsa_type: 'object',
          entries: [
            ['src', '/app/+client.dev.tsx'],
            ['type', 'module'],
          ],
        },
        null,
        false,
        null,
      ],
      kind: 'render',
      token: 'jsx',
    })

    expect(deserializeContainerValue(container, serialized as any)).toEqual({
      isStatic: false,
      key: undefined,
      metadata: undefined,
      props: {
        src: '/app/+client.dev.tsx',
        type: 'module',
      },
      type: 'script',
    })
  })

  it('runs materialized symbol references with normalized nested symbol captures', async () => {
    const container = createContainer()
    const moduleUrl = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`
    const callsKey = '__eclipsaRuntimeMaterializedSymbolCalls'
    const globals = globalThis as typeof globalThis & {
      __eclipsaRuntimeMaterializedSymbolCalls?: unknown[]
    }
    globals[callsKey] = []
    container.symbols.set(
      'outer-materialized-symbol',
      moduleUrl(`
        export default (__scope, value) => {
          return __scope[0](value + ':inner')
        }
      `),
    )
    container.symbols.set(
      'inner-materialized-symbol',
      moduleUrl(`
        export default (__scope, value) => {
          globalThis.${callsKey}.push({
            capture: __scope[0],
            value
          })
        }
      `),
    )

    const inner = __eclipsaLazy(
      'inner-materialized-symbol',
      () => {},
      () => ['captured'],
    )
    const outer = __eclipsaLazy(
      'outer-materialized-symbol',
      () => {},
      () => [inner],
    )
    const restored = deserializeContainerValue(
      container,
      serializeContainerValue(container, outer) as never,
    ) as (value: string) => unknown

    await restored('open')

    expect(globals[callsKey]).toEqual([
      {
        capture: 'captured',
        value: 'open:inner',
      },
    ])
    delete globals[callsKey]
  })

  it('serializes computed handles as computed-signal references without losing computed semantics', () => {
    withFakeNodeGlobal(() => {
      const container = createContainer()
      let count!: { value: number }
      let computed!: { value: number }

      const ComputedBody = () => {
        count = useSignal(1)
        computed = useComputed(() => count.value * 2, [count])
        return 'ready'
      }

      const ComputedComponent = __eclipsaComponent(
        ComputedBody,
        'computed-serialization-component',
        () => [],
      )

      withRuntimeContainer(container, () => {
        const nodes = renderClientInsertable(
          jsxDEV(ComputedComponent as any, {}, null, false, {}),
          container,
        )
        const host = new FakeElement('div')
        for (const node of nodes as FakeNode[]) {
          host.appendChild(node)
        }
      })

      const serialized = serializeContainerValue(container, {
        computed,
      })

      expect(serialized).toEqual({
        __eclipsa_type: 'object',
        entries: [
          [
            'computed',
            {
              __eclipsa_type: 'ref',
              kind: 'computed-signal',
              token: 's1',
            },
          ],
        ],
      })

      const restored = deserializeContainerValue(container, serialized as any) as {
        computed: { value: number }
      }

      expect(restored.computed.value).toBe(2)

      count.value = 3

      expect(restored.computed.value).toBe(6)
      expect(() =>
        serializeContainerValue(container, {
          computed: restored.computed,
        }),
      ).not.toThrow()
    })
  })

  it('repopulates keyed For ranges after clearing them', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const items = createDetachedRuntimeSignal(container, 's0', [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ])
      const host = new FakeElement('div')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insert(
          (() =>
            jsxDEV(
              For as any,
              {
                arr: items.value,
                fn: (item: { id: string; label: string }) =>
                  jsxDEV('li', { children: item.label }, null, false, {}),
                key: (item: { id: string; label: string }) => item.id,
              },
              null,
              false,
              {},
            )) as Parameters<typeof insert>[0],
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      const getRows = () =>
        host.childNodes.filter(
          (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'li',
        )

      expect(getRows().map((row) => row.textContent)).toEqual(['A', 'B'])

      items.value = []
      await flushAsync()
      expect(getRows()).toHaveLength(0)

      items.value = [
        { id: 'a', label: 'A' },
        { id: 'c', label: 'C' },
      ]
      await flushAsync()
      expect(getRows().map((row) => row.textContent)).toEqual(['A', 'C'])
    })
  })

  it('repopulates compiler-lowered For inserts after initially empty rows', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const rows = createDetachedRuntimeSignal<
        Array<{
          id: number
          label: string
        }>
      >(container, 'rows', [])
      const host = new FakeElement('tbody')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insertFor(
          {
            get arr() {
              return rows.value
            },
            fn: (row: { value: { id: number; label: string } }) =>
              jsxDEV(
                'tr',
                {
                  children: [
                    jsxDEV('td', { children: row.value.id }, null, false, {}),
                    jsxDEV('td', { children: row.value.label }, null, false, {}),
                  ],
                },
                null,
                true,
                {},
              ),
            key: (row: { id: number }) => row.id,
            reactiveRows: true,
          },
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      rows.value = [
        { id: 1, label: 'A' },
        { id: 2, label: 'B' },
      ]
      await flushAsync()

      const renderedRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'tr',
      )
      expect(renderedRows.map((row) => row.textContent)).toEqual(['1A', '2B'])
    })
  })

  it('runs compiler-lowered For inserts directly from arrSignal when static props allow it', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const rows = createDetachedRuntimeSignal(container, 'rows', [{ id: 1, label: 'A' }])
      const host = new FakeElement('tbody')
      const marker = new FakeComment('marker')
      let arrGetterReads = 0
      let staticPropReads = 0
      host.appendChild(marker)
      const props = new Proxy(
        {
          get arr() {
            arrGetterReads += 1
            return rows.value
          },
          arrSignal: rows,
          fn: (row: { value: { id: number; label: string } }) =>
            jsxDEV('tr', { children: row.value.label }, null, false, {}),
          key: (row: { id: number }) => row.id,
          reactiveRows: true,
        },
        {
          get(target, prop, receiver) {
            if (prop === 'fn' || prop === 'key' || prop === 'reactiveRows') {
              staticPropReads += 1
            }
            return Reflect.get(target, prop, receiver)
          },
        },
      )

      withRuntimeContainer(container, () => {
        insertFor(props, host as unknown as Node, marker as unknown as Node)
      })
      expect(staticPropReads).toBe(3)

      rows.value = [
        { id: 1, label: 'A' },
        { id: 2, label: 'B' },
      ]
      await flushAsync()

      const renderedRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'tr',
      )
      expect(renderedRows.map((row) => row.textContent)).toEqual(['A', 'B'])
      expect(arrGetterReads).toBe(0)
      expect(staticPropReads).toBe(3)
    })
  })

  it('updates compiler-lowered reactive row member effects after rows are patched and removed', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const rows = createDetachedRuntimeSignal(container, 'rows', [
        { id: 1, label: 'A' },
        { id: 2, label: 'B' },
      ])
      const host = new FakeElement('tbody')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insertFor(
          {
            arrSignal: rows,
            fn: (row: { value: { id: number; label: string } }) => {
              const tr = new FakeElement('tr')
              const label = new FakeText(row.value.label)
              tr.appendChild(label)
              textNodeSignalMember(row, 'label', label as unknown as Node)
              return tr as unknown as JSX.Element
            },
            key: (row: { id: number }) => row.id,
            keyMember: 'id',
            reactiveRows: true,
          },
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      rows.value = [
        { id: 2, label: 'B2' },
        { id: 3, label: 'C' },
      ]
      await flushAsync()

      const renderedRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'tr',
      )
      expect(renderedRows.map((row) => row.textContent)).toEqual(['B2', 'C'])

      rows.value = [{ id: 3, label: 'C2' }]
      await flushAsync()

      expect(renderedRows[0]?.parentNode).toBeNull()
      const remainingRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'tr',
      )
      expect(remainingRows.map((row) => row.textContent)).toEqual(['C2'])
    })
  })

  it('cleans DOM-only keyed row signal effects when rows are removed', async () => {
    await withFakeNodeGlobal(async () => {
      const container = createContainer()
      const rows = createDetachedRuntimeSignal(container, 'rows', [
        { id: 1, label: 'A' },
        { id: 2, label: 'B' },
      ])
      const selected = createDetachedRuntimeSignal(container, 'selected', 2)
      const host = new FakeElement('tbody')
      const marker = new FakeComment('marker')
      host.appendChild(marker)

      withRuntimeContainer(container, () => {
        insertFor(
          {
            arrSignal: rows,
            directRowUpdates: true,
            domOnlyRows: true,
            fn: (row: { value: { id: number; label: string } }) => {
              const tr = new FakeElement('tr')
              const label = new FakeText(row.value.label)
              tr.appendChild(label)
              classSignalEquals(tr as unknown as Element, selected, row.value.id, 'danger', '')
              textNodeSignalMember(row, 'label', label as unknown as Node)
              return tr as unknown as JSX.Element
            },
            key: (row: { id: number }) => row.id,
            keyMember: 'id',
            reactiveRows: true,
          },
          host as unknown as Node,
          marker as unknown as Node,
        )
      })

      await flushAsync()

      const renderedRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'tr',
      )
      const removedSelectedRow = renderedRows[1]!
      expect(removedSelectedRow.className).toBe('danger')
      expect([...container.components.keys()].some((id) => id.includes('.'))).toBe(false)

      rows.value = [{ id: 1, label: 'A2' }]
      await flushAsync()
      expect(removedSelectedRow.parentNode).toBeNull()

      selected.value = 1
      rows.value = [{ id: 1, label: 'A3' }]
      await flushAsync()

      expect(removedSelectedRow.className).toBe('danger')
      const remainingRows = host.childNodes.filter(
        (node): node is FakeElement => node instanceof FakeElement && node.tagName === 'tr',
      )
      expect(remainingRows).toHaveLength(1)
      expect(remainingRows[0]?.className).toBe('danger')
      expect(remainingRows[0]?.textContent).toBe('A3')
    })
  })
})
