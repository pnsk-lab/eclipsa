import { jsxDEV } from '../../jsx/jsx-dev-runtime.ts'
import type { Component } from '../component.ts'
import { getComponentMeta } from '../internal.ts'
import {
  assignRuntimeRef,
  bindRuntimeEvent,
  captureClientInsertOwner,
  getRuntimeContainer,
  renderClientInsertable,
  renderClientInsertableForOwner,
  tryPatchNodeSequenceInPlace,
} from '../runtime.ts'
import { effect } from '../signal.ts'
import { isSuspenseType } from '../suspense.ts'
import { withSignalSnapshot } from '../snapshot.ts'
import type { ClientElementLike, Insertable } from './types.ts'

export const createTemplate = (html: string): (() => Node) => {
  let template: HTMLTemplateElement | null = null

  return () => {
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = html
    }
    return (template.cloneNode(true) as HTMLTemplateElement).content.firstChild as Node
  }
}

export const insert = (value: Insertable, parent: Node, marker?: Node) => {
  let lastFirstNode = marker
  let lastNodeLength = 0
  const runtimeContainer = getRuntimeContainer()
  if (!runtimeContainer) {
    throw new Error('Client insertions require an active runtime container.')
  }
  const owner = captureClientInsertOwner(runtimeContainer)
  let initialized = false
  const collectCurrentNodes = () => {
    if (!lastFirstNode || lastNodeLength === 0) {
      return [] as Node[]
    }
    const nodes = [lastFirstNode]
    let cursor = lastFirstNode
    while (nodes.length < lastNodeLength) {
      const next = cursor.nextSibling
      if (!next) {
        return [] as Node[]
      }
      cursor = next
      nodes.push(cursor)
    }
    return nodes
  }

  effect(() => {
    const newNodes =
      initialized && owner
        ? renderClientInsertableForOwner(value, runtimeContainer, owner)
        : renderClientInsertable(value, runtimeContainer)
    const currentNodes = collectCurrentNodes()

    if (
      currentNodes.length === lastNodeLength &&
      currentNodes.length !== 0 &&
      newNodes.length !== 0 &&
      (tryPatchNodeSequenceInPlace(currentNodes, newNodes) ||
        tryPatchSingleElementShellInPlace(currentNodes, newNodes))
    ) {
      lastFirstNode = currentNodes[0]
      lastNodeLength = currentNodes.length
      return
    }

    if (lastFirstNode && newNodes.length !== 0) {
      for (let i = 1; i < lastNodeLength; i++) {
        lastFirstNode.nextSibling?.remove()
      }
      parent.replaceChild(newNodes[0], lastFirstNode)
      for (let i = 1; i < newNodes.length; i++) {
        parent.insertBefore(newNodes[i], newNodes[i - 1].nextSibling)
      }
    } else {
      for (const node of newNodes) {
        parent.appendChild(node)
      }
    }

    lastFirstNode = newNodes[0]
    lastNodeLength = newNodes.length
    initialized = true
  })
}

const EVENT_ATTR_REGEX = /^on[A-Z].+$/
const DANGEROUSLY_SET_INNER_HTML_PROP = 'dangerouslySetInnerHTML'
const BIND_VALUE_PROP = 'bind:value'
const BIND_CHECKED_PROP = 'bind:checked'
const shouldUseAttributeAssignment = (elem: Element, name: string, isSVG: boolean) =>
  isSVG || name.startsWith('data-') || name.startsWith('aria-') || !(name in elem)

type BindableSignal<T> = {
  value: T
}

const isBindableSignal = <T>(value: unknown): value is BindableSignal<T> =>
  !!value && (typeof value === 'object' || typeof value === 'function') && 'value' in value

const readValueBinding = (elem: Element, currentValue: unknown) => {
  if (
    elem instanceof HTMLInputElement
    && typeof currentValue === 'number'
    && (elem.type === 'number' || elem.type === 'range')
    && !Number.isNaN(elem.valueAsNumber)
  ) {
    return elem.valueAsNumber
  }

  return (elem as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
}

const syncElementAttributes = (current: Element, next: Element) => {
  const nextNames = new Set(next.getAttributeNames())

  for (const name of current.getAttributeNames()) {
    if (!nextNames.has(name)) {
      current.removeAttribute(name)
    }
  }

  for (const name of nextNames) {
    const nextValue = next.getAttribute(name)
    if (nextValue === null) {
      current.removeAttribute(name)
      continue
    }
    if (current.getAttribute(name) !== nextValue) {
      current.setAttribute(name, nextValue)
    }
  }
}

const hasComponentBoundaryMarkers = (node: Node): boolean => {
  if (node.nodeType === Node.COMMENT_NODE) {
    return /^ec:c:.+:(start|end)$/.test((node as Comment).data)
  }
  for (const child of node.childNodes) {
    if (hasComponentBoundaryMarkers(child)) {
      return true
    }
  }
  return false
}

const tryPatchSingleElementShellInPlace = (currentNodes: Node[], nextNodes: Node[]) => {
  if (currentNodes.length !== 1 || nextNodes.length !== 1) {
    return false
  }

  const [current] = currentNodes
  const [next] = nextNodes
  if (!(current instanceof Element) || !(next instanceof Element) || current.tagName !== next.tagName) {
    return false
  }
  if (hasComponentBoundaryMarkers(current) || hasComponentBoundaryMarkers(next)) {
    return false
  }

  syncElementAttributes(current, next)
  while (current.firstChild) {
    current.firstChild.remove()
  }
  while (next.firstChild) {
    current.appendChild(next.firstChild)
  }
  return true
}

export const attr = (elem: Element, name: string, value: () => unknown) => {
  const isSVG = elem.namespaceURI === 'http://www.w3.org/2000/svg'

  if (name === BIND_VALUE_PROP) {
    const syncSignalFromElement = () => {
      const binding = value()
      if (!isBindableSignal(binding)) {
        return
      }
      binding.value = readValueBinding(elem, binding.value) as never
    }

    elem.addEventListener('input', syncSignalFromElement)
    elem.addEventListener('change', syncSignalFromElement)

    effect(() => {
      const binding = value()
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

    const syncSignalFromElement = () => {
      const binding = value()
      if (!isBindableSignal(binding)) {
        return
      }
      binding.value = elem.checked as never
    }

    elem.addEventListener('input', syncSignalFromElement)
    elem.addEventListener('change', syncSignalFromElement)

    effect(() => {
      const binding = value()
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
    })
    return
  }

  if (name === 'class') {
    effect(() => {
      if (isSVG) {
        elem.setAttribute('class', String(value()))
        return
      }
      ;(elem as Element & { className: string }).className = String(value())
    })
    return
  }

  if (name === 'ref') {
    assignRuntimeRef(value(), elem, getRuntimeContainer())
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
      return
    }
    // @ts-expect-error DOM property assignment uses dynamic keys.
    elem[name] = String(value())
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
