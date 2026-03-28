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

interface RuntimeContextState<T> {
  defaultValue: T | undefined
  hasDefault: boolean
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

const getContextState = <T>(context: Context<T>): RuntimeContextState<T> => {
  const state = (context as RuntimeContext<T>)[CONTEXT_TOKEN_KEY]
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

export const createContext = <T>(...args: [defaultValue?: T]): Context<T> => {
  const hasDefault = args.length > 0
  const defaultValue = args[0]
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
    value: {
      defaultValue,
      hasDefault,
      token,
    } satisfies RuntimeContextState<T>,
    writable: false,
  })

  return context
}

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
