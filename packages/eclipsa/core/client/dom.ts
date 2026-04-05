import { jsxDEV } from '../../jsx/jsx-dev-runtime.ts'
import type { Component } from '../component.ts'
import { getComponentMeta } from '../internal.ts'
import {
  assignRuntimeRef,
  bindRuntimeEvent,
  captureClientInsertOwner,
  createDetachedClientInsertOwner,
  getRuntimeSignalId,
  getRuntimeContainer,
  preserveReusableContentInRoots,
  rememberManagedAttributesForNode,
  rememberManagedAttributesForNodes,
  rememberInsertMarkerRange,
  renderClientInsertable,
  renderClientInsertableForOwner,
  restoreSignalRefs,
  syncManagedAttributeSnapshot,
  syncRuntimeRefMarker,
  shouldReconnectDetachedInsertMarkers,
  tryPatchElementShellInPlace,
  tryPatchNodeSequenceInPlace,
} from '../runtime.ts'
import { effect } from '../signal.ts'
import { isSuspenseType } from '../suspense.ts'
import { withSignalSnapshot } from '../snapshot.ts'
import type { ClientElementLike, Insertable } from './types.ts'

const INSERT_MARKER_PREFIX = 'ec:i:'

const ensureInsertMarkerKey = (
  marker: Node | undefined,
  runtimeContainer: ReturnType<typeof getRuntimeContainer>,
) => {
  if (!(marker instanceof Comment) || !runtimeContainer) {
    return null
  }

  if (marker.data.startsWith(INSERT_MARKER_PREFIX)) {
    return marker.data
  }

  const key = `${INSERT_MARKER_PREFIX}${runtimeContainer.nextElementId++}`
  marker.data = key
  return key
}

const findLiveInsertMarker = (doc: Document | undefined, markerKey: string | null) => {
  if (!doc?.body || !markerKey || typeof doc.createTreeWalker !== 'function') {
    return null
  }

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT)
  let next = walker.nextNode()
  while (next) {
    if (next instanceof Comment && next.data === markerKey) {
      return next
    }
    next = walker.nextNode()
  }
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

const COMPONENT_BOUNDARY_START_REGEX = /^ec:c:(.+):start$/
const COMPONENT_BOUNDARY_END_REGEX = /^ec:c:(.+):end$/

const getBoundaryMarker = (node: Node | null | undefined) => {
  if (!(node instanceof Comment)) {
    return null
  }

  const start = node.data.match(COMPONENT_BOUNDARY_START_REGEX)
  if (start?.[1]) {
    return {
      id: start[1],
      kind: 'start' as const,
    }
  }

  const end = node.data.match(COMPONENT_BOUNDARY_END_REGEX)
  if (end?.[1]) {
    return {
      id: end[1],
      kind: 'end' as const,
    }
  }

  return null
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

export const createTemplate = (html: string): (() => Node) => {
  let template: HTMLTemplateElement | null = null

  return () => {
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = html
    }
    const node = (template.cloneNode(true) as HTMLTemplateElement).content.firstChild as Node
    rememberManagedAttributesForNode(node)
    return node
  }
}

export const insert = (value: Insertable, parent: Node, marker?: Node) => {
  let lastFirstNode = marker
  let lastNodeLength = 0
  const runtimeContainer = getRuntimeContainer()
  if (!runtimeContainer) {
    throw new Error('Client insertions require an active runtime container.')
  }
  const ownerSiteKey =
    marker instanceof Comment && !marker.data.startsWith(INSERT_MARKER_PREFIX) ? marker.data : null
  const owner =
    captureClientInsertOwner(runtimeContainer, ownerSiteKey) ??
    createDetachedClientInsertOwner(runtimeContainer)
  const markerKey = ensureInsertMarkerKey(marker, runtimeContainer)
  const collectCurrentNodes = (
    liveMarker: Node | undefined,
    stableParents: Array<Node | null | undefined>,
  ) => {
    if (
      !lastFirstNode ||
      lastNodeLength === 0 ||
      !hasUsableInsertParent(lastFirstNode, stableParents)
    ) {
      const liveNodes = collectNodesBeforeMarker(liveMarker, lastNodeLength)
      return liveNodes.every((node) => hasUsableInsertParent(node, stableParents)) ? liveNodes : []
    }
    const nodes = [lastFirstNode]
    let cursor = lastFirstNode
    while (nodes.length < lastNodeLength) {
      const next = cursor.nextSibling
      if (!next || !hasUsableInsertParent(next, stableParents)) {
        return [] as Node[]
      }
      cursor = next
      nodes.push(cursor)
    }
    return nodes
  }

  effect(() => {
    const shouldReconnect = shouldReconnectDetachedInsertMarkers(runtimeContainer)
    const liveMarker = !(marker instanceof Comment)
      ? marker
      : isConnectedNode(marker.parentNode)
        ? marker
        : shouldReconnect
          ? (findLiveInsertMarker(runtimeContainer.doc, markerKey) ?? marker)
          : marker
    const stableParents = liveMarker?.parentNode
      ? [liveMarker.parentNode, parent === liveMarker.parentNode ? parent : null]
      : [parent, marker?.parentNode]
    const liveLastParent = isUsableInsertParent(lastFirstNode?.parentNode, stableParents)
      ? lastFirstNode?.parentNode
      : null
    const liveMarkerParent = isUsableInsertParent(liveMarker?.parentNode, stableParents)
      ? liveMarker?.parentNode
      : null
    const resolvedParent = (liveLastParent ?? liveMarkerParent ?? parent) as ParentNode | null
    const targetParent = resolvedParent ?? (parent as ParentNode)
    const newNodes = owner
      ? renderClientInsertableForOwner(value, runtimeContainer, owner)
      : renderClientInsertable(value, runtimeContainer)
    const seededCurrentNodes =
      lastNodeLength === 0 && liveMarker instanceof Comment
        ? collectNodesBeforeMarker(liveMarker, newNodes.length)
        : []
    const currentNodes =
      seededCurrentNodes.length !== 0 &&
      seededCurrentNodes.every((node) => hasUsableInsertParent(node, stableParents)) &&
      canReconnectOwnerRange(seededCurrentNodes, newNodes)
        ? seededCurrentNodes
        : collectCurrentNodes(liveMarker, stableParents)

    if (currentNodes.length !== 0 && lastNodeLength === 0) {
      lastFirstNode = currentNodes[0]
      lastNodeLength = currentNodes.length
    }

    if (
      currentNodes.length === lastNodeLength &&
      currentNodes.length !== 0 &&
      newNodes.length !== 0 &&
      (tryPatchNodeSequenceInPlace(currentNodes, newNodes) ||
        tryPatchSingleElementShellInPlace(currentNodes, newNodes))
    ) {
      restoreSignalRefs(runtimeContainer, targetParent)
      rememberInsertMarkerRange(liveMarker, currentNodes)
      lastFirstNode = currentNodes[0]
      lastNodeLength = currentNodes.length
      return
    }

    let replacementNodes = newNodes
    if (currentNodes.length !== 0 && newNodes.length !== 0) {
      const doc = runtimeContainer.doc
      if (!doc) {
        throw new Error('Client insertions require an active runtime document.')
      }
      const stagingParent = doc.createElement('div')
      for (const node of newNodes) {
        stagingParent.appendChild(node)
      }
      preserveReusableContentInRoots(currentNodes, Array.from(stagingParent.childNodes))
      replacementNodes = Array.from(stagingParent.childNodes)
    }

    const insertReference = liveMarker?.parentNode === targetParent ? liveMarker : null
    for (const node of currentNodes) {
      if (node.parentNode === targetParent) {
        removeNodeFromParent(node, targetParent)
      }
    }
    for (const node of replacementNodes) {
      targetParent.insertBefore(node, insertReference)
    }

    rememberManagedAttributesForNodes(replacementNodes)
    rememberInsertMarkerRange(liveMarker, replacementNodes)

    lastFirstNode = replacementNodes[0] ?? liveMarker
    lastNodeLength = replacementNodes.length
  })
}

const EVENT_ATTR_REGEX = /^on[A-Z].+$/
const DANGEROUSLY_SET_INNER_HTML_PROP = 'dangerouslySetInnerHTML'
const BIND_VALUE_PROP = 'bind:value'
const BIND_CHECKED_PROP = 'bind:checked'
const BIND_VALUE_ATTR = 'data-e-bind-value'
const BIND_CHECKED_ATTR = 'data-e-bind-checked'
const shouldUseAttributeAssignment = (elem: Element, name: string, isSVG: boolean) =>
  isSVG || name.startsWith('data-') || name.startsWith('aria-') || !(name in elem)

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

export const attr = (elem: Element, name: string, value: () => unknown) => {
  const isSVG = elem.namespaceURI === 'http://www.w3.org/2000/svg'

  if (name === BIND_VALUE_PROP) {
    const readBinding = () => {
      const binding = value()
      const signalId = getRuntimeSignalId(binding)
      if (signalId) {
        elem.setAttribute(BIND_VALUE_ATTR, signalId)
      } else {
        elem.removeAttribute(BIND_VALUE_ATTR)
      }
      syncManagedAttributeSnapshot(elem, BIND_VALUE_ATTR)
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

    effect(() => {
      const binding = readBinding()
      if (!isBindableSignal(binding)) {
        return
      }
      ;(elem as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = String(
        binding.value ?? '',
      )
    })
    return
  }

  if (name === BIND_CHECKED_PROP) {
    if (!(elem instanceof HTMLInputElement)) {
      return
    }

    const readBinding = () => {
      const binding = value()
      const signalId = getRuntimeSignalId(binding)
      if (signalId) {
        elem.setAttribute(BIND_CHECKED_ATTR, signalId)
      } else {
        elem.removeAttribute(BIND_CHECKED_ATTR)
      }
      syncManagedAttributeSnapshot(elem, BIND_CHECKED_ATTR)
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

    effect(() => {
      const binding = readBinding()
      if (!isBindableSignal(binding)) {
        return
      }
      elem.checked = Boolean(binding.value)
    })
    return
  }

  if (EVENT_ATTR_REGEX.test(name)) {
    const eventName = name[2].toLowerCase() + name.slice(3)
    const resolved = value()
    if (bindRuntimeEvent(elem, eventName, resolved)) {
      return
    }
    if (typeof resolved !== 'function') {
      throw new Error('Resumable event bindings require an active runtime container.')
    }
    elem.addEventListener(eventName, resolved as () => void)
    return
  }

  if (name === 'style') {
    effect(() => {
      const resolved = value()
      const styleValue =
        resolved && typeof resolved === 'object'
          ? Object.entries(resolved as Record<string, string>)
              .map(([k, v]) => `${k}: ${v}`)
              .join('; ')
          : String(resolved ?? '')
      elem.setAttribute('style', styleValue)
      syncManagedAttributeSnapshot(elem, 'style')
    })
    return
  }

  if (name === 'class') {
    effect(() => {
      if (isSVG) {
        elem.setAttribute('class', String(value()))
        syncManagedAttributeSnapshot(elem, 'class')
        return
      }
      ;(elem as Element & { className: string }).className = String(value())
      syncManagedAttributeSnapshot(elem, 'class')
    })
    return
  }

  if (name === 'ref') {
    const resolved = value()
    syncRuntimeRefMarker(elem, resolved)
    assignRuntimeRef(resolved, elem, getRuntimeContainer())
    return
  }

  if (name === DANGEROUSLY_SET_INNER_HTML_PROP) {
    effect(() => {
      const html = value()
      ;(elem as Element & { innerHTML: string }).innerHTML =
        html === false || html === undefined || html === null ? '' : String(html)
    })
    return
  }

  effect(() => {
    if (shouldUseAttributeAssignment(elem, name, isSVG)) {
      elem.setAttribute(name, String(value()))
      syncManagedAttributeSnapshot(elem, name)
      return
    }
    // @ts-expect-error DOM property assignment uses dynamic keys.
    elem[name] = String(value())
    syncManagedAttributeSnapshot(elem, name)
  })
}

export const hydrate = (
  Component: Component,
  target: HTMLElement,
  options?: {
    snapshot?: unknown[]
  },
) => {
  const elem = withSignalSnapshot(options?.snapshot ?? null, () => Component({}))
    .result as unknown as ClientElementLike

  while (target.childNodes.length > 0) {
    target.lastChild?.remove()
  }

  for (const entry of Array.isArray(elem) ? elem : [elem]) {
    insert(() => entry, target)
  }
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
