type DomConstructorName =
  | 'Element'
  | 'HTMLElement'
  | 'HTMLInputElement'
  | 'HTMLSelectElement'
  | 'HTMLTextAreaElement'
  | 'HTMLAnchorElement'
  | 'HTMLFormElement'

export interface FocusSnapshot {
  path: number[]
  selectionDirection?: 'backward' | 'forward' | 'none' | null
  selectionEnd?: number | null
  selectionStart?: number | null
}

export interface PendingFocusRestore {
  snapshot: FocusSnapshot
}

const managedElementAttributes = new WeakMap<Element, Set<string>>()
const insertMarkerNodeCounts = new WeakMap<Comment, number>()

const getDomContexts = (value: unknown): Array<Window | typeof globalThis> => {
  const contexts: Array<Window | typeof globalThis> = []
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return contexts
  }
  if ('ownerDocument' in value) {
    const ownerDocument = (value as { ownerDocument?: Document | null }).ownerDocument
    if (ownerDocument?.defaultView) {
      contexts.push(ownerDocument.defaultView)
    }
  }
  if ('defaultView' in value) {
    const defaultView = (value as { defaultView?: Window | null }).defaultView
    if (defaultView) {
      contexts.push(defaultView)
    }
  }
  contexts.push(globalThis)
  return contexts
}

const isDomInstance = <T>(value: unknown, name: DomConstructorName): value is T => {
  for (const context of getDomContexts(value)) {
    const ctor = (context as Record<DomConstructorName, unknown>)[name]
    if (typeof ctor === 'function' && value instanceof ctor) {
      return true
    }
  }
  return false
}

export const hasOwnerDocument = (
  value: unknown,
): value is ParentNode & { ownerDocument: Document } =>
  !!value &&
  (typeof value === 'object' || typeof value === 'function') &&
  'ownerDocument' in value &&
  !!(value as { ownerDocument?: Document | null }).ownerDocument

export const isElementNode = (value: unknown): value is Element =>
  isDomInstance<Element>(value, 'Element') || isDomInstance<HTMLElement>(value, 'HTMLElement')

export const isHTMLElementNode = (value: unknown): value is HTMLElement =>
  isDomInstance<HTMLElement>(value, 'HTMLElement')

export const isHTMLInputElementNode = (value: unknown): value is HTMLInputElement =>
  isDomInstance<HTMLInputElement>(value, 'HTMLInputElement')

export const isHTMLSelectElementNode = (value: unknown): value is HTMLSelectElement =>
  isDomInstance<HTMLSelectElement>(value, 'HTMLSelectElement')

export const isHTMLTextAreaElementNode = (value: unknown): value is HTMLTextAreaElement =>
  isDomInstance<HTMLTextAreaElement>(value, 'HTMLTextAreaElement')

export const isTextEntryElement = (
  value: unknown,
): value is HTMLInputElement | HTMLTextAreaElement =>
  isHTMLInputElementNode(value) || isHTMLTextAreaElementNode(value)

export const isHTMLAnchorElementNode = (value: unknown): value is HTMLAnchorElement =>
  isDomInstance<HTMLAnchorElement>(value, 'HTMLAnchorElement')

export const isHTMLFormElementNode = (value: unknown): value is HTMLFormElement =>
  isDomInstance<HTMLFormElement>(value, 'HTMLFormElement')

export const listNodeChildren = (
  node: { childNodes?: Iterable<Node> | ArrayLike<Node> } | null | undefined,
) => Array.from((node?.childNodes ?? []) as Iterable<Node> | ArrayLike<Node>)

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

const cloneManagedAttributeSnapshot = (element: Element) =>
  new Set(getElementAttributeNames(element))

export const replaceManagedAttributeSnapshot = (element: Element, names: Iterable<string>) => {
  managedElementAttributes.set(element, new Set(names))
}

export const getManagedAttributeSnapshot = (element: Element) =>
  managedElementAttributes.get(element) ?? null

export const syncManagedAttributeSnapshot = (element: Element, name: string) => {
  const snapshot = getManagedAttributeSnapshot(element) ?? new Set<string>()
  const hasAttribute = hasElementAttribute(element, name)
  if (hasAttribute === true) {
    snapshot.add(name)
  } else if (hasAttribute === false) {
    snapshot.delete(name)
  } else {
    snapshot.add(name)
  }
  replaceManagedAttributeSnapshot(element, snapshot)
}

export const rememberManagedAttributesForNode = (node: Node | null | undefined) => {
  if (!node) {
    return
  }

  const visit = (current: Node) => {
    if (isElementNode(current)) {
      replaceManagedAttributeSnapshot(current, cloneManagedAttributeSnapshot(current))
    }
    for (const child of listNodeChildren(current)) {
      visit(child)
    }
  }

  visit(node)
}

export const rememberManagedAttributesForNodes = (nodes: Iterable<Node>) => {
  for (const node of nodes) {
    rememberManagedAttributesForNode(node)
  }
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
