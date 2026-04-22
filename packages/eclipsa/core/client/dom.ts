import { jsxDEV } from '../../jsx/jsx-dev-runtime.ts'
import {
  ACTION_CSRF_FIELD,
  ACTION_CSRF_INPUT_ATTR,
  readActionCsrfTokenFromDocument,
} from '../action-csrf.ts'
import type { Component } from '../component.ts'
import { getComponentMeta } from '../internal.ts'
import {
  markManagedAttributesForSubtreeRemembered,
  replaceManagedAttributeSnapshot,
} from '../runtime/dom.ts'
import { ACTION_FORM_ATTR } from '../runtime/constants.ts'
import {
  INSERT_MARKER_PREFIX,
  createInsertMarker,
  parseComponentBoundaryMarker,
  parseInsertMarker,
} from '../runtime/markers.ts'
import {
  assignRuntimeRef,
  bindLiveClientListener,
  bindRuntimeEvent,
  captureClientInsertOwner,
  createDetachedClientInsertOwner,
  createDetachedRuntimeContainer,
  getRuntimeSignalId,
  getRuntimeContainer,
  preserveReusableContentInRoots,
  rememberManagedAttributesForNode,
  rememberManagedAttributesForNodes,
  rememberManagedAttributesForSubtree,
  rememberInsertMarkerRange,
  getRememberedInsertMarkerNodeCount,
  installResumeListeners,
  reconcileClientKeyedForInPlace,
  renderClientInsertable,
  renderClientInsertableForOwner,
  restoreSignalRefs,
  setRememberedInsertMarkerNodeCount,
  syncManagedAttributeSnapshot,
  syncRuntimeRefMarker,
  shouldReconnectDetachedInsertMarkers,
  tryPatchElementShellInPlace,
  tryPatchNodeSequenceInPlace,
  withRuntimeContainer,
} from '../runtime.ts'
import { effect } from '../signal.ts'
import { isSuspenseType } from '../suspense.ts'
import { withSignalSnapshot } from '../snapshot.ts'
import type { ClientElementLike, Insertable } from './types.ts'

const EMPTY_INSERT_COMMENT = 'eclipsa-empty'
const ATTR_UNSET = Symbol('eclipsa.attr-unset')

const createActionCsrfInput = (doc: Document, token: string) => {
  const input = doc.createElement('input')
  input.setAttribute(ACTION_CSRF_INPUT_ATTR, '')
  input.setAttribute('name', ACTION_CSRF_FIELD)
  input.setAttribute('type', 'hidden')
  input.setAttribute('value', token)
  return input
}

const ensureActionCsrfInput = (form: HTMLFormElement) => {
  const token = readActionCsrfTokenFromDocument(document)
  if (!token) {
    return
  }

  const existing = form.querySelector(`input[${ACTION_CSRF_INPUT_ATTR}]`)
  const input =
    existing instanceof HTMLInputElement ? existing : createActionCsrfInput(document, token)
  input.setAttribute('name', ACTION_CSRF_FIELD)
  input.setAttribute('type', 'hidden')
  input.setAttribute('value', token)
  if (input.parentNode !== form) {
    form.insertBefore(input, form.firstChild)
  }
  rememberManagedAttributesForNode(input)
}

const ensureActionCsrfInputsInNode = (node: Node) => {
  if (node instanceof HTMLFormElement && node.hasAttribute(ACTION_FORM_ATTR)) {
    ensureActionCsrfInput(node)
  }
  if (node instanceof Element) {
    for (const form of node.querySelectorAll(`form[${ACTION_FORM_ATTR}]`)) {
      if (form instanceof HTMLFormElement) {
        ensureActionCsrfInput(form)
      }
    }
  }
}

const ensureInsertMarkerKey = (
  marker: Node | undefined,
  runtimeContainer: ReturnType<typeof getRuntimeContainer>,
) => {
  if (!(marker instanceof Comment) || !runtimeContainer) {
    return null
  }

  if (marker.data.startsWith(INSERT_MARKER_PREFIX)) {
    runtimeContainer.insertMarkerLookup.set(marker.data, marker)
    return marker.data
  }

  const key = createInsertMarker(runtimeContainer.nextElementId++)
  marker.data = key
  runtimeContainer.insertMarkerLookup.set(key, marker)
  return key
}

const findLiveInsertMarker = (
  runtimeContainer: ReturnType<typeof getRuntimeContainer>,
  markerKey: string | null,
) => {
  const doc = runtimeContainer?.doc
  if (!doc?.body || !markerKey || typeof doc.createTreeWalker !== 'function' || !runtimeContainer) {
    return null
  }

  const cached = runtimeContainer.insertMarkerLookup.get(markerKey)
  if (cached === null) {
    return null
  }
  if (cached instanceof Comment) {
    if (cached.isConnected || getRememberedInsertMarkerNodeCount(cached) === 0) {
      return cached
    }
  }

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT)
  let next = walker.nextNode()
  while (next) {
    if (next instanceof Comment && next.data === markerKey) {
      runtimeContainer.insertMarkerLookup.set(markerKey, next)
      return next
    }
    next = walker.nextNode()
  }
  runtimeContainer.insertMarkerLookup.set(markerKey, null)
  return null
}

const isConnectedNode = (node: Node | null | undefined) =>
  !!node &&
  (!('isConnected' in node) ||
    (
      node as Node & {
        isConnected?: boolean
      }
    ).isConnected !== false)

const isUsableInsertParent = (
  candidate: Node | null | undefined,
  stableParents: Array<Node | null | undefined>,
) => !!candidate && (isConnectedNode(candidate) || stableParents.includes(candidate))

const removeNodeFromParent = (node: Node, parent: Node) => {
  const removable = node as Node & {
    remove?: () => void
  }
  if (typeof removable.remove === 'function') {
    removable.remove()
    return
  }

  const parentWithRemoveChild = parent as Node & {
    removeChild?: (child: Node) => Node
  }
  if (typeof parentWithRemoveChild.removeChild === 'function') {
    parentWithRemoveChild.removeChild(node)
  }
}

const hasUsableInsertParent = (
  node: Node | null | undefined,
  stableParents: Array<Node | null | undefined>,
) => isUsableInsertParent(node?.parentNode, stableParents)

const collectNodesBeforeMarker = (marker: Node | null | undefined, count: number) => {
  if (!marker?.parentNode || count === 0) {
    return [] as Node[]
  }

  const nodes: Node[] = []
  let cursor = marker.previousSibling
  while (cursor && nodes.length < count) {
    nodes.unshift(cursor)
    cursor = cursor.previousSibling
  }

  return nodes.length === count ? nodes : []
}

const getBoundaryMarker = (node: Node | null | undefined) => {
  if (!(node instanceof Comment)) {
    return null
  }

  return parseComponentBoundaryMarker(node.data)
}

const canReconnectOwnerRange = (currentNodes: Node[], newNodes: Node[]) => {
  if (currentNodes.length === 0 || currentNodes.length !== newNodes.length) {
    return false
  }

  let sawBoundary = false

  for (let index = 0; index < newNodes.length; index += 1) {
    const currentNode = currentNodes[index]!
    const newNode = newNodes[index]!
    if (currentNode.nodeType !== newNode.nodeType) {
      return false
    }

    const currentBoundary = getBoundaryMarker(currentNode)
    const newBoundary = getBoundaryMarker(newNode)
    if (currentBoundary || newBoundary) {
      if (
        !currentBoundary ||
        !newBoundary ||
        currentBoundary.kind !== newBoundary.kind ||
        currentBoundary.id !== newBoundary.id
      ) {
        return false
      }
      sawBoundary = true
      continue
    }

    if (currentNode instanceof Element && newNode instanceof Element) {
      if (currentNode.tagName !== newNode.tagName) {
        return false
      }
      continue
    }

    if (currentNode.nodeType === Node.TEXT_NODE && newNode.nodeType === Node.TEXT_NODE) {
      continue
    }

    return false
  }

  return sawBoundary
}

const resolveFastInsertValue = (value: unknown) => {
  let resolved = value
  while (typeof resolved === 'function') {
    resolved = resolved()
  }

  if (resolved === null || resolved === undefined || resolved === false) {
    return {
      kind: 'empty' as const,
    }
  }

  if (
    typeof resolved === 'string' ||
    typeof resolved === 'number' ||
    typeof resolved === 'boolean'
  ) {
    return {
      kind: 'text' as const,
      value: String(resolved),
    }
  }

  return null
}

const isManagedEmptyInsertComment = (node: Node | null | undefined) =>
  node instanceof Comment && node.data === EMPTY_INSERT_COMMENT

const getElementStyleDeclaration = (elem: Element) => {
  const style = (
    elem as Element & {
      style?: {
        removeProperty?: (name: string) => string
        setProperty?: (name: string, value: string) => void
      }
    }
  ).style

  return style &&
    typeof style === 'object' &&
    typeof style.setProperty === 'function' &&
    typeof style.removeProperty === 'function'
    ? (style as {
        removeProperty: (name: string) => string
        setProperty: (name: string, value: string) => void
      })
    : null
}

const serializeStyleValue = (resolved: unknown) =>
  resolved && typeof resolved === 'object'
    ? Object.entries(resolved as Record<string, string>)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ')
    : String(resolved ?? '')

interface ManagedTemplateAttributeSnapshot {
  names: string[]
}

const captureManagedTemplateAttributeSnapshots = (
  root: Node,
): ManagedTemplateAttributeSnapshot[] => {
  const snapshots: ManagedTemplateAttributeSnapshot[] = []
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current instanceof Element) {
      snapshots.push({
        names: current.getAttributeNames(),
      })
    }
    const childNodes = current.childNodes
    for (let index = childNodes.length - 1; index >= 0; index -= 1) {
      const child = childNodes[index]
      if (!child) {
        continue
      }
      stack.push(child)
    }
  }
  return snapshots
}

const applyManagedTemplateAttributeSnapshots = (
  root: Node,
  snapshots: readonly ManagedTemplateAttributeSnapshot[],
) => {
  if (snapshots.length === 0) {
    return
  }

  let snapshotIndex = 0
  const stack: Node[] = [root]
  while (stack.length > 0 && snapshotIndex < snapshots.length) {
    const current = stack.pop()!
    if (current instanceof Element) {
      replaceManagedAttributeSnapshot(current, snapshots[snapshotIndex]!.names)
      snapshotIndex += 1
    }
    const childNodes = current.childNodes
    for (let index = childNodes.length - 1; index >= 0; index -= 1) {
      const child = childNodes[index]
      if (child) {
        stack.push(child)
      }
    }
  }
}

export const createTemplate = (html: string): (() => Node) => {
  let template: HTMLTemplateElement | null = null
  let templateRoot: Node | null = null
  let hasActionForms = false
  let managedAttributeSnapshots: ManagedTemplateAttributeSnapshot[] | null = null

  return () => {
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = html
      templateRoot = template.content.firstChild
      hasActionForms =
        templateRoot instanceof HTMLFormElement
          ? templateRoot.hasAttribute(ACTION_FORM_ATTR)
          : templateRoot instanceof Element
            ? templateRoot.querySelector(`form[${ACTION_FORM_ATTR}]`) instanceof HTMLFormElement
            : false
      managedAttributeSnapshots = templateRoot
        ? captureManagedTemplateAttributeSnapshots(templateRoot)
        : []
    }
    if (!templateRoot) {
      throw new Error('Client templates require a root node.')
    }
    const node = templateRoot.cloneNode(true)
    if (hasActionForms) {
      ensureActionCsrfInputsInNode(node)
    }
    if (managedAttributeSnapshots) {
      applyManagedTemplateAttributeSnapshots(node, managedAttributeSnapshots)
    } else {
      rememberManagedAttributesForSubtree(node)
    }
    markManagedAttributesForSubtreeRemembered(node)
    return node
  }
}

const createStaticInsertNodes = (
  value: Insertable,
  targetParent: ParentNode,
  runtimeContainer: NonNullable<ReturnType<typeof getRuntimeContainer>>,
  ownerSiteKey: string | null,
) => {
  const primitiveValue = resolveFastInsertValue(value)
  if (primitiveValue) {
    const doc = runtimeContainer.doc ?? targetParent.ownerDocument
    if (!doc) {
      throw new Error('Client insertions require an active runtime document.')
    }
    if (primitiveValue.kind === 'text') {
      return [doc.createTextNode(primitiveValue.value)]
    }
    return [doc.createComment(EMPTY_INSERT_COMMENT)]
  }

  const owner =
    captureClientInsertOwner(runtimeContainer, ownerSiteKey) ??
    createDetachedClientInsertOwner(runtimeContainer)
  return owner
    ? renderClientInsertableForOwner(value, runtimeContainer, owner)
    : renderClientInsertable(value, runtimeContainer)
}

type InsertBindingState = {
  lastFirstNode: Node | undefined
  lastNodeLength: number
  marker: Node | undefined
  markerKey: string | null | undefined
  owner: ReturnType<typeof captureClientInsertOwner>
  ownerSiteKey: string | null
  parent: Node
  runtimeContainer: NonNullable<ReturnType<typeof getRuntimeContainer>>
}

const createInsertBindingState = (
  parent: Node,
  marker: Node | undefined,
  runtimeContainer: NonNullable<ReturnType<typeof getRuntimeContainer>>,
): InsertBindingState => {
  const ownerSiteKey =
    marker instanceof Comment && !parseInsertMarker(marker.data) ? marker.data : null

  return {
    lastFirstNode: marker,
    lastNodeLength: 0,
    marker,
    markerKey: undefined,
    owner: null,
    ownerSiteKey,
    parent,
    runtimeContainer,
  }
}

const ensureInsertBindingOwner = (state: InsertBindingState) =>
  (state.owner ??=
    captureClientInsertOwner(state.runtimeContainer, state.ownerSiteKey) ??
    createDetachedClientInsertOwner(state.runtimeContainer))

const getInsertBindingMarkerKey = (state: InsertBindingState) => {
  if (state.markerKey !== undefined) {
    return state.markerKey
  }

  state.markerKey = ensureInsertMarkerKey(state.marker, state.runtimeContainer)
  return state.markerKey
}

const resolveInsertBindingContext = (state: InsertBindingState) => {
  const { marker, parent, runtimeContainer } = state
  const shouldReconnect = shouldReconnectDetachedInsertMarkers(runtimeContainer)
  const liveMarker = !(marker instanceof Comment)
    ? marker
    : isConnectedNode(marker.parentNode)
      ? marker
      : shouldReconnect
        ? (findLiveInsertMarker(runtimeContainer, getInsertBindingMarkerKey(state)) ?? marker)
        : marker
  const stableParents = liveMarker?.parentNode
    ? [liveMarker.parentNode, parent === liveMarker.parentNode ? parent : null]
    : [parent, marker?.parentNode]
  const liveLastParent = isUsableInsertParent(state.lastFirstNode?.parentNode, stableParents)
    ? state.lastFirstNode?.parentNode
    : null
  const liveMarkerParent = isUsableInsertParent(liveMarker?.parentNode, stableParents)
    ? liveMarker?.parentNode
    : null
  const resolvedParent = (liveLastParent ?? liveMarkerParent ?? parent) as ParentNode | null

  return {
    liveMarker,
    stableParents,
    targetParent: resolvedParent ?? (parent as ParentNode),
  }
}

const collectCurrentNodesForBinding = (
  state: InsertBindingState,
  liveMarker: Node | undefined,
  stableParents: Array<Node | null | undefined>,
) => {
  if (
    !state.lastFirstNode ||
    state.lastNodeLength === 0 ||
    !hasUsableInsertParent(state.lastFirstNode, stableParents)
  ) {
    const liveNodes = collectNodesBeforeMarker(liveMarker, state.lastNodeLength)
    return liveNodes.every((node) => hasUsableInsertParent(node, stableParents)) ? liveNodes : []
  }

  const nodes = [state.lastFirstNode]
  let cursor = state.lastFirstNode
  while (nodes.length < state.lastNodeLength) {
    const next = cursor.nextSibling
    if (!next || !hasUsableInsertParent(next, stableParents)) {
      return [] as Node[]
    }
    cursor = next
    nodes.push(cursor)
  }

  return nodes
}

const seedCurrentNodesForBinding = (
  state: InsertBindingState,
  liveMarker: Node | undefined,
  count: number,
) =>
  state.lastNodeLength === 0 &&
  liveMarker instanceof Comment &&
  getRememberedInsertMarkerNodeCount(liveMarker) === count
    ? collectNodesBeforeMarker(liveMarker, count)
    : []

const replaceBindingCurrentNodes = (
  state: InsertBindingState,
  currentNodes: Node[],
  replacementNode: Node,
  liveMarker: Node | undefined,
  targetParent: ParentNode,
) => {
  const insertReference =
    liveMarker?.parentNode === targetParent
      ? liveMarker
      : (currentNodes[currentNodes.length - 1]?.nextSibling ?? null)
  for (const node of currentNodes) {
    if (node.parentNode === targetParent) {
      removeNodeFromParent(node, targetParent)
    }
  }
  targetParent.insertBefore(replacementNode, insertReference)
  rememberInsertMarkerRange(liveMarker, [replacementNode])
  state.lastFirstNode = replacementNode
  state.lastNodeLength = 1
}

const runInsertEffect = (state: InsertBindingState, value: Insertable) => {
  const primitiveValue = resolveFastInsertValue(value)
  const { liveMarker, stableParents, targetParent } = resolveInsertBindingContext(state)

  if (primitiveValue && state.lastNodeLength === 1 && state.lastFirstNode?.parentNode) {
    if (primitiveValue.kind === 'text') {
      if (state.lastFirstNode instanceof Text) {
        if (state.lastFirstNode.data !== primitiveValue.value) {
          state.lastFirstNode.data = primitiveValue.value
        }
        return
      }

      if (isManagedEmptyInsertComment(state.lastFirstNode)) {
        const doc =
          state.runtimeContainer.doc ??
          (state.lastFirstNode.ownerDocument as Document | null) ??
          (state.lastFirstNode.parentNode.ownerDocument as Document | null)
        if (!doc) {
          throw new Error('Client insertions require an active runtime document.')
        }
        if (
          replaceSinglePrimitiveNode(
            state.lastFirstNode,
            doc.createTextNode(primitiveValue.value),
            liveMarker,
            state,
          )
        ) {
          return
        }
      }
    } else {
      if (isManagedEmptyInsertComment(state.lastFirstNode)) {
        return
      }

      if (state.lastFirstNode instanceof Text) {
        const doc =
          state.runtimeContainer.doc ??
          (state.lastFirstNode.ownerDocument as Document | null) ??
          (state.lastFirstNode.parentNode.ownerDocument as Document | null)
        if (!doc) {
          throw new Error('Client insertions require an active runtime document.')
        }
        if (
          replaceSinglePrimitiveNode(
            state.lastFirstNode,
            doc.createComment(EMPTY_INSERT_COMMENT),
            liveMarker,
            state,
          )
        ) {
          return
        }
      }
    }
  }

  if (primitiveValue) {
    const seededCurrentNodes = seedCurrentNodesForBinding(state, liveMarker, 1)
    const currentNodes =
      seededCurrentNodes.length !== 0 &&
      seededCurrentNodes.every((node) => hasUsableInsertParent(node, stableParents))
        ? seededCurrentNodes
        : collectCurrentNodesForBinding(state, liveMarker, stableParents)

    if (currentNodes.length !== 0 && state.lastNodeLength === 0) {
      state.lastFirstNode = currentNodes[0]
      state.lastNodeLength = currentNodes.length
    }

    if (primitiveValue.kind === 'text') {
      if (currentNodes.length === 1 && currentNodes[0] instanceof Text) {
        if (currentNodes[0].data !== primitiveValue.value) {
          currentNodes[0].data = primitiveValue.value
        }
        rememberInsertMarkerRange(liveMarker, currentNodes)
        state.lastFirstNode = currentNodes[0]
        state.lastNodeLength = 1
        return
      }

      const doc = state.runtimeContainer.doc ?? targetParent.ownerDocument
      if (!doc) {
        throw new Error('Client insertions require an active runtime document.')
      }

      replaceBindingCurrentNodes(
        state,
        currentNodes,
        doc.createTextNode(primitiveValue.value),
        liveMarker,
        targetParent,
      )
      return
    }

    if (currentNodes.length === 1 && isManagedEmptyInsertComment(currentNodes[0])) {
      rememberInsertMarkerRange(liveMarker, currentNodes)
      state.lastFirstNode = currentNodes[0]
      state.lastNodeLength = 1
      return
    }

    const doc = state.runtimeContainer.doc ?? targetParent.ownerDocument
    if (!doc) {
      throw new Error('Client insertions require an active runtime document.')
    }

    replaceBindingCurrentNodes(
      state,
      currentNodes,
      doc.createComment(EMPTY_INSERT_COMMENT),
      liveMarker,
      targetParent,
    )
    return
  }

  let currentNodes: Node[] | null = null
  const readCurrentNodes = () => {
    currentNodes ??= collectCurrentNodesForBinding(state, liveMarker, stableParents)
    if (currentNodes.length !== 0 && state.lastNodeLength === 0) {
      state.lastFirstNode = currentNodes[0]
      state.lastNodeLength = currentNodes.length
    }
    return currentNodes
  }

  const reconciledKeyedForResult = reconcileClientKeyedForInPlace(
    value,
    state.runtimeContainer,
    ensureInsertBindingOwner(state),
    targetParent,
    liveMarker,
    readCurrentNodes,
  )
  if (reconciledKeyedForResult) {
    if (reconciledKeyedForResult.needsRefRestore) {
      restoreSignalRefs(state.runtimeContainer, targetParent)
    }
    if (liveMarker instanceof Comment) {
      setRememberedInsertMarkerNodeCount(liveMarker, reconciledKeyedForResult.nodeCount)
    }
    state.lastFirstNode = reconciledKeyedForResult.firstNode ?? liveMarker
    state.lastNodeLength = reconciledKeyedForResult.nodeCount
    return
  }

  currentNodes = readCurrentNodes()

  const owner = ensureInsertBindingOwner(state)
  const newNodes = owner
    ? renderClientInsertableForOwner(value, state.runtimeContainer, owner)
    : renderClientInsertable(value, state.runtimeContainer)
  const seededCurrentNodes = seedCurrentNodesForBinding(state, liveMarker, newNodes.length)
  const reconnectableCurrentNodes =
    seededCurrentNodes.length !== 0 &&
    seededCurrentNodes.every((node) => hasUsableInsertParent(node, stableParents)) &&
    canReconnectOwnerRange(seededCurrentNodes, newNodes)
      ? seededCurrentNodes
      : currentNodes

  if (
    reconnectableCurrentNodes.length === state.lastNodeLength &&
    reconnectableCurrentNodes.length !== 0 &&
    newNodes.length !== 0 &&
    (tryPatchNodeSequenceInPlace(reconnectableCurrentNodes, newNodes) ||
      tryPatchSingleElementShellInPlace(reconnectableCurrentNodes, newNodes))
  ) {
    restoreSignalRefs(state.runtimeContainer, targetParent)
    rememberInsertMarkerRange(liveMarker, reconnectableCurrentNodes)
    state.lastFirstNode = reconnectableCurrentNodes[0]
    state.lastNodeLength = reconnectableCurrentNodes.length
    return
  }

  let replacementNodes = newNodes
  if (reconnectableCurrentNodes.length !== 0 && newNodes.length !== 0) {
    const doc = state.runtimeContainer.doc
    if (!doc) {
      throw new Error('Client insertions require an active runtime document.')
    }
    const stagingParent = doc.createElement('div')
    for (const node of newNodes) {
      stagingParent.appendChild(node)
    }
    preserveReusableContentInRoots(reconnectableCurrentNodes, Array.from(stagingParent.childNodes))
    replacementNodes = Array.from(stagingParent.childNodes)
  }

  const insertReference = liveMarker?.parentNode === targetParent ? liveMarker : null
  for (const node of reconnectableCurrentNodes) {
    if (node.parentNode === targetParent) {
      removeNodeFromParent(node, targetParent)
    }
  }
  for (const node of replacementNodes) {
    targetParent.insertBefore(node, insertReference)
  }

  rememberManagedAttributesForNodes(replacementNodes)
  rememberInsertMarkerRange(liveMarker, replacementNodes)

  state.lastFirstNode = replacementNodes[0] ?? liveMarker
  state.lastNodeLength = replacementNodes.length
}

const replaceSinglePrimitiveNode = (
  currentNode: Node,
  replacementNode: Node,
  liveMarker: Node | undefined,
  state: InsertBindingState,
) => {
  const currentParent = currentNode.parentNode as ParentNode | null
  if (!currentParent) {
    return false
  }
  const insertReference =
    liveMarker?.parentNode === currentParent ? liveMarker : currentNode.nextSibling
  removeNodeFromParent(currentNode, currentParent)
  currentParent.insertBefore(replacementNode, insertReference)
  rememberInsertMarkerRange(liveMarker, [replacementNode])
  state.lastFirstNode = replacementNode
  state.lastNodeLength = 1
  return true
}

const runSimpleTextBindingEffect = (state: InsertBindingState, value: Insertable) => {
  const primitiveValue = resolveFastInsertValue(value)
  if (!primitiveValue) {
    return false
  }

  if (state.lastNodeLength > 1) {
    return false
  }

  const targetParent = (
    state.marker?.parentNode === state.parent ? state.marker.parentNode : state.parent
  ) as ParentNode
  const currentNode =
    state.lastNodeLength === 1 && state.lastFirstNode?.parentNode === targetParent
      ? state.lastFirstNode
      : null
  const insertReference = state.marker?.parentNode === targetParent ? state.marker : null
  const doc = state.runtimeContainer.doc ?? targetParent.ownerDocument
  if (!doc) {
    throw new Error('Client insertions require an active runtime document.')
  }

  if (primitiveValue.kind === 'text') {
    if (currentNode instanceof Text) {
      if (currentNode.data !== primitiveValue.value) {
        currentNode.data = primitiveValue.value
      }
      return true
    }

    const nextNode = doc.createTextNode(primitiveValue.value)
    if (currentNode) {
      targetParent.insertBefore(nextNode, currentNode)
      removeNodeFromParent(currentNode, targetParent)
    } else {
      targetParent.insertBefore(nextNode, insertReference)
    }
    rememberInsertMarkerRange(state.marker, [nextNode])
    state.lastFirstNode = nextNode
    state.lastNodeLength = 1
    return true
  }

  if (isManagedEmptyInsertComment(currentNode)) {
    return true
  }

  const nextNode = doc.createComment(EMPTY_INSERT_COMMENT)
  if (currentNode) {
    targetParent.insertBefore(nextNode, currentNode)
    removeNodeFromParent(currentNode, targetParent)
  } else {
    targetParent.insertBefore(nextNode, insertReference)
  }
  rememberInsertMarkerRange(state.marker, [nextNode])
  state.lastFirstNode = nextNode
  state.lastNodeLength = 1
  return true
}

export const insertStatic = (value: Insertable, parent: Node, marker?: Node) => {
  const runtimeContainer = getRuntimeContainer()
  if (!runtimeContainer) {
    throw new Error('Client insertions require an active runtime container.')
  }
  const ownerSiteKey =
    marker instanceof Comment && !parseInsertMarker(marker.data) ? marker.data : null
  const targetParent = (marker?.parentNode === parent ? marker.parentNode : parent) as ParentNode
  const insertReference = marker?.parentNode === targetParent ? marker : null
  const nodes = createStaticInsertNodes(value, targetParent, runtimeContainer, ownerSiteKey)

  for (const node of nodes) {
    targetParent.insertBefore(node, insertReference)
  }

  rememberManagedAttributesForNodes(nodes)
  rememberInsertMarkerRange(marker, nodes)
}

export const insertElementStatic = (value: Insertable, parent: Element) => {
  const resolved = resolveFastInsertValue(value)
  if (resolved) {
    if (
      resolved.kind === 'text' &&
      parent.childNodes.length === 1 &&
      parent.firstChild instanceof Text
    ) {
      parent.firstChild.data = resolved.value
      return
    }
    try {
      ;(parent as Element & { textContent: string }).textContent =
        resolved.kind === 'text' ? resolved.value : ''
      return
    } catch {
      // Some lightweight test DOMs expose a readonly textContent property.
    }
    while (parent.firstChild) {
      parent.removeChild(parent.firstChild)
    }
    if (resolved.kind === 'text') {
      parent.appendChild(parent.ownerDocument.createTextNode(resolved.value))
    }
    return
  }

  const runtimeContainer = getRuntimeContainer()
  if (!runtimeContainer) {
    throw new Error('Client insertions require an active runtime container.')
  }

  const nodes = renderClientInsertable(value, runtimeContainer)
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild)
  }
  for (const node of nodes) {
    parent.appendChild(node)
  }
  rememberManagedAttributesForNodes(nodes)
}

export const insert = (value: Insertable, parent: Node, marker?: Node) => {
  const runtimeContainer = getRuntimeContainer()
  if (!runtimeContainer) {
    throw new Error('Client insertions require an active runtime container.')
  }
  const state = createInsertBindingState(parent, marker, runtimeContainer)

  effect(
    () => {
      runInsertEffect(state, value)
    },
    { runInContainer: false },
  )
}

export const text = (value: Insertable, parent: Node, marker?: Node) => {
  const runtimeContainer = getRuntimeContainer()
  if (!runtimeContainer) {
    throw new Error('Client insertions require an active runtime container.')
  }

  const state = createInsertBindingState(parent, marker, runtimeContainer)
  let delegated = false

  effect(
    () => {
      if (!delegated && runSimpleTextBindingEffect(state, value)) {
        return
      }

      delegated = true
      runInsertEffect(state, value)
    },
    { runInContainer: false },
  )
}

const EVENT_ATTR_REGEX = /^on[A-Z].+$/
const DANGEROUSLY_SET_INNER_HTML_PROP = 'dangerouslySetInnerHTML'
const BIND_VALUE_PROP = 'bind:value'
const BIND_CHECKED_PROP = 'bind:checked'
const BIND_VALUE_ATTR = 'data-e-bind-value'
const BIND_CHECKED_ATTR = 'data-e-bind-checked'

const bindStaticEventValue = (elem: Element, eventName: string, resolved: unknown) => {
  if (bindRuntimeEvent(elem, eventName, resolved)) {
    return
  }
  if (typeof resolved !== 'function') {
    throw new Error('Resumable event bindings require an active runtime container.')
  }
  elem.addEventListener(eventName, resolved as () => void)
}

const shouldUseAttributeAssignment = (elem: Element, name: string, isSVG: boolean) =>
  isSVG || name.startsWith('data-') || name.startsWith('aria-') || !(name in elem)

const hasClassAttribute = (elem: Element) =>
  typeof elem.hasAttribute === 'function'
    ? elem.hasAttribute('class')
    : elem.getAttribute('class') !== null

const applyClassValue = (elem: Element, nextClassValue: string, isSVG: boolean) => {
  if (nextClassValue === '') {
    if (!hasClassAttribute(elem)) {
      return false
    }
    elem.removeAttribute('class')
    syncManagedAttributeSnapshot(elem, 'class')
    return true
  }

  if (isSVG) {
    elem.setAttribute('class', nextClassValue)
    syncManagedAttributeSnapshot(elem, 'class')
    return true
  }

  ;(elem as Element & { className: string }).className = nextClassValue
  syncManagedAttributeSnapshot(elem, 'class')
  return true
}

type BindableSignal<T> = {
  value: T
}

const isBindableSignal = <T>(value: unknown): value is BindableSignal<T> =>
  !!value && (typeof value === 'object' || typeof value === 'function') && 'value' in value

const readValueBinding = (elem: Element, currentValue: unknown) => {
  if (
    elem instanceof HTMLInputElement &&
    typeof currentValue === 'number' &&
    (elem.type === 'number' || elem.type === 'range') &&
    !Number.isNaN(elem.valueAsNumber)
  ) {
    return elem.valueAsNumber
  }

  return (elem as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
}

const tryPatchSingleElementShellInPlace = (currentNodes: Node[], nextNodes: Node[]) => {
  if (currentNodes.length !== 1 || nextNodes.length !== 1) {
    return false
  }

  const [current] = currentNodes
  const [next] = nextNodes
  if (
    !(current instanceof Element) ||
    !(next instanceof Element) ||
    current.tagName !== next.tagName
  ) {
    return false
  }
  return tryPatchElementShellInPlace(current, next)
}

const applyStaticAttributeValue = (
  elem: Element,
  name: string,
  resolved: unknown,
  isSVG: boolean,
) => {
  if (name === BIND_VALUE_PROP || name === BIND_CHECKED_PROP) {
    attr(elem, name, () => resolved)
    return
  }

  if (EVENT_ATTR_REGEX.test(name)) {
    bindStaticEventValue(elem, name[2].toLowerCase() + name.slice(3), resolved)
    return
  }

  if (name === 'style') {
    const style = getElementStyleDeclaration(elem)
    if (style && resolved && typeof resolved === 'object') {
      for (const [styleName, styleValue] of Object.entries(resolved as Record<string, string>)) {
        style.setProperty(styleName, String(styleValue))
      }
      syncManagedAttributeSnapshot(elem, 'style')
      return
    }
    elem.setAttribute('style', serializeStyleValue(resolved))
    syncManagedAttributeSnapshot(elem, 'style')
    return
  }

  if (name === 'class') {
    const nextClassValue = String(resolved)
    applyClassValue(elem, nextClassValue, isSVG)
    return
  }

  if (name === 'ref') {
    syncRuntimeRefMarker(elem, resolved)
    assignRuntimeRef(resolved, elem, getRuntimeContainer())
    return
  }

  if (name === ACTION_FORM_ATTR) {
    const nextValue =
      resolved === false || resolved === undefined || resolved === null ? null : String(resolved)
    if (nextValue === null) {
      elem.removeAttribute(name)
    } else {
      elem.setAttribute(name, nextValue)
    }
    syncManagedAttributeSnapshot(elem, name)
    if (nextValue !== null && elem instanceof HTMLFormElement) {
      ensureActionCsrfInput(elem)
    }
    return
  }

  if (name === DANGEROUSLY_SET_INNER_HTML_PROP) {
    const nextHTML =
      resolved === false || resolved === undefined || resolved === null ? '' : String(resolved)
    ;(elem as Element & { innerHTML: string }).innerHTML = nextHTML
    return
  }

  const nextValue = String(resolved)
  if (shouldUseAttributeAssignment(elem, name, isSVG)) {
    elem.setAttribute(name, nextValue)
    syncManagedAttributeSnapshot(elem, name)
  } else {
    // @ts-expect-error DOM property assignment uses dynamic keys.
    elem[name] = nextValue
    syncManagedAttributeSnapshot(elem, name)
  }
}

export const attrStatic = (elem: Element, name: string, value: unknown) => {
  applyStaticAttributeValue(elem, name, value, elem.namespaceURI === 'http://www.w3.org/2000/svg')
}

export const eventStatic = (elem: Element, eventName: string, value: unknown) => {
  bindStaticEventValue(elem, eventName, value)
}

export const listenerStatic = (elem: Element, eventName: string, value: unknown) => {
  if (typeof value !== 'function') {
    throw new Error('Direct client event bindings require function handlers.')
  }
  const runtimeContainer = getRuntimeContainer()
  if (runtimeContainer) {
    bindLiveClientListener(runtimeContainer, elem, eventName, value as (event: Event) => unknown)
    return
  }
  elem.addEventListener(eventName, value as () => void)
}

export const className = (elem: Element, value: () => unknown) => {
  const isSVG = elem.namespaceURI === 'http://www.w3.org/2000/svg'
  let lastClassValue = ATTR_UNSET as string | symbol

  effect(
    () => {
      const nextClassValue = String(value())
      if (lastClassValue !== nextClassValue) {
        applyClassValue(elem, nextClassValue, isSVG)
        lastClassValue = nextClassValue
      }
    },
    { runInContainer: false },
  )
}

export const attr = (elem: Element, name: string, value: () => unknown) => {
  const isSVG = elem.namespaceURI === 'http://www.w3.org/2000/svg'

  if (name === BIND_VALUE_PROP) {
    let lastSignalId = ATTR_UNSET as string | symbol | null
    const readBinding = () => {
      const binding = value()
      const signalId = getRuntimeSignalId(binding)
      if (signalId !== lastSignalId) {
        if (signalId) {
          elem.setAttribute(BIND_VALUE_ATTR, signalId)
        } else {
          elem.removeAttribute(BIND_VALUE_ATTR)
        }
        syncManagedAttributeSnapshot(elem, BIND_VALUE_ATTR)
        lastSignalId = signalId
      }
      return binding
    }

    const syncSignalFromElement = () => {
      const binding = readBinding()
      if (!isBindableSignal(binding)) {
        return
      }
      binding.value = readValueBinding(elem, binding.value) as never
    }

    elem.addEventListener('input', syncSignalFromElement)
    elem.addEventListener('change', syncSignalFromElement)

    effect(
      () => {
        const binding = readBinding()
        if (!isBindableSignal(binding)) {
          return
        }
        const input = elem as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        const nextValue = String(binding.value ?? '')
        if (input.value !== nextValue) {
          input.value = nextValue
        }
      },
      { runInContainer: false },
    )
    return
  }

  if (name === BIND_CHECKED_PROP) {
    if (!(elem instanceof HTMLInputElement)) {
      return
    }

    let lastSignalId = ATTR_UNSET as string | symbol | null
    const readBinding = () => {
      const binding = value()
      const signalId = getRuntimeSignalId(binding)
      if (signalId !== lastSignalId) {
        if (signalId) {
          elem.setAttribute(BIND_CHECKED_ATTR, signalId)
        } else {
          elem.removeAttribute(BIND_CHECKED_ATTR)
        }
        syncManagedAttributeSnapshot(elem, BIND_CHECKED_ATTR)
        lastSignalId = signalId
      }
      return binding
    }

    const syncSignalFromElement = () => {
      const binding = readBinding()
      if (!isBindableSignal(binding)) {
        return
      }
      binding.value = elem.checked as never
    }

    elem.addEventListener('input', syncSignalFromElement)
    elem.addEventListener('change', syncSignalFromElement)

    effect(
      () => {
        const binding = readBinding()
        if (!isBindableSignal(binding)) {
          return
        }
        const nextChecked = Boolean(binding.value)
        if (elem.checked !== nextChecked) {
          elem.checked = nextChecked
        }
      },
      { runInContainer: false },
    )
    return
  }

  if (EVENT_ATTR_REGEX.test(name)) {
    bindStaticEventValue(elem, name[2].toLowerCase() + name.slice(3), value())
    return
  }

  if (name === 'style') {
    let lastStyleString = ATTR_UNSET as string | symbol
    let lastStyleMap: Map<string, string> | null = null
    const style = getElementStyleDeclaration(elem)

    effect(
      () => {
        const resolved = value()
        if (style && resolved && typeof resolved === 'object') {
          const nextStyleMap = new Map(
            Object.entries(resolved as Record<string, string>).map(([styleName, styleValue]) => [
              styleName,
              String(styleValue),
            ]),
          )

          for (const [styleName, styleValue] of nextStyleMap) {
            if (lastStyleMap?.get(styleName) !== styleValue) {
              style.setProperty(styleName, styleValue)
            }
          }

          if (lastStyleMap) {
            for (const styleName of lastStyleMap.keys()) {
              if (!nextStyleMap.has(styleName)) {
                style.removeProperty(styleName)
              }
            }
          }

          lastStyleMap = nextStyleMap
          lastStyleString = ATTR_UNSET
          syncManagedAttributeSnapshot(elem, 'style')
          return
        }

        lastStyleMap = null
        const styleValue = serializeStyleValue(resolved)
        if (lastStyleString === styleValue) {
          return
        }
        elem.setAttribute('style', styleValue)
        lastStyleString = styleValue
        syncManagedAttributeSnapshot(elem, 'style')
      },
      { runInContainer: false },
    )
    return
  }

  if (name === 'class') {
    let lastClassValue = ATTR_UNSET as string | symbol
    effect(
      () => {
        const nextClassValue = String(value())
        if (lastClassValue === nextClassValue) {
          return
        }
        applyClassValue(elem, nextClassValue, isSVG)
        lastClassValue = nextClassValue
      },
      { runInContainer: false },
    )
    return
  }

  if (name === 'ref') {
    const resolved = value()
    syncRuntimeRefMarker(elem, resolved)
    assignRuntimeRef(resolved, elem, getRuntimeContainer())
    return
  }

  if (name === ACTION_FORM_ATTR) {
    let lastAssignedValue = ATTR_UNSET as string | symbol | null
    effect(
      () => {
        const resolved = value()
        const nextValue =
          resolved === false || resolved === undefined || resolved === null
            ? null
            : String(resolved)
        if (lastAssignedValue === nextValue) {
          return
        }
        if (nextValue === null) {
          elem.removeAttribute(name)
        } else {
          elem.setAttribute(name, nextValue)
        }
        syncManagedAttributeSnapshot(elem, name)
        if (nextValue !== null && elem instanceof HTMLFormElement) {
          ensureActionCsrfInput(elem)
        }
        lastAssignedValue = nextValue
      },
      { runInContainer: false },
    )
    return
  }

  if (name === DANGEROUSLY_SET_INNER_HTML_PROP) {
    let lastHTML = ATTR_UNSET as string | symbol
    effect(
      () => {
        const html = value()
        const nextHTML = html === false || html === undefined || html === null ? '' : String(html)
        if (lastHTML === nextHTML) {
          return
        }
        ;(elem as Element & { innerHTML: string }).innerHTML = nextHTML
        lastHTML = nextHTML
      },
      { runInContainer: false },
    )
    return
  }

  let lastAssignedValue = ATTR_UNSET as string | symbol
  effect(
    () => {
      const nextValue = String(value())
      if (lastAssignedValue === nextValue) {
        return
      }
      if (shouldUseAttributeAssignment(elem, name, isSVG)) {
        elem.setAttribute(name, nextValue)
        syncManagedAttributeSnapshot(elem, name)
      } else {
        // @ts-expect-error DOM property assignment uses dynamic keys.
        elem[name] = nextValue
        syncManagedAttributeSnapshot(elem, name)
      }
      lastAssignedValue = nextValue
    },
    { runInContainer: false },
  )
}

export const hydrate = (
  Component: Component,
  target: HTMLElement,
  options?: {
    snapshot?: unknown[]
    symbols?: Record<string, string>
  },
) => {
  const runtimeContainer = createDetachedRuntimeContainer()
  runtimeContainer.doc = target.ownerDocument
  runtimeContainer.rootElement = target
  for (const [symbolId, url] of Object.entries(options?.symbols ?? {})) {
    runtimeContainer.symbols.set(symbolId, url)
  }
  installResumeListeners(runtimeContainer)
  const nodes = withSignalSnapshot(options?.snapshot ?? null, () =>
    withRuntimeContainer(runtimeContainer, () =>
      renderClientInsertable(jsxDEV(Component as any, {}, null, false, {}), runtimeContainer),
    ),
  ).result as unknown as Node[]

  while (target.childNodes.length > 0) {
    target.lastChild?.remove()
  }

  for (const node of nodes) {
    target.appendChild(node)
  }
  rememberManagedAttributesForSubtree(target)
  restoreSignalRefs(runtimeContainer, target)
}

export const createComponent = (Component: Component, props: unknown) => {
  if (isSuspenseType(Component)) {
    return () => jsxDEV(Component, props as Record<string, unknown>, null, false, {})
  }
  if (!getComponentMeta(Component)) {
    const render = Component as (props: unknown) => unknown
    return () => render(props) as ClientElementLike
  }
  return () => jsxDEV(Component, props as Record<string, unknown>, null, false, {})
}
