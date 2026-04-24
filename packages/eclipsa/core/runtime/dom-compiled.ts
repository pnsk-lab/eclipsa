import type { JSX } from '../../jsx/types.ts'
import type { Component } from '../component.ts'
import {
  createFixedSignalEffect,
  effect,
  isSignal,
  popCleanupScope,
  pushCleanupScope,
  signal as createSignal,
  type Cleanup,
  type Signal,
} from './reactive.ts'

export type Insertable =
  | string
  | number
  | boolean
  | undefined
  | null
  | Node
  | Insertable[]
  | (() => Insertable)

const EMPTY_INSERT = Symbol('eclipsa.empty')

export const For = <T>(props: {
  arr: readonly T[]
  fallback?: JSX.Element
  fn: (value: T, index: number) => JSX.Element
  key?: (value: T, index: number) => string | number | symbol
}) =>
  ({
    __e_for: true,
    arr: props.arr,
    fallback: props.fallback,
    fn: props.fn,
    key: props.key,
  }) as unknown as JSX.Element

export const Show = <T>(props: {
  children: JSX.Element | ((value: T) => JSX.Element)
  fallback?: JSX.Element | ((value: T) => JSX.Element)
  when: T
}) =>
  (props.when
    ? typeof props.children === 'function'
      ? props.children(props.when)
      : props.children
    : typeof props.fallback === 'function'
      ? props.fallback(props.when)
      : props.fallback) as JSX.Element

export const createTemplate = (html: string) => {
  let root: Node | null = null
  return () => {
    if (!root) {
      const template = document.createElement('template')
      template.innerHTML = html
      root = template.content.firstChild
    }
    if (!root) {
      throw new Error('Client templates require a root node.')
    }
    return root.cloneNode(true)
  }
}

export const materializeTemplateRefs = (
  root: Node,
  lookupEntries: readonly (readonly [number, number, number])[],
) => {
  const refs = Array<Node>(lookupEntries.length)
  for (let index = 0; index < lookupEntries.length; index += 1) {
    const [parentRefIndex, previousSiblingRefIndex, childIndex] = lookupEntries[index]!
    const parent = parentRefIndex >= 0 ? refs[parentRefIndex]! : root
    const ref =
      previousSiblingRefIndex >= 0
        ? refs[previousSiblingRefIndex]!.nextSibling
        : childIndex === 0
          ? parent.firstChild
          : (parent.childNodes[childIndex] ?? null)
    if (!ref) {
      throw new Error('Client template ref materialization failed.')
    }
    refs[index] = ref
  }
  return refs
}

const resolvePrimitive = (value: unknown): string | typeof EMPTY_INSERT | null => {
  let resolved = value
  while (typeof resolved === 'function') {
    resolved = resolved()
  }
  if (resolved === null || resolved === undefined || resolved === false) {
    return EMPTY_INSERT
  }
  if (
    typeof resolved === 'string' ||
    typeof resolved === 'number' ||
    typeof resolved === 'boolean'
  ) {
    return String(resolved)
  }
  return null
}

const insertNode = (parent: Node, marker: Node | undefined, node: Node) => {
  parent.insertBefore(node, marker?.parentNode === parent ? marker : null)
}

export const insertElementStatic = (value: Insertable, parent: Element) => {
  const primitive = resolvePrimitive(value)
  if (primitive !== null) {
    parent.textContent = primitive === EMPTY_INSERT ? '' : primitive
    return
  }
  while (parent.firstChild) {
    parent.firstChild.remove()
  }
  for (const node of renderNodes(value)) {
    parent.appendChild(node)
  }
}

export const insertStatic = (value: Insertable, parent: Node, marker?: Node) => {
  for (const node of renderNodes(value)) {
    insertNode(parent, marker, node)
  }
}

export const insert = (value: Insertable, parent: Node, marker?: Node) => {
  let currentNodes: Node[] = []
  effect(() => {
    for (const node of currentNodes) {
      node.parentNode?.removeChild(node)
    }
    currentNodes = renderNodes(value)
    for (const node of currentNodes) {
      insertNode(parent, marker, node)
    }
  })
}

const textUpdate = (target: Node, value: unknown) => {
  const primitive = resolvePrimitive(value)
  if (primitive !== null) {
    target.textContent = primitive === EMPTY_INSERT ? '' : primitive
    return true
  }
  return false
}

export const text = (value: Insertable, parent: Node, marker?: Node) => {
  const node = document.createTextNode('')
  insertNode(parent, marker, node)
  effect(() => textUpdate(node, value))
}

export const textSignal = <T>(
  signal: Signal<T>,
  project: (value: T) => Insertable,
  parent: Node,
  marker?: Node,
) => {
  const node = document.createTextNode('')
  insertNode(parent, marker, node)
  createFixedSignalEffect(signal, (value) => textUpdate(node, project(value)))
}

export const textNodeSignal = <T>(
  signal: Signal<T>,
  project: (value: T) => Insertable,
  target: Node,
) => {
  createFixedSignalEffect(signal, (value) => textUpdate(target, project(value)))
}

export const textNodeSignalValue = <T>(signal: Signal<T>, target: Node) => {
  createFixedSignalEffect(signal, (value) => textUpdate(target, value))
}

export const textNodeSignalMember = <T extends Record<string, unknown>>(
  signal: Signal<T>,
  member: string,
  target: Node,
) => {
  createFixedSignalEffect(signal, (value) => textUpdate(target, value[member]))
}

export const textNodeSignalMemberStatic = textNodeSignalMember

const applyClass = (elem: Element, value: string) => {
  if (value === '') {
    elem.removeAttribute('class')
    return
  }
  ;(elem as Element & { className: string }).className = value
}

export const classSignalEqualsStatic = <T>(
  elem: Element,
  signal: Signal<T>,
  expected: unknown,
  truthyValue: unknown,
  falsyValue: unknown,
) => {
  const truthy = String(truthyValue)
  const falsy = String(falsyValue)
  createFixedSignalEffect(signal, (value) => applyClass(elem, value === expected ? truthy : falsy))
}

export const classSignalEquals = classSignalEqualsStatic

export const classSignalValue = <T>(elem: Element, signal: Signal<T>) => {
  createFixedSignalEffect(signal, (value) => applyClass(elem, String(value)))
}

export const classSignalMember = <T extends Record<string, unknown>>(
  elem: Element,
  signal: Signal<T>,
  member: string,
) => {
  createFixedSignalEffect(signal, (value) => applyClass(elem, String(value[member])))
}

export const classSignal = <T>(
  elem: Element,
  signal: Signal<T>,
  project: (value: T) => unknown,
) => {
  createFixedSignalEffect(signal, (value) => applyClass(elem, String(project(value))))
}

export const className = (elem: Element, value: () => unknown) => {
  effect(() => applyClass(elem, String(value())))
}

export const attrStatic = (elem: Element, name: string, value: unknown) => {
  elem.setAttribute(name, String(value))
}

export const attr = (elem: Element, name: string, value: () => unknown) => {
  effect(() => attrStatic(elem, name, value()))
}

export const createComponent = (Component: Component, props: unknown) => {
  return () => (Component as (props: unknown) => Insertable)(props)
}

export const renderNodes = (value: Insertable): Node[] => {
  let resolved = value
  while (typeof resolved === 'function') {
    resolved = resolved()
  }
  if (resolved === null || resolved === undefined || resolved === false) {
    return []
  }
  if (Array.isArray(resolved)) {
    return resolved.flatMap((item) => renderNodes(item))
  }
  if (resolved instanceof Node) {
    return [resolved]
  }
  return [document.createTextNode(String(resolved))]
}

type RowState<T> = {
  cleanups: Cleanup[]
  key: string | number | symbol
  node: Node
  signal: Signal<T>
}

export const insertFor = <T>(
  props: {
    arr: readonly T[]
    arrSignal?: Signal<readonly T[]>
    fallback?: Insertable
    fn: (value: Signal<T>, index: Signal<number>) => Insertable
    key?: (value: T, index: number) => string | number | symbol
    keyMember?: string
  },
  parent: Node,
  marker?: Node,
) => {
  const rows = new Map<string | number | symbol, RowState<T>>()
  const indexSignals = new Map<string | number | symbol, Signal<number>>()

  const render = (items: readonly T[]) => {
    const used = new Set<string | number | symbol>()
    const ordered: RowState<T>[] = []
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!
      const key = props.keyMember
        ? ((item as Record<string, string | number | symbol>)[props.keyMember] ?? index)
        : (props.key?.(item, index) ?? index)
      used.add(key)
      let row = rows.get(key)
      if (row) {
        row.signal.value = item
        indexSignals.get(key)!.value = index
      } else {
        const cleanups: Cleanup[] = []
        const previousCleanups = pushCleanupScope(cleanups)
        const rowSignal = createSignal(item)
        const indexSignal = createSignal(index)
        let node: Node
        try {
          node = renderNodes(props.fn(rowSignal, indexSignal))[0] ?? document.createTextNode('')
        } finally {
          popCleanupScope(previousCleanups)
        }
        row = {
          cleanups,
          key,
          node,
          signal: rowSignal,
        }
        rows.set(key, row)
        indexSignals.set(key, indexSignal)
      }
      ordered.push(row)
    }

    for (const [key, row] of rows) {
      if (used.has(key)) {
        continue
      }
      for (const cleanup of row.cleanups) {
        cleanup()
      }
      row.node.parentNode?.removeChild(row.node)
      rows.delete(key)
      indexSignals.delete(key)
    }

    let cursor = marker?.parentNode === parent ? marker : null
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const node = ordered[index]!.node
      if (node.nextSibling !== cursor) {
        parent.insertBefore(node, cursor)
      }
      cursor = node
    }
  }

  if (props.arrSignal && isSignal(props.arrSignal)) {
    createFixedSignalEffect(props.arrSignal, (items) => render(items))
    return
  }

  effect(() => render(props.arr))
}
