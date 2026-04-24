import type { JSX } from '../../jsx/types.ts'
import type { Component } from '../component.ts'
import type { EventDescriptor, PackedEventDescriptor } from '../meta.ts'

type Insertable =
  | string
  | number
  | boolean
  | undefined
  | null
  | Node
  | Insertable[]
  | (() => Insertable)
type Signal<T = unknown> = { value: T }
type Effect = () => void
type Cleanup = () => void

const EMPTY_INSERT = Symbol('eclipsa.empty')
const signalRecords = new WeakMap<object, { effects: Set<Effect>; value: unknown }>()
let currentEffect: Effect | null = null
let currentCleanups: Cleanup[] | null = null
let runtimeSymbols: Record<string, string> = {}

const isSignal = (value: unknown): value is Signal =>
  !!value && (typeof value === 'object' || typeof value === 'function') && signalRecords.has(value)

const createSignal = <T>(initialValue: T): Signal<T> => {
  const record = {
    effects: new Set<Effect>(),
    value: initialValue as unknown,
  }
  const handle = {} as Signal<T>
  signalRecords.set(handle, record)
  Object.defineProperty(handle, 'value', {
    configurable: true,
    enumerable: true,
    get() {
      if (currentEffect) {
        record.effects.add(currentEffect)
      }
      return record.value as T
    },
    set(nextValue: T) {
      if (Object.is(record.value, nextValue)) {
        return
      }
      record.value = nextValue
      const effects = Array.from(record.effects)
      for (const effect of effects) {
        effect()
      }
    },
  })
  return handle
}

export const useSignal = createSignal
export const signal = createSignal

export const effect = (fn: () => void) => {
  const run = () => {
    currentEffect = run
    try {
      fn()
    } finally {
      currentEffect = null
    }
  }
  run()
  return run
}

export const onCleanup = (fn: Cleanup) => {
  currentCleanups?.push(fn)
}

export const onMount = (fn: () => void) => {
  fn()
}

export const onVisible = (fn: () => void) => {
  fn()
}

export const useWatch = (fn: () => void) => effect(fn)
export const useComputed = <T>(fn: () => T): Signal<T> => {
  const computed = createSignal(fn())
  effect(() => {
    computed.value = fn()
  })
  return computed
}
export const useComputed$ = useComputed

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

const capturesFor = (descriptor: EventDescriptor) => {
  if ('captures' in descriptor) {
    return typeof descriptor.captures === 'function' ? descriptor.captures() : descriptor.captures
  }
  const packed = descriptor as PackedEventDescriptor
  switch (packed.captureCount) {
    case 0:
      return []
    case 1:
      return [packed.capture0]
    case 2:
      return [packed.capture0, packed.capture1]
    case 3:
      return [packed.capture0, packed.capture1, packed.capture2]
    case 4:
      return [packed.capture0, packed.capture1, packed.capture2, packed.capture3]
  }
}

const runEventDescriptor = async (descriptor: EventDescriptor, event: Event) => {
  const url = runtimeSymbols[descriptor.symbol]
  if (!url) {
    throw new Error(`Unknown resumable event symbol "${descriptor.symbol}".`)
  }
  const module = (await import(/* @vite-ignore */ url)) as { default?: Function }
  if (typeof module.default !== 'function') {
    throw new Error(`Resumable event symbol "${descriptor.symbol}" does not export a function.`)
  }
  const captures = capturesFor(descriptor)
  return module.default(captures, module.default.length >= 2 ? event : undefined)
}

const isEventDescriptor = (value: unknown): value is EventDescriptor =>
  !!value && typeof value === 'object' && typeof (value as EventDescriptor).symbol === 'string'

export const eventStatic = Object.assign(
  (elem: Element, eventName: string, value: unknown) => {
    if (typeof value === 'function') {
      elem.addEventListener(eventName, value as EventListener)
      return
    }
    if (isEventDescriptor(value)) {
      elem.addEventListener(eventName, (event) => {
        void runEventDescriptor(value, event)
      })
      return
    }
    throw new Error('Resumable event bindings require a function or descriptor.')
  },
  {
    __0: (elem: Element, eventName: string, symbol: string) =>
      eventStatic(elem, eventName, { captureCount: 0, symbol }),
    __1: (elem: Element, eventName: string, symbol: string, capture0: unknown) =>
      eventStatic(elem, eventName, { capture0, captureCount: 1, symbol }),
    __2: (elem: Element, eventName: string, symbol: string, capture0: unknown, capture1: unknown) =>
      eventStatic(elem, eventName, { capture0, capture1, captureCount: 2, symbol }),
    __3: (
      elem: Element,
      eventName: string,
      symbol: string,
      capture0: unknown,
      capture1: unknown,
      capture2: unknown,
    ) => eventStatic(elem, eventName, { capture0, capture1, capture2, captureCount: 3, symbol }),
    __4: (
      elem: Element,
      eventName: string,
      symbol: string,
      capture0: unknown,
      capture1: unknown,
      capture2: unknown,
      capture3: unknown,
    ) =>
      eventStatic(elem, eventName, {
        capture0,
        capture1,
        capture2,
        capture3,
        captureCount: 4,
        symbol,
      }),
  },
)

export const listenerStatic = eventStatic

export const createComponent = (Component: Component, props: unknown) => {
  return () => (Component as (props: unknown) => Insertable)(props)
}

const renderNodes = (value: Insertable): Node[] => {
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
        const previousCleanups = currentCleanups
        const cleanups: Cleanup[] = []
        currentCleanups = cleanups
        const rowSignal = createSignal(item)
        const indexSignal = createSignal(index)
        const node = renderNodes(props.fn(rowSignal, indexSignal))[0] ?? document.createTextNode('')
        currentCleanups = previousCleanups
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

export const createFixedSignalEffect = <T>(
  signal: Signal<T>,
  fn: (value: T) => void,
  options?: { skipInitialRun?: boolean },
) => {
  const record = signalRecords.get(signal)
  if (!record) {
    return false
  }
  const run = () => fn(record.value as T)
  record.effects.add(run)
  currentCleanups?.push(() => record.effects.delete(run))
  if (options?.skipInitialRun !== true) {
    run()
  }
  return true
}

export const hydrate = (
  Component: Component,
  target: HTMLElement,
  options?: {
    snapshot?: unknown[]
    symbols?: Record<string, string>
  },
) => {
  if (target.childNodes.length > 0 || options?.snapshot != null) {
    void import('eclipsa/client').then((client) => client.hydrate(Component, target, options))
    return
  }

  runtimeSymbols = options?.symbols ?? {}
  const nodes = renderNodes((Component as () => Insertable)())
  for (const node of nodes) {
    target.appendChild(node)
  }
}
