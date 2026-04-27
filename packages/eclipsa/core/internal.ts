import type { Component, EURL } from './component.ts'
import type { Navigate } from './router-shared.ts'

export { __eclipsaAction } from './action.ts'
export { __eclipsaRealtime } from './realtime.ts'
export { __eclipsaLoader } from './loader.ts'
export {
  createDetachedRuntimeComponent,
  createDetachedRuntimeContainer,
  disposeDetachedRuntimeComponent,
  getRuntimeComponentId,
  runDetachedRuntimeComponent,
} from './runtime.ts'
export type { ComponentState, RuntimeContainer } from './runtime/types.ts'
export { createRouteElement, isRouteSlot, resolveRouteSlot } from './runtime/routes.ts'

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
  captures: (() => unknown[]) | unknown[]
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
  captures: (() => unknown[]) | unknown[]
  eventName?: string
  symbol: string
}

export interface WatchMeta {
  captures: (() => unknown[]) | unknown[]
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

export interface CapturedEventDescriptor {
  captures: (() => unknown[]) | unknown[]
  eventName?: string
  symbol: string
}

export interface PackedEventDescriptor {
  capture0?: unknown
  capture1?: unknown
  capture2?: unknown
  capture3?: unknown
  captureCount: 0 | 1 | 2 | 3 | 4
  eventName?: string
  symbol: string
}

export type EventDescriptor = CapturedEventDescriptor | PackedEventDescriptor

const defineCallableMeta = <T extends Function, M>(target: T, key: symbol, value: M): T => {
  const define = (fn: T) => {
    Object.defineProperty(fn, key, {
      configurable: true,
      enumerable: false,
      value,
      writable: true,
    })
    return fn
  }

  if (Object.isExtensible(target)) {
    return define(target)
  }

  const wrapped = ((...args: unknown[]) => target(...args)) as unknown as T
  return define(wrapped)
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
  captures: (() => unknown[]) | unknown[],
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
  captures: (() => unknown[]) | unknown[],
): EURL<T> => {
  return defineCallableMeta(fn as LazyReference<T>, LAZY_META_KEY, {
    symbol,
    captures,
  } satisfies LazyMeta) as EURL<T>
}

export const __eclipsaWatch = <T extends (...args: any[]) => unknown>(
  symbol: string,
  fn: T,
  captures: (() => unknown[]) | unknown[],
): T => {
  return defineCallableMeta(fn as WatchReference<T>, WATCH_META_KEY, {
    symbol,
    captures,
  } satisfies WatchMeta) as T
}

const createPackedEventDescriptor = (
  eventName: string,
  symbol: string,
  captureCount: PackedEventDescriptor['captureCount'],
  capture0?: unknown,
  capture1?: unknown,
  capture2?: unknown,
  capture3?: unknown,
): PackedEventDescriptor => ({
  capture0,
  capture1,
  capture2,
  capture3,
  captureCount,
  eventName,
  symbol,
})

type EventFactory = ((
  eventName: string,
  symbol: string,
  captures: (() => unknown[]) | unknown[],
) => EventDescriptor) & {
  __0: (eventName: string, symbol: string) => EventDescriptor
  __1: (eventName: string, symbol: string, capture0: unknown) => EventDescriptor
  __2: (eventName: string, symbol: string, capture0: unknown, capture1: unknown) => EventDescriptor
  __3: (
    eventName: string,
    symbol: string,
    capture0: unknown,
    capture1: unknown,
    capture2: unknown,
  ) => EventDescriptor
  __4: (
    eventName: string,
    symbol: string,
    capture0: unknown,
    capture1: unknown,
    capture2: unknown,
    capture3: unknown,
  ) => EventDescriptor
}

export const __eclipsaEvent = Object.assign(
  (
    eventName: string,
    symbol: string,
    captures: (() => unknown[]) | unknown[],
  ): EventDescriptor => ({
    eventName,
    symbol,
    captures,
  }),
  {
    __0: (eventName: string, symbol: string) => createPackedEventDescriptor(eventName, symbol, 0),
    __1: (eventName: string, symbol: string, capture0: unknown) =>
      createPackedEventDescriptor(eventName, symbol, 1, capture0),
    __2: (eventName: string, symbol: string, capture0: unknown, capture1: unknown) =>
      createPackedEventDescriptor(eventName, symbol, 2, capture0, capture1),
    __3: (
      eventName: string,
      symbol: string,
      capture0: unknown,
      capture1: unknown,
      capture2: unknown,
    ) => createPackedEventDescriptor(eventName, symbol, 3, capture0, capture1, capture2),
    __4: (
      eventName: string,
      symbol: string,
      capture0: unknown,
      capture1: unknown,
      capture2: unknown,
      capture3: unknown,
    ) => createPackedEventDescriptor(eventName, symbol, 4, capture0, capture1, capture2, capture3),
  },
) satisfies EventFactory

export const resolveCaptureValues = (captures: (() => unknown[]) | unknown[]) =>
  typeof captures === 'function' ? captures() : captures

export const resolveEventDescriptorCaptures = (descriptor: EventDescriptor): unknown[] => {
  if ('captures' in descriptor) {
    return resolveCaptureValues(descriptor.captures)
  }
  switch (descriptor.captureCount) {
    case 0:
      return []
    case 1:
      return [descriptor.capture0]
    case 2:
      return [descriptor.capture0, descriptor.capture1]
    case 3:
      return [descriptor.capture0, descriptor.capture1, descriptor.capture2]
    case 4:
      return [descriptor.capture0, descriptor.capture1, descriptor.capture2, descriptor.capture3]
  }
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
    if (typeof descriptor.symbol === 'string' && 'captures' in descriptor) {
      if (typeof descriptor.captures === 'function' || Array.isArray(descriptor.captures)) {
        return descriptor
      }
    }
    if (
      typeof descriptor.symbol === 'string' &&
      'captureCount' in descriptor &&
      descriptor.captureCount >= 0 &&
      descriptor.captureCount <= 4
    ) {
      return descriptor
    }
  }
  return getLazyMeta(value)
}

export const setSignalMeta = <T>(target: { value: T }, meta: SignalMeta<T>): { value: T } => {
  ;(target as Record<PropertyKey, unknown>)[SIGNAL_META_KEY] = meta
  return target
}

export const setLazySignalMeta = <T>(
  target: { value: T },
  createMeta: () => SignalMeta<T>,
): { value: T } => {
  Object.defineProperty(target, SIGNAL_META_KEY, {
    configurable: true,
    enumerable: false,
    get() {
      const meta = createMeta()
      Object.defineProperty(target, SIGNAL_META_KEY, {
        configurable: true,
        enumerable: false,
        value: meta,
        writable: true,
      })
      return meta
    },
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
