import type { NativeComponent } from './component.ts'

const COMPONENT_META_KEY = Symbol.for('eclipsa.native.component-meta')
const LAZY_META_KEY = Symbol.for('eclipsa.native.lazy-meta')
const WATCH_META_KEY = Symbol.for('eclipsa.native.watch-meta')

export interface ComponentMeta {
  captures: () => unknown[]
  symbol: string
}

export interface LazyMeta {
  captures: () => unknown[]
  symbol: string
}

export interface WatchMeta {
  captures: () => unknown[]
  symbol: string
}

export const defineComponent = <P>(
  component: NativeComponent<P>,
  symbol: string,
  captures: () => unknown[] = () => [],
) => {
  Object.defineProperty(component, COMPONENT_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      captures,
      symbol,
    } satisfies ComponentMeta,
    writable: true,
  })
  return component
}

export const defineLazySymbol = <T extends (...args: any[]) => unknown>(
  symbol: string,
  fn: T,
  captures: () => unknown[] = () => [],
) => {
  Object.defineProperty(fn, LAZY_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      captures,
      symbol,
    } satisfies LazyMeta,
    writable: true,
  })
  return fn
}

export const defineWatchSymbol = <T extends (...args: any[]) => unknown>(
  symbol: string,
  fn: T,
  captures: () => unknown[] = () => [],
) => {
  Object.defineProperty(fn, WATCH_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      captures,
      symbol,
    } satisfies WatchMeta,
    writable: true,
  })
  return fn
}

export const getComponentMeta = (value: unknown): ComponentMeta | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[COMPONENT_META_KEY] as
      | ComponentMeta
      | undefined) ?? null
  )
}

export const getLazyMeta = (value: unknown): LazyMeta | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[LAZY_META_KEY] as LazyMeta | undefined) ??
    null
  )
}

export const getWatchMeta = (value: unknown): WatchMeta | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[WATCH_META_KEY] as WatchMeta | undefined) ??
    null
  )
}
