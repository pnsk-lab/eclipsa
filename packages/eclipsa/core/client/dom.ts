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
  getRememberedInsertMarkerNodeCount,
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
const EMPTY_INSERT_COMMENT = 'eclipsa-empty'
const ATTR_UNSET = Symbol('eclipsa.attr-unset')

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
    const primitiveValue = resolveFastInsertValue(value)
    const seedCurrentNodes = (count: number) =>
      lastNodeLength === 0 &&
      liveMarker instanceof Comment &&
      getRememberedInsertMarkerNodeCount(liveMarker) === count
        ? collectNodesBeforeMarker(liveMarker, count)
        : []
    const replaceCurrentNodes = (currentNodes: Node[], replacementNode: Node) => {
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
      lastFirstNode = replacementNode
      lastNodeLength = 1
    }

    if (primitiveValue) {
      const seededCurrentNodes = seedCurrentNodes(1)
      const currentNodes =
        seededCurrentNodes.length !== 0 &&
        seededCurrentNodes.every((node) => hasUsableInsertParent(node, stableParents))
          ? seededCurrentNodes
          : collectCurrentNodes(liveMarker, stableParents)

      if (currentNodes.length !== 0 && lastNodeLength === 0) {
        lastFirstNode = currentNodes[0]
        lastNodeLength = currentNodes.length
      }

      if (primitiveValue.kind === 'text') {
        if (currentNodes.length === 1 && currentNodes[0] instanceof Text) {
          if (currentNodes[0].data !== primitiveValue.value) {
            currentNodes[0].data = primitiveValue.value
          }
          rememberInsertMarkerRange(liveMarker, currentNodes)
          lastFirstNode = currentNodes[0]
          lastNodeLength = 1
          return
        }

        const doc = runtimeContainer.doc ?? targetParent.ownerDocument
        if (!doc) {
          throw new Error('Client insertions require an active runtime document.')
        }

        replaceCurrentNodes(currentNodes, doc.createTextNode(primitiveValue.value))
        return
      }

      if (currentNodes.length === 1 && isManagedEmptyInsertComment(currentNodes[0])) {
        rememberInsertMarkerRange(liveMarker, currentNodes)
        lastFirstNode = currentNodes[0]
        lastNodeLength = 1
        return
      }

      const doc = runtimeContainer.doc ?? targetParent.ownerDocument
      if (!doc) {
        throw new Error('Client insertions require an active runtime document.')
      }

      replaceCurrentNodes(currentNodes, doc.createComment(EMPTY_INSERT_COMMENT))
      return
    }

    const newNodes = owner
      ? renderClientInsertableForOwner(value, runtimeContainer, owner)
      : renderClientInsertable(value, runtimeContainer)
    const seededCurrentNodes =
      seedCurrentNodes(newNodes.length)
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

    effect(() => {
      const binding = readBinding()
      if (!isBindableSignal(binding)) {
        return
      }
      const input = elem as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      const nextValue = String(binding.value ?? '')
      if (input.value !== nextValue) {
        input.value = nextValue
      }
    })
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

    effect(() => {
      const binding = readBinding()
      if (!isBindableSignal(binding)) {
        return
      }
      const nextChecked = Boolean(binding.value)
      if (elem.checked !== nextChecked) {
        elem.checked = nextChecked
      }
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
    let lastStyleString = ATTR_UNSET as string | symbol
    let lastStyleMap: Map<string, string> | null = null
    const style = getElementStyleDeclaration(elem)

    effect(() => {
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
    })
    return
  }

  if (name === 'class') {
    let lastClassValue = ATTR_UNSET as string | symbol
    effect(() => {
      const nextClassValue = String(value())
      if (lastClassValue === nextClassValue) {
        return
      }
      if (isSVG) {
        elem.setAttribute('class', nextClassValue)
        syncManagedAttributeSnapshot(elem, 'class')
      } else {
        ;(elem as Element & { className: string }).className = nextClassValue
        syncManagedAttributeSnapshot(elem, 'class')
      }
      lastClassValue = nextClassValue
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
    let lastHTML = ATTR_UNSET as string | symbol
    effect(() => {
      const html = value()
      const nextHTML =
        html === false || html === undefined || html === null ? '' : String(html)
      if (lastHTML === nextHTML) {
        return
      }
      ;(elem as Element & { innerHTML: string }).innerHTML = nextHTML
      lastHTML = nextHTML
    })
    return
  }

  let lastAssignedValue = ATTR_UNSET as string | symbol
  effect(() => {
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
