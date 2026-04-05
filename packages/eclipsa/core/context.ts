import type { JSX } from '../jsx/types.ts'
import type { Component } from './component.ts'
import {
  getRuntimeContextValue,
  hasActiveRuntimeComponent,
  type RuntimeContextToken,
} from './runtime.ts'

const CONTEXT_PROVIDER_META_KEY = Symbol.for('eclipsa.context-provider-meta')
const CONTEXT_TOKEN_KEY = Symbol.for('eclipsa.context-token')
const CONTEXT_REGISTRY_KEY = Symbol.for('eclipsa.context-registry')
const CONTEXT_NEXT_ID_KEY = Symbol.for('eclipsa.context-next-id')

interface ContextProviderMeta<T = unknown> {
  id: string
  token: RuntimeContextToken<T>
}

interface RuntimeContextState<T> {
  defaultValue: T | undefined
  hasDefault: boolean
  id: string
  token: RuntimeContextToken<T>
}

interface RuntimeContext<T> extends Context<T> {
  [CONTEXT_TOKEN_KEY]: RuntimeContextState<T>
}

interface ContextProviderComponent<T> extends Component<ContextProviderProps<T>> {
  [CONTEXT_PROVIDER_META_KEY]?: ContextProviderMeta<T>
}

export interface ContextProviderProps<T> {
  children?: JSX.Element | JSX.Element[]
  value: T
}

export interface Context<T> {
  Provider: Component<ContextProviderProps<T>>
}

interface SerializedContextDescriptor<T = unknown> {
  defaultValue: T | undefined
  hasDefault: boolean
  id: string
}

const getContextRegistry = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  let registry = globalRecord[CONTEXT_REGISTRY_KEY] as Map<string, Context<unknown>> | undefined
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
  return `ctx${nextId}`
}

const getContextStateMaybe = <T>(context: unknown): RuntimeContextState<T> | null =>
  context &&
  (typeof context === 'object' || typeof context === 'function') &&
  CONTEXT_TOKEN_KEY in (context as Record<PropertyKey, unknown>)
    ? ((context as RuntimeContext<T>)[CONTEXT_TOKEN_KEY] ?? null)
    : null

const getContextState = <T>(context: Context<T>): RuntimeContextState<T> => {
  const state = getContextStateMaybe<T>(context)
  if (!state) {
    throw new TypeError('useContext() expects a context created by createContext().')
  }
  return state
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

const registerContext = <T>(id: string, context: Context<T>) => {
  getContextRegistry().set(id, context as Context<unknown>)
}

const createContextWithId = <T>(
  id: string,
  hasDefault: boolean,
  defaultValue: T | undefined,
): Context<T> => {
  const token = Symbol.for(`eclipsa.context:${id}`) as RuntimeContextToken<T>
  const Provider = ((props: ContextProviderProps<T>) =>
    props.children) as ContextProviderComponent<T>

  Object.defineProperty(Provider, CONTEXT_PROVIDER_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      id,
      token,
    } satisfies ContextProviderMeta<T>,
    writable: false,
  })

  const context = {
    Provider,
  } as RuntimeContext<T>

  Object.defineProperty(context, CONTEXT_TOKEN_KEY, {
    configurable: false,
    enumerable: false,
    value: {
      defaultValue,
      hasDefault,
      id,
      token,
    } satisfies RuntimeContextState<T>,
    writable: false,
  })

  registerContext(id, context)
  return context
}

export const createContext = <T>(...args: [defaultValue?: T]): Context<T> =>
  createContextWithId(allocateContextId(), args.length > 0, args[0])

export const getRuntimeContextReference = (value: unknown) => {
  const state = getContextStateMaybe(value)
  if (state) {
    return {
      defaultValue: state.defaultValue,
      hasDefault: state.hasDefault,
      id: state.id,
      kind: 'context' as const,
    }
  }

  const providerMeta = getContextProviderMeta(value)
  if (!providerMeta) {
    return null
  }

  const context = getContextRegistry().get(providerMeta.id)
  const contextState = context ? getContextState(context) : null
  return {
    defaultValue: contextState?.defaultValue,
    hasDefault: contextState?.hasDefault ?? false,
    id: providerMeta.id,
    kind: 'context-provider' as const,
  }
}

const materializeContextWithDescriptor = <T>({
  defaultValue,
  hasDefault,
  id,
}: SerializedContextDescriptor<T>): Context<T> => {
  const existing = getContextRegistry().get(id) as Context<T> | undefined
  if (existing) {
    return existing
  }
  return createContextWithId(id, hasDefault, defaultValue)
}

export const materializeRuntimeContext = <T>(descriptor: SerializedContextDescriptor<T>) =>
  materializeContextWithDescriptor(descriptor)

export const materializeRuntimeContextProvider = <T>(descriptor: SerializedContextDescriptor<T>) =>
  materializeContextWithDescriptor(descriptor).Provider

export const useContext = <T>(context: Context<T>): T => {
  if (!hasActiveRuntimeComponent()) {
    throw new Error('useContext() can only be used while rendering a component.')
  }

  const state = getContextState(context)
  const resolved = getRuntimeContextValue(state.token)
  if (!resolved.found) {
    if (state.hasDefault) {
      return state.defaultValue as T
    }
    throw new Error('useContext() could not find a matching context provider.')
  }

  return resolved.value as T
}
