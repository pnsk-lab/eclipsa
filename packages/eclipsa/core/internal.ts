import type { Component, EURL } from './component.ts'
import type { Navigate } from './router-shared.ts'

export { __eclipsaAction } from './action.ts'
export { __eclipsaLoader } from './loader.ts'
export { getRuntimeComponentId } from './runtime.ts'

const COMPONENT_META_KEY = Symbol.for('eclipsa.component-meta')
const EXTERNAL_COMPONENT_META_KEY = Symbol.for('eclipsa.external-component-meta')
const LAZY_META_KEY = Symbol.for('eclipsa.lazy-meta')
const NAVIGATE_META_KEY = Symbol.for('eclipsa.navigate-meta')
const SIGNAL_META_KEY = Symbol.for('eclipsa.signal-meta')
const ACTION_HOOK_META_KEY = Symbol.for('eclipsa.action-hook-meta')
const ACTION_HANDLE_META_KEY = Symbol.for('eclipsa.action-handle-meta')
const LOADER_HOOK_META_KEY = Symbol.for('eclipsa.loader-hook-meta')
const LOADER_HANDLE_META_KEY = Symbol.for('eclipsa.loader-handle-meta')
const WATCH_META_KEY = Symbol.for('eclipsa.watch-meta')
const ACTION_HOOK_REGISTRY_KEY = Symbol.for('eclipsa.action-hook-registry')
const LOADER_HOOK_REGISTRY_KEY = Symbol.for('eclipsa.loader-hook-registry')

export interface ComponentMeta {
  captures: () => unknown[]
  external?: ExternalComponentDescriptor
  optimizedRoot?: boolean
  projectionSlots?: Record<string, number>
  symbol: string
}

export interface ComponentOptions {
  external?: ExternalComponentDescriptor
  optimizedRoot?: boolean
}

export interface ExternalComponentDescriptor {
  kind: 'react' | 'vue'
  slots: string[]
}

export interface ExternalComponentMeta extends ExternalComponentDescriptor {
  hydrate(host: HTMLElement, props: Record<string, unknown>): unknown | Promise<unknown>
  renderToString(props: Record<string, unknown>): Promise<string> | string
  unmount(instance: unknown): void | Promise<void>
  update(
    instance: unknown,
    host: HTMLElement,
    props: Record<string, unknown>,
  ): unknown | Promise<unknown>
}

export interface LazyMeta {
  captures: () => unknown[]
  eventName?: string
  symbol: string
}

export interface WatchMeta {
  captures: () => unknown[]
  symbol: string
}

export interface SignalMeta<T = unknown> {
  get(): T
  id: string
  kind?: 'computed-signal' | 'signal'
  set(value: T): void
}

export interface NavigateMeta {
  readonly kind: 'navigate'
}

export interface ActionHandleMeta {
  readonly id: string
  readonly kind: 'action'
}

export interface ActionHookMeta {
  readonly id: string
  readonly kind: 'action-hook'
}

export interface LoaderHandleMeta {
  readonly id: string
  readonly kind: 'loader'
}

export interface LoaderHookMeta {
  readonly id: string
  readonly kind: 'loader-hook'
}

export interface EventDescriptor {
  captures: () => unknown[]
  eventName?: string
  symbol: string
}

export interface LazyReference<
  T extends (...args: any[]) => unknown = (...args: any[]) => unknown,
> extends Function {
  (...args: Parameters<T>): ReturnType<T>
  [LAZY_META_KEY]?: LazyMeta
}

export interface WatchReference<
  T extends (...args: any[]) => unknown = (...args: any[]) => unknown,
> extends Function {
  (...args: Parameters<T>): ReturnType<T>
  [WATCH_META_KEY]?: WatchMeta
}

export interface ExternalComponentReference<T = unknown> extends Function {
  (...args: any[]): T
  [EXTERNAL_COMPONENT_META_KEY]?: ExternalComponentMeta
}

export const __eclipsaComponent = <T>(
  component: Component<T>,
  symbol: string,
  captures: () => unknown[],
  projectionSlots?: Record<string, number>,
  options?: ComponentOptions,
): Component<T> => {
  Object.defineProperty(component, COMPONENT_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      symbol,
      captures,
      ...(options?.external ? { external: options.external } : {}),
      ...(options?.optimizedRoot ? { optimizedRoot: true } : {}),
      ...(projectionSlots ? { projectionSlots } : {}),
    } satisfies ComponentMeta,
    writable: true,
  })
  return component
}

export const __eclipsaLazy = <T extends (...args: any[]) => unknown>(
  symbol: string,
  fn: T,
  captures: () => unknown[],
): EURL<T> => {
  const wrapped = ((...args: Parameters<T>) => fn(...args)) as LazyReference<T>
  Object.defineProperty(wrapped, LAZY_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      symbol,
      captures,
    } satisfies LazyMeta,
    writable: true,
  })
  return wrapped as EURL<T>
}

export const __eclipsaWatch = <T extends (...args: any[]) => unknown>(
  symbol: string,
  fn: T,
  captures: () => unknown[],
): T => {
  const wrapped = ((...args: Parameters<T>) => fn(...args)) as WatchReference<T>
  Object.defineProperty(wrapped, WATCH_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      symbol,
      captures,
    } satisfies WatchMeta,
    writable: true,
  })
  return wrapped as T
}

export const __eclipsaEvent = (
  eventName: string,
  symbol: string,
  captures: () => unknown[],
): EventDescriptor => ({
  eventName,
  symbol,
  captures,
})

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

export const setExternalComponentMeta = <T extends Component<any>>(
  target: T,
  meta: ExternalComponentMeta,
): T => {
  Object.defineProperty(target, EXTERNAL_COMPONENT_META_KEY, {
    configurable: true,
    enumerable: false,
    value: meta,
    writable: true,
  })
  return target
}

export const getExternalComponentMeta = (value: unknown): ExternalComponentMeta | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[EXTERNAL_COMPONENT_META_KEY] as
      | ExternalComponentMeta
      | undefined) ?? null
  )
}

export const setNavigateMeta = <T extends Navigate>(target: T): T => {
  Object.defineProperty(target, NAVIGATE_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      kind: 'navigate',
    } satisfies NavigateMeta,
    writable: true,
  })
  return target
}

export const getNavigateMeta = (value: unknown): NavigateMeta | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[NAVIGATE_META_KEY] as
      | NavigateMeta
      | undefined) ?? null
  )
}

export const setActionHookMeta = <T extends Function>(target: T, id: string): T => {
  Object.defineProperty(target, ACTION_HOOK_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      id,
      kind: 'action-hook',
    } satisfies ActionHookMeta,
    writable: true,
  })
  return target
}

export const getActionHookMeta = (value: unknown): ActionHookMeta | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[ACTION_HOOK_META_KEY] as
      | ActionHookMeta
      | undefined) ?? null
  )
}

export const setActionHandleMeta = <T extends object>(target: T, id: string): T => {
  Object.defineProperty(target, ACTION_HANDLE_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      id,
      kind: 'action',
    } satisfies ActionHandleMeta,
    writable: true,
  })
  return target
}

export const getActionHandleMeta = (value: unknown): ActionHandleMeta | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  return (
    ((value as Record<PropertyKey, unknown>)[ACTION_HANDLE_META_KEY] as
      | ActionHandleMeta
      | undefined) ?? null
  )
}

export const setLoaderHookMeta = <T extends Function>(target: T, id: string): T => {
  Object.defineProperty(target, LOADER_HOOK_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      id,
      kind: 'loader-hook',
    } satisfies LoaderHookMeta,
    writable: true,
  })
  return target
}

export const getLoaderHookMeta = (value: unknown): LoaderHookMeta | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[LOADER_HOOK_META_KEY] as
      | LoaderHookMeta
      | undefined) ?? null
  )
}

export const setLoaderHandleMeta = <T extends object>(target: T, id: string): T => {
  Object.defineProperty(target, LOADER_HANDLE_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      id,
      kind: 'loader',
    } satisfies LoaderHandleMeta,
    writable: true,
  })
  return target
}

export const getLoaderHandleMeta = (value: unknown): LoaderHandleMeta | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  return (
    ((value as Record<PropertyKey, unknown>)[LOADER_HANDLE_META_KEY] as
      | LoaderHandleMeta
      | undefined) ?? null
  )
}

const getActionHookRegistry = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[ACTION_HOOK_REGISTRY_KEY]
  if (existing instanceof Map) {
    return existing as Map<string, Function>
  }
  const created = new Map<string, Function>()
  globalRecord[ACTION_HOOK_REGISTRY_KEY] = created
  return created
}

export const registerActionHook = <T extends Function>(id: string, hook: T): T => {
  getActionHookRegistry().set(id, hook)
  return hook
}

export const getRegisteredActionHook = <T extends Function>(id: string): T | null =>
  (getActionHookRegistry().get(id) as T | undefined) ?? null

export const getRegisteredActionHookIds = () => [...getActionHookRegistry().keys()]

const getLoaderHookRegistry = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[LOADER_HOOK_REGISTRY_KEY]
  if (existing instanceof Map) {
    return existing as Map<string, Function>
  }
  const created = new Map<string, Function>()
  globalRecord[LOADER_HOOK_REGISTRY_KEY] = created
  return created
}

export const registerLoaderHook = <T extends Function>(id: string, hook: T): T => {
  getLoaderHookRegistry().set(id, hook)
  return hook
}

export const getRegisteredLoaderHook = <T extends Function>(id: string): T | null =>
  (getLoaderHookRegistry().get(id) as T | undefined) ?? null

export const getRegisteredLoaderHookIds = () => [...getLoaderHookRegistry().keys()]

export const getWatchMeta = (value: unknown): WatchMeta | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[WATCH_META_KEY] as WatchMeta | undefined) ??
    null
  )
}

export const getEventMeta = (value: unknown): EventDescriptor | LazyMeta | null => {
  if (value && typeof value === 'object') {
    const descriptor = value as EventDescriptor
    if (typeof descriptor.symbol === 'string' && typeof descriptor.captures === 'function') {
      return descriptor
    }
  }
  return getLazyMeta(value)
}

export const setSignalMeta = <T>(target: { value: T }, meta: SignalMeta<T>): { value: T } => {
  Object.defineProperty(target, SIGNAL_META_KEY, {
    configurable: true,
    enumerable: false,
    value: meta,
    writable: true,
  })
  return target
}

export const getSignalMeta = <T>(value: unknown): SignalMeta<T> | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  return (
    ((value as Record<PropertyKey, unknown>)[SIGNAL_META_KEY] as SignalMeta<T> | undefined) ?? null
  )
}
