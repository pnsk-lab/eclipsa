import type { NativeChild, NativeComponent } from './component.ts'

const CONTEXT_META_KEY = Symbol.for('eclipsa.native.context-meta')
const CONTEXT_PROVIDER_META_KEY = Symbol.for('eclipsa.native.context-provider-meta')
const CONTEXT_REGISTRY_KEY = Symbol.for('eclipsa.native.context-registry')
const CONTEXT_NEXT_ID_KEY = Symbol.for('eclipsa.native.context-next-id')

type ContextToken<T> = symbol & {
  __context?: T
}

interface NativeContextState<T> {
  defaultValue: T | undefined
  hasDefault: boolean
  id: string
  token: ContextToken<T>
}

export interface ContextProviderProps<T> {
  children?: NativeChild
  value: T
}

export interface NativeContext<T> {
  Provider: NativeComponent<ContextProviderProps<T>>
}

export interface SerializedContextDescriptor<T = unknown> {
  defaultValue: T | undefined
  hasDefault: boolean
  id: string
}

export interface ContextProviderMeta<T = unknown> {
  id: string
  token: ContextToken<T>
}

interface RenderContextFrame {
  parent: RenderContextFrame | null
  values: Map<ContextToken<unknown>, unknown>
}

const renderContextStack: RenderContextFrame[] = []

const getContextRegistry = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  let registry = globalRecord[CONTEXT_REGISTRY_KEY] as
    | Map<string, NativeContext<unknown>>
    | undefined
  if (!registry) {
    registry = new Map()
    globalRecord[CONTEXT_REGISTRY_KEY] = registry
  }
  return registry
}

const allocateContextId = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const nextId = ((globalRecord[CONTEXT_NEXT_ID_KEY] as number | undefined) ?? 0) + 1
  globalRecord[CONTEXT_NEXT_ID_KEY] = nextId
  return `native-context-${nextId}`
}

const getContextStateMaybe = <T>(value: unknown): NativeContextState<T> | null => {
  if (!value || (typeof value !== 'function' && typeof value !== 'object')) {
    return null
  }
  return (
    ((value as Record<PropertyKey, unknown>)[CONTEXT_META_KEY] as
      | NativeContextState<T>
      | undefined) ?? null
  )
}

const getContextState = <T>(context: NativeContext<T>) => {
  const state = getContextStateMaybe<T>(context)
  if (!state) {
    throw new TypeError('Expected a context created by createContext().')
  }
  return state
}

const registerContext = <T>(id: string, context: NativeContext<T>) => {
  getContextRegistry().set(id, context as NativeContext<unknown>)
}

const createContextWithId = <T>(
  id: string,
  hasDefault: boolean,
  defaultValue: T | undefined,
): NativeContext<T> => {
  const token = Symbol.for(`eclipsa.native.context:${id}`) as ContextToken<T>
  const Provider = ((props: ContextProviderProps<T>) => props.children) as NativeComponent<
    ContextProviderProps<T>
  >

  Object.defineProperty(Provider, CONTEXT_PROVIDER_META_KEY, {
    configurable: false,
    enumerable: false,
    value: {
      id,
      token,
    } satisfies ContextProviderMeta<T>,
    writable: false,
  })

  const context = {
    Provider,
  } as NativeContext<T>

  Object.defineProperty(context, CONTEXT_META_KEY, {
    configurable: false,
    enumerable: false,
    value: {
      defaultValue,
      hasDefault,
      id,
      token,
    } satisfies NativeContextState<T>,
    writable: false,
  })

  registerContext(id, context)
  return context
}

export const createContext = <T>(...args: [defaultValue?: T]) =>
  createContextWithId(allocateContextId(), args.length > 0, args[0])

export const describeContext = <T>(context: NativeContext<T>): SerializedContextDescriptor<T> => {
  const state = getContextState(context)
  return {
    defaultValue: state.defaultValue,
    hasDefault: state.hasDefault,
    id: state.id,
  }
}

export const materializeContext = <T>(descriptor: SerializedContextDescriptor<T>) => {
  const existing = getContextRegistry().get(descriptor.id) as NativeContext<T> | undefined
  if (existing) {
    return existing
  }
  return createContextWithId(descriptor.id, descriptor.hasDefault, descriptor.defaultValue)
}

export const getContextProviderMeta = (value: unknown): ContextProviderMeta | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[CONTEXT_PROVIDER_META_KEY] as
      | ContextProviderMeta
      | undefined) ?? null
  )
}

export const getCurrentRenderContext = () =>
  renderContextStack.length > 0 ? renderContextStack[renderContextStack.length - 1]! : null

export const enterRenderContext = <T>(frame: RenderContextFrame | null, fn: () => T) => {
  if (!frame) {
    return fn()
  }
  renderContextStack.push(frame)
  try {
    return fn()
  } finally {
    renderContextStack.pop()
  }
}

export const createChildRenderContext = <T>(
  token: ContextToken<T>,
  value: T,
  parent = getCurrentRenderContext(),
): RenderContextFrame => ({
  parent,
  values: new Map<ContextToken<unknown>, unknown>([[token as ContextToken<unknown>, value]]),
})

export const useContext = <T>(context: NativeContext<T>): T => {
  const state = getContextState(context)
  let frame = getCurrentRenderContext()
  while (frame) {
    if (frame.values.has(state.token as ContextToken<unknown>)) {
      return frame.values.get(state.token as ContextToken<unknown>) as T
    }
    frame = frame.parent
  }
  if (state.hasDefault) {
    return state.defaultValue as T
  }
  throw new Error('useContext() could not find a matching provider in the native render tree.')
}
