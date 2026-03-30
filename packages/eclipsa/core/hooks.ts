import type { Context } from 'hono'
import type { Env } from 'hono/types'
import type { AsyncLocalStorage } from 'node:async_hooks'
import {
  deserializeValue,
  serializeValue,
  type DeserializeValueOptions,
  type SerializedReference,
  type SerializedValue,
  type SerializeValueOptions,
} from './serialize.ts'

export type { DeserializeValueOptions, SerializeValueOptions, SerializedReference, SerializedValue }

export const APP_HOOKS_ELEMENT_ID = 'eclipsa-app-hooks'

export interface AppVariables {}

export interface PublicErrorShape {
  message: string
  [key: string]: unknown
}

export interface PublicError extends PublicErrorShape {}

export interface AppHooksManifest {
  client: string | null
}

export type RequestFetch = typeof fetch

export type BaseAppVariables = AppVariables & {
  fetch: RequestFetch
}

export interface AppEnv extends Env {
  Variables: BaseAppVariables
}

type EnvVariables<E extends Env> = E extends {
  Variables: infer Variables
}
  ? Variables
  : {}

export type WithAppEnv<E extends Env = Env> = Omit<E, 'Variables'> & {
  Variables: EnvVariables<E> & BaseAppVariables
}

export type AppContext<E extends Env = Env> = Context<WithAppEnv<E>>

export interface HandleResolveOptions {
  pathname?: string
}

export type HandleResolve<E extends Env = Env> = (
  context?: AppContext<E>,
  options?: HandleResolveOptions,
) => Promise<Response>

export type Handle<E extends Env = Env> = (
  context: AppContext<E>,
  resolve: HandleResolve<E>,
) => Response | Promise<Response>

export type HandleFetch<E extends Env = Env> = (
  context: AppContext<E>,
  request: Request,
  fetch: RequestFetch,
) => Response | Promise<Response>

export interface HandleErrorInput<E extends Env = Env> {
  context: AppContext<E>
  error: unknown
  event: 'action' | 'handle' | 'loader' | 'middleware' | 'page' | 'server' | 'transport'
}

export type HandleError<E extends Env = Env> = (
  input: HandleErrorInput<E>,
) => PublicError | void | Promise<PublicError | void>

export type Reroute = (input: { request: Request | null; url: URL }) => string | URL | void

export interface TransportHook {
  decode: (value: unknown) => unknown
  encode: (value: unknown) => unknown
}

export type Transport = Record<string, TransportHook>

export type ServerInit = () => void | Promise<void>

export interface ServerHooksModule<E extends Env = Env> {
  handle?: Handle<E>
  handleError?: HandleError<E>
  handleFetch?: HandleFetch<E>
  init?: ServerInit
}

export interface AppHooksModule {
  reroute?: Reroute
  transport?: Transport
}

export interface ResolvedHooks<E extends Env = Env> {
  app: AppHooksModule
  server: ServerHooksModule<E>
}

const PUBLIC_ERROR_KEY = Symbol.for('eclipsa.public-error')

type RequestContextStore = {
  context: AppContext<any>
  handleError?: HandleError<any>
  transport?: Transport
}

let requestContextStorage: AsyncLocalStorage<RequestContextStore> | null = null

let clientHooks: AppHooksModule = {}

const isBrowserRuntime = () => typeof window !== 'undefined' && typeof document !== 'undefined'

type AsyncLocalStorageConstructor = new <T>() => AsyncLocalStorage<T>

const getAsyncLocalStorageConstructor = (): AsyncLocalStorageConstructor | null => {
  if (isBrowserRuntime() || typeof process === 'undefined') {
    return null
  }
  const asyncHooks = (
    process as typeof process & {
      getBuiltinModule?: (id: string) => unknown
    }
  ).getBuiltinModule?.('node:async_hooks') as
    | {
        AsyncLocalStorage?: AsyncLocalStorageConstructor
      }
    | undefined
  return typeof asyncHooks?.AsyncLocalStorage === 'function' ? asyncHooks.AsyncLocalStorage : null
}

const getRequestContextStorage = () => {
  const AsyncLocalStorageCtor = getAsyncLocalStorageConstructor()
  if (!AsyncLocalStorageCtor) {
    return null
  }
  requestContextStorage ??= new AsyncLocalStorageCtor<RequestContextStore>()
  return requestContextStorage
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const normalizePublicError = (value: unknown): PublicError => {
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) {
      return value as PublicError
    }
  }
  if (value instanceof Error) {
    return {
      message: value.message || 'Internal Server Error',
      name: value.name,
    }
  }
  return {
    message: 'Internal Server Error',
  }
}

const getActiveTransport = () =>
  getRequestContextStorage()?.getStore()?.transport ?? clientHooks.transport

const serializeTransportReference = (
  value: unknown,
  transport: Transport,
): SerializedReference | null => {
  for (const [key, hook] of Object.entries(transport)) {
    const encoded = hook.encode(value)
    if (encoded === undefined) {
      continue
    }
    return {
      __eclipsa_type: 'ref',
      data: serializeValue(encoded),
      kind: 'transport',
      token: key,
    }
  }
  return null
}

const deserializeTransportReference = (reference: SerializedReference, transport: Transport) => {
  const hook = transport[reference.token]
  if (!hook) {
    throw new TypeError(`Unknown transport "${reference.token}".`)
  }
  return hook.decode(reference.data === undefined ? undefined : deserializeValue(reference.data))
}

export const serializePublicValue = (
  value: unknown,
  options?: SerializeValueOptions,
): SerializedValue =>
  serializeValue(value, {
    ...options,
    serializeReference(candidate) {
      const resolved = options?.serializeReference?.(candidate) ?? null
      if (resolved) {
        return resolved
      }
      const transport = getActiveTransport()
      return transport ? serializeTransportReference(candidate, transport) : null
    },
  })

export const deserializePublicValue = (
  value: SerializedValue,
  options?: DeserializeValueOptions,
): unknown =>
  deserializeValue(value, {
    ...options,
    deserializeReference(reference) {
      const resolved = options?.deserializeReference?.(reference)
      if (resolved !== undefined) {
        return resolved
      }
      const transport = getActiveTransport()
      if (reference.kind === 'transport' && transport) {
        return deserializeTransportReference(reference, transport)
      }
      if (reference.kind === 'transport') {
        throw new TypeError(`Unknown transport "${reference.token}".`)
      }
      if (!options?.deserializeReference) {
        throw new TypeError(
          `Cannot deserialize reference kind "${reference.kind}" in this context.`,
        )
      }
      return options.deserializeReference(reference)
    },
  })

export const withServerRequestContext = <T>(
  context: AppContext<any>,
  hooks: {
    handleError?: HandleError<any>
    transport?: Transport
  },
  fn: () => T,
) => {
  const storage = getRequestContextStorage()
  if (!storage) {
    return fn()
  }
  return storage.run(
    {
      context,
      handleError: hooks.handleError,
      transport: hooks.transport,
    },
    fn,
  )
}

export const getCurrentServerRequestContext = () =>
  getRequestContextStorage()?.getStore()?.context ?? null

export const transformCurrentPublicError = async (
  error: unknown,
  event: HandleErrorInput<any>['event'],
) => {
  const store = getRequestContextStorage()?.getStore()
  const publicError = store
    ? await runHandleError(
        {
          handleError: store.handleError,
        },
        {
          context: store.context,
          error,
          event,
        },
      )
    : toPublicError(error)
  return markPublicError(error, publicError)
}

export const createRequestFetch = (
  context: AppContext<any>,
  handleFetch?: HandleFetch<any>,
): RequestFetch => {
  const baseFetch: RequestFetch = ((input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    return fetch(request)
  }) as RequestFetch

  if (!handleFetch) {
    return baseFetch
  }

  return (async (input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    return handleFetch(context, request, baseFetch)
  }) as RequestFetch
}

export const attachRequestFetch = <E extends Env>(
  context: AppContext<E>,
  fetchImpl: RequestFetch,
) => {
  context.set('fetch' as never, fetchImpl as never)
}

export const resolveReroute = (
  reroute: Reroute | undefined,
  request: Request | null,
  pathname: string,
  baseUrl: string,
) => {
  if (!reroute) {
    return pathname
  }
  const url = new URL(pathname, baseUrl)
  const resolved = reroute({ request, url })
  if (!resolved) {
    return pathname
  }
  const nextUrl = resolved instanceof URL ? resolved : new URL(String(resolved), url)
  return nextUrl.pathname
}

export const toPublicError = (error: unknown): PublicError =>
  error &&
  typeof error === 'object' &&
  (error as Record<PropertyKey, unknown>)[PUBLIC_ERROR_KEY] &&
  isPlainObject((error as Record<PropertyKey, unknown>)[PUBLIC_ERROR_KEY])
    ? ((error as Record<PropertyKey, unknown>)[PUBLIC_ERROR_KEY] as PublicError)
    : normalizePublicError(error)

export const markPublicError = <T>(error: T, publicError: PublicError): T => {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) {
    return error
  }
  Object.defineProperty(error as Record<PropertyKey, unknown>, PUBLIC_ERROR_KEY, {
    configurable: true,
    enumerable: false,
    value: publicError,
    writable: true,
  })
  return error
}

export const runHandleError = async (
  hooks: {
    handleError?: HandleError<any>
  },
  input: HandleErrorInput<any>,
) => {
  const transformed = await hooks.handleError?.(input)
  return transformed ? normalizePublicError(transformed) : toPublicError(input.error)
}

export const registerClientHooks = (hooks: AppHooksModule) => {
  clientHooks = hooks
}

export const getClientHooks = () => clientHooks

export const resetClientHooks = () => {
  clientHooks = {}
}
