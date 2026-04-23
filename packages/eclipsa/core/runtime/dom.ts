type DomConstructorName =
  | 'Element'
  | 'HTMLElement'
  | 'HTMLInputElement'
  | 'HTMLSelectElement'
  | 'HTMLTextAreaElement'
  | 'HTMLAnchorElement'
  | 'HTMLFormElement'

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'

export interface FocusSnapshot {
  path: number[]
  selectionDirection?: 'backward' | 'forward' | 'none' | null
  selectionEnd?: number | null
  selectionStart?: number | null
}

export interface PendingFocusRestore {
  snapshot: FocusSnapshot
}

type ManagedAttributeSnapshot = Set<string> | readonly string[]

const managedElementAttributes = new WeakMap<Element, ManagedAttributeSnapshot>()
const insertMarkerNodeCounts = new WeakMap<Comment, number>()
const managedRememberedSubtrees = new WeakSet<Node>()

const isObjectLike = (value: unknown): value is Record<PropertyKey, unknown> =>
  !!value && (typeof value === 'object' || typeof value === 'function')

const getOwnerDefaultView = (value: unknown) => {
  if (!isObjectLike(value) || !('ownerDocument' in value)) {
    return null
  }

  return (value as { ownerDocument?: Document | null }).ownerDocument?.defaultView ?? null
}

const getDefaultView = (value: unknown) => {
  if (!isObjectLike(value) || !('defaultView' in value)) {
    return null
  }

  return (value as { defaultView?: Window | null }).defaultView ?? null
}

const isNodeType = (value: unknown, nodeType: number) =>
  isObjectLike(value) &&
  'nodeType' in value &&
  (value as { nodeType?: unknown }).nodeType === nodeType

const hasTagName = (value: unknown): value is { namespaceURI?: string | null; tagName: string } =>
  isObjectLike(value) &&
  'tagName' in value &&
  typeof (value as { tagName?: unknown }).tagName === 'string'

const isHtmlNamespace = (value: { namespaceURI?: string | null }) =>
  value.namespaceURI === undefined ||
  value.namespaceURI === null ||
  value.namespaceURI === HTML_NAMESPACE

const isHtmlElementTag = (value: unknown, tagName: string) =>
  isNodeType(value, 1) &&
  hasTagName(value) &&
  isHtmlNamespace(value) &&
  value.tagName.toUpperCase() === tagName

const isDomInstance = <T>(value: unknown, name: DomConstructorName): value is T => {
  if (!isObjectLike(value)) {
    return false
  }

  const globalDomContext = globalThis as unknown as Record<DomConstructorName, unknown>
  const globalDefaultView = globalThis as unknown as Window
  const globalCtor = globalDomContext[name]
  if (typeof globalCtor === 'function' && value instanceof globalCtor) {
    return true
  }

  const ownerDefaultView = getOwnerDefaultView(value)
  if (ownerDefaultView && ownerDefaultView !== globalDefaultView) {
    const ownerCtor = (ownerDefaultView as unknown as Record<DomConstructorName, unknown>)[name]
    if (typeof ownerCtor === 'function' && value instanceof ownerCtor) {
      return true
    }
  }

  const defaultView = getDefaultView(value)
  if (defaultView && defaultView !== globalDefaultView && defaultView !== ownerDefaultView) {
    const defaultCtor = (defaultView as unknown as Record<DomConstructorName, unknown>)[name]
    if (typeof defaultCtor === 'function' && value instanceof defaultCtor) {
      return true
    }
  }
  return false
}

export const hasOwnerDocument = (
  value: unknown,
): value is ParentNode & { ownerDocument: Document } =>
  isObjectLike(value) &&
  'ownerDocument' in value &&
  !!(value as { ownerDocument?: Document | null }).ownerDocument

export const isElementNode = (value: unknown): value is Element =>
  (isNodeType(value, 1) &&
    hasTagName(value) &&
    typeof (value as { getAttribute?: unknown }).getAttribute === 'function') ||
  isDomInstance<Element>(value, 'Element') ||
  isDomInstance<HTMLElement>(value, 'HTMLElement')

export const isHTMLElementNode = (value: unknown): value is HTMLElement =>
  (isNodeType(value, 1) &&
    hasTagName(value) &&
    isHtmlNamespace(value) &&
    typeof (value as { focus?: unknown }).focus === 'function') ||
  isDomInstance<HTMLElement>(value, 'HTMLElement')

export const isHTMLInputElementNode = (value: unknown): value is HTMLInputElement =>
  isNodeType(value, 1) && hasTagName(value)
    ? isHtmlElementTag(value, 'INPUT')
    : isDomInstance<HTMLInputElement>(value, 'HTMLInputElement')

export const isHTMLSelectElementNode = (value: unknown): value is HTMLSelectElement =>
  isNodeType(value, 1) && hasTagName(value)
    ? isHtmlElementTag(value, 'SELECT')
    : isDomInstance<HTMLSelectElement>(value, 'HTMLSelectElement')

export const isHTMLTextAreaElementNode = (value: unknown): value is HTMLTextAreaElement =>
  isNodeType(value, 1) && hasTagName(value)
    ? isHtmlElementTag(value, 'TEXTAREA')
    : isDomInstance<HTMLTextAreaElement>(value, 'HTMLTextAreaElement')

export const isTextEntryElement = (
  value: unknown,
): value is HTMLInputElement | HTMLTextAreaElement =>
  isHTMLInputElementNode(value) || isHTMLTextAreaElementNode(value)

export const isHTMLAnchorElementNode = (value: unknown): value is HTMLAnchorElement =>
  isNodeType(value, 1) && hasTagName(value)
    ? isHtmlElementTag(value, 'A')
    : isDomInstance<HTMLAnchorElement>(value, 'HTMLAnchorElement')

export const isHTMLFormElementNode = (value: unknown): value is HTMLFormElement =>
  isNodeType(value, 1) && hasTagName(value)
    ? isHtmlElementTag(value, 'FORM')
    : isDomInstance<HTMLFormElement>(value, 'HTMLFormElement')

export const listNodeChildren = (
  node: { childNodes?: Iterable<Node> | ArrayLike<Node> } | null | undefined,
) => {
  const childNodes = node?.childNodes
  if (!childNodes) {
    return [] as Node[]
  }
  if (Array.isArray(childNodes)) {
    return childNodes.slice()
  }
  if (typeof (childNodes as ArrayLike<Node>).length === 'number') {
    const length = (childNodes as ArrayLike<Node>).length
    const children = Array.from({ length }, () => null as unknown as Node)
    for (let index = 0; index < length; index += 1) {
      children[index] = (childNodes as ArrayLike<Node>)[index]!
    }
    return children
  }
  return [...(childNodes as Iterable<Node>)]
}

const getElementAttributeNames = (element: Element): string[] => {
  const withGetAttributeNames = element as Element & { getAttributeNames?: () => string[] }
  if (typeof withGetAttributeNames.getAttributeNames === 'function') {
    return withGetAttributeNames.getAttributeNames.call(element)
  }

  const attributes = (
    element as Element & {
      attributes?: Map<string, string> | ArrayLike<Attr | { name?: string }>
    }
  ).attributes
  if (attributes instanceof Map) {
    return [...attributes.keys()]
  }
  if (attributes && typeof attributes.length === 'number') {
    const names: string[] = []
    for (let index = 0; index < attributes.length; index += 1) {
      const attribute = attributes[index]
      if (attribute && typeof attribute === 'object' && 'name' in attribute) {
        const name = attribute.name
        if (typeof name === 'string') {
          names.push(name)
        }
      }
    }
    return names
  }

  return []
}

const hasElementAttribute = (element: Element, name: string): boolean | null => {
  const withHasAttribute = element as Element & { hasAttribute?: (name: string) => boolean }
  if (typeof withHasAttribute.hasAttribute === 'function') {
    return withHasAttribute.hasAttribute.call(element, name)
  }

  const withGetAttribute = element as Element & { getAttribute?: (name: string) => string | null }
  if (typeof withGetAttribute.getAttribute === 'function') {
    return withGetAttribute.getAttribute.call(element, name) !== null
  }

  const attributes = (element as Element & { attributes?: Map<string, string> }).attributes
  if (attributes instanceof Map) {
    return attributes.has(name)
  }

  return null
}

export const replaceManagedAttributeSnapshot = (element: Element, names: Iterable<string>) => {
  if (names instanceof Set || Array.isArray(names)) {
    managedElementAttributes.set(element, names)
    return
  }
  managedElementAttributes.set(element, [...names])
}

export const getManagedAttributeSnapshotValues = (element: Element) =>
  managedElementAttributes.get(element) ?? null

export const getManagedAttributeSnapshot = (element: Element) => {
  const snapshot = getManagedAttributeSnapshotValues(element)
  if (!snapshot) {
    return null
  }
  return snapshot instanceof Set ? snapshot : new Set(snapshot)
}

export const syncManagedAttributeSnapshot = (element: Element, name: string) => {
  const previousSnapshot = getManagedAttributeSnapshotValues(element)
  const snapshot =
    previousSnapshot instanceof Set
      ? previousSnapshot
      : previousSnapshot
        ? new Set(previousSnapshot)
        : new Set(getElementAttributeNames(element))
  const hasAttribute = hasElementAttribute(element, name)
  if (hasAttribute === true) {
    snapshot.add(name)
  } else if (hasAttribute === false) {
    snapshot.delete(name)
  } else {
    snapshot.add(name)
  }
  managedElementAttributes.set(element, snapshot)
}

export const rememberManagedAttributesForNode = (node: Node | null | undefined) => {
  if (!isElementNode(node)) {
    return
  }
  replaceManagedAttributeSnapshot(node, getElementAttributeNames(node))
}

export const rememberManagedAttributesForNodes = (nodes: Iterable<Node>) => {
  for (const node of nodes) {
    rememberManagedAttributesForNode(node)
  }
}

export const rememberManagedAttributesForSubtree = (node: Node | null | undefined) => {
  if (!node) {
    return
  }

  const stack = [node]
  while (stack.length > 0) {
    const current = stack.pop()!
    rememberManagedAttributesForNode(current)
    const childNodes = (
      current as Node & {
        childNodes?: Iterable<Node> | ArrayLike<Node>
      }
    ).childNodes
    if (!childNodes) {
      continue
    }
    if (typeof (childNodes as ArrayLike<Node>).length === 'number') {
      for (let index = (childNodes as ArrayLike<Node>).length - 1; index >= 0; index -= 1) {
        const child = (childNodes as ArrayLike<Node>)[index]
        if (child) {
          stack.push(child)
        }
      }
      continue
    }
    for (const child of childNodes as Iterable<Node>) {
      stack.push(child)
    }
  }

  managedRememberedSubtrees.add(node)
}

export const hasRememberedManagedAttributesForSubtree = (node: Node | null | undefined) =>
  !!node && managedRememberedSubtrees.has(node)

export const markManagedAttributesForSubtreeRemembered = (node: Node | null | undefined) => {
  if (!node) {
    return
  }
  managedRememberedSubtrees.add(node)
}

export const rememberInsertMarkerRange = (
  marker: Node | null | undefined,
  nodes: Iterable<Node>,
) => {
  if (!(typeof Comment !== 'undefined' ? marker instanceof Comment : marker?.nodeType === 8)) {
    return
  }

  let count = 0
  for (const _node of nodes) {
    count += 1
  }
  insertMarkerNodeCounts.set(marker as Comment, count)
}

export const getRememberedInsertMarkerNodeCount = (marker: Comment | null | undefined) =>
  marker ? (insertMarkerNodeCounts.get(marker) ?? 0) : 0

export const setRememberedInsertMarkerNodeCount = (marker: Comment, count: number) => {
  insertMarkerNodeCounts.set(marker, count)
}

export const getBoundaryChildren = (start: Comment, end: Comment) => {
  const nodes: Node[] = []
  let cursor = start.nextSibling
  while (cursor && cursor !== end) {
    nodes.push(cursor)
    cursor = cursor.nextSibling
  }
  return nodes
}

const getNodePath = (root: Node, target: Node): number[] | null => {
  if (root === target) {
    return []
  }

  const path: number[] = []
  let cursor: Node | null = target
  while (cursor && cursor !== root) {
    const parent: Node | null = cursor.parentNode
    if (!parent) {
      return null
    }
    const index = Array.prototype.indexOf.call(parent.childNodes, cursor)
    if (index < 0) {
      return null
    }
    path.unshift(index)
    cursor = parent
  }

  return cursor === root ? path : null
}

const getNodeByPath = (root: Node, path: number[]) => {
  let cursor: Node | null = root
  for (const index of path) {
    const childNodes: NodeListOf<ChildNode> | Node[] | undefined = cursor
      ? ((cursor.childNodes as NodeListOf<ChildNode>) ?? undefined)
      : undefined
    cursor =
      (childNodes &&
        ('item' in childNodes
          ? (childNodes.item(index) as Node | null)
          : ((childNodes as unknown as Node[])[index] ?? null))) ??
      null
    if (!cursor) {
      return null
    }
  }
  return cursor
}

const getElementPath = (root: Element, target: Element): number[] | null => {
  if (root === target) {
    return []
  }

  const path: number[] = []
  let cursor: Element | null = target
  while (cursor && cursor !== root) {
    const parent: HTMLElement | null = cursor.parentElement
    if (!parent) {
      return null
    }
    const index = Array.prototype.indexOf.call(parent.children, cursor)
    if (index < 0) {
      return null
    }
    path.unshift(index)
    cursor = parent
  }

  return cursor === root ? path : null
}

const getElementByPath = (root: Element, path: number[]) => {
  let cursor: Element | null = root
  for (const index of path) {
    const children: HTMLCollection | Element[] | undefined = cursor
      ? ((cursor.children as HTMLCollection) ?? undefined)
      : undefined
    cursor =
      (children &&
        ('item' in children
          ? (children.item(index) as Element | null)
          : ((children as unknown as Element[])[index] ?? null))) ??
      null
    if (!cursor) {
      return null
    }
  }
  return cursor
}

const restoreFocusTarget = (doc: Document, nextActive: HTMLElement, snapshot: FocusSnapshot) => {
  const restore = () => {
    if (!nextActive.isConnected) {
      return false
    }
    nextActive.focus({ preventScroll: true })
    if (
      isTextEntryElement(nextActive) &&
      snapshot.selectionStart !== null &&
      snapshot.selectionStart !== undefined
    ) {
      nextActive.setSelectionRange(
        snapshot.selectionStart,
        snapshot.selectionEnd ?? snapshot.selectionStart,
        snapshot.selectionDirection ?? undefined,
      )
    }
    return doc.activeElement === nextActive
  }

  if (restore()) {
    return
  }

  const win = doc.defaultView
  if (!win) {
    return
  }

  let remainingAttempts = 3
  const retry = () => {
    if (remainingAttempts <= 0) {
      return
    }
    remainingAttempts--
    const run = () => {
      if (restore()) {
        return
      }
      retry()
    }

    if (typeof win.requestAnimationFrame === 'function') {
      win.requestAnimationFrame(() => run())
      return
    }
    win.setTimeout(run, 16)
  }

  retry()
}

export const captureBoundaryFocus = (
  doc: Document,
  start: Comment,
  end: Comment,
): FocusSnapshot | null => {
  const activeElement = doc.activeElement
  if (!isHTMLElementNode(activeElement)) {
    return null
  }

  const topLevelNodes = getBoundaryChildren(start, end)
  for (let index = 0; index < topLevelNodes.length; index += 1) {
    const candidate = topLevelNodes[index]
    if (
      candidate !== activeElement &&
      (!isElementNode(candidate) || !candidate.contains(activeElement))
    ) {
      continue
    }

    const innerPath = getNodePath(candidate, activeElement)
    if (!innerPath) {
      continue
    }

    return {
      path: [index, ...innerPath],
      selectionDirection: isTextEntryElement(activeElement)
        ? activeElement.selectionDirection
        : null,
      selectionEnd: isTextEntryElement(activeElement) ? activeElement.selectionEnd : null,
      selectionStart: isTextEntryElement(activeElement) ? activeElement.selectionStart : null,
    }
  }

  return null
}

export const restoreBoundaryFocus = (
  doc: Document,
  start: Comment,
  end: Comment,
  snapshot: FocusSnapshot | null,
) => {
  if (!snapshot) {
    return
  }

  const [topLevelIndex, ...innerPath] = snapshot.path
  const root = getBoundaryChildren(start, end)[topLevelIndex]
  if (!root) {
    return
  }

  const nextActive = innerPath.length > 0 ? getNodeByPath(root, innerPath) : root
  if (!isHTMLElementNode(nextActive)) {
    return
  }

  restoreFocusTarget(doc, nextActive, snapshot)
}

export const captureDocumentFocus = (
  doc: Document,
  focusSource?: EventTarget | null,
): FocusSnapshot | null => {
  const candidate = isHTMLElementNode(focusSource)
    ? focusSource
    : isHTMLElementNode(doc.activeElement)
      ? doc.activeElement
      : null
  if (!candidate) {
    return null
  }

  const path = getElementPath(doc.body, candidate)
  if (!path) {
    return null
  }

  return {
    path,
    selectionDirection: isTextEntryElement(candidate) ? candidate.selectionDirection : null,
    selectionEnd: isTextEntryElement(candidate) ? candidate.selectionEnd : null,
    selectionStart: isTextEntryElement(candidate) ? candidate.selectionStart : null,
  }
}

export const shouldSkipPendingFocusRestore = (doc: Document, pending: PendingFocusRestore) => {
  const activeElement = doc.activeElement
  if (!isHTMLElementNode(activeElement)) {
    return false
  }
  if (
    activeElement === doc.body ||
    !activeElement.isConnected ||
    !doc.body.contains(activeElement)
  ) {
    return false
  }

  const activePath = getElementPath(doc.body, activeElement)
  if (!activePath) {
    return false
  }

  if (activePath.length !== pending.snapshot.path.length) {
    return true
  }

  return activePath.some((index, position) => index !== pending.snapshot.path[position])
}

export const restorePendingFocus = (doc: Document, pending: PendingFocusRestore | null) => {
  if (!pending) {
    return
  }
  if (shouldSkipPendingFocusRestore(doc, pending)) {
    return
  }

  const nextActive = getElementByPath(doc.body, pending.snapshot.path)
  if (!isHTMLElementNode(nextActive)) {
    return
  }

  restoreFocusTarget(doc, nextActive, pending.snapshot)
}
