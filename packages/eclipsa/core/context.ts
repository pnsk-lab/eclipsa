import type { JSX } from '../jsx/types.ts'
import type { Component } from './component.ts'
import {
  getRuntimeContextValue,
  hasActiveRuntimeComponent,
  type RuntimeContextToken,
} from './runtime.ts'

const CONTEXT_PROVIDER_META_KEY = Symbol.for('eclipsa.context-provider-meta')
const CONTEXT_TOKEN_KEY = Symbol.for('eclipsa.context-token')

interface ContextProviderMeta<T = unknown> {
  token: RuntimeContextToken<T>
}

interface RuntimeContext<T> extends Context<T> {
  [CONTEXT_TOKEN_KEY]: RuntimeContextToken<T>
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

const getContextToken = <T>(context: Context<T>): RuntimeContextToken<T> => {
  const token = (context as RuntimeContext<T>)[CONTEXT_TOKEN_KEY]
  if (!token) {
    throw new TypeError('useContext() expects a context created by createContext().')
  }
  return token
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

export const createContext = <T>(): Context<T> => {
  const token = Symbol('eclipsa.context') as RuntimeContextToken<T>
  const Provider = ((props: ContextProviderProps<T>) => props.children) as ContextProviderComponent<T>

  Object.defineProperty(Provider, CONTEXT_PROVIDER_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
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
    value: token,
    writable: false,
  })

  return context
}

export const useContext = <T>(context: Context<T>): T => {
  if (!hasActiveRuntimeComponent()) {
    throw new Error('useContext() can only be used while rendering a component.')
  }

  const resolved = getRuntimeContextValue(getContextToken(context))
  if (!resolved.found) {
    throw new Error('useContext() could not find a matching context provider.')
  }

  return resolved.value as T
}
