import type { Context } from 'hono'
import type { Env, MiddlewareHandler, Next } from 'hono/types'
import { deserializeValue, serializeValue, type SerializedValue } from './serialize.ts'
import {
  registerLoaderHook,
  setLoaderHandleMeta,
  setLoaderHookMeta,
} from './internal.ts'
import {
  createDetachedRuntimeSignal,
  getRuntimeContainer,
  type RuntimeContainer,
} from './runtime.ts'
import { useSignal } from './signal.ts'

const LOADER_REGISTRY_KEY = Symbol.for('eclipsa.loader-registry')
const LOADER_CONTENT_TYPE = 'application/eclipsa-loader+json'

type MiddlewareEnv<T> = T extends {
  readonly __eclipsa_loader_env__?: infer MiddlewareEnv
}
  ? Exclude<MiddlewareEnv, undefined> extends Env
    ? Exclude<MiddlewareEnv, undefined>
    : {}
  : T extends MiddlewareHandler<infer MiddlewareEnv, any, any>
    ? MiddlewareEnv
    : {}

type LoaderEnv<Middlewares extends readonly LoaderMiddleware<any>[]> =
  Middlewares extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly LoaderMiddleware<any>[]
      ? MiddlewareEnv<Head> & LoaderEnv<Tail>
      : MiddlewareEnv<Head>
    : {}

export interface LoaderHandle<Output> {
  readonly data: Output | undefined
  readonly error: unknown
  readonly isLoading: boolean
  load: () => Promise<Output>
}

export interface LoaderMiddleware<E extends Env = Env> extends MiddlewareHandler<E> {
  readonly __eclipsa_loader_env__?: E
}

export type LoaderHandler<E extends Env = Env, Output = unknown> = (
  c: Context<E>,
) => Output | Promise<Output>

type LoaderUse<Middlewares extends readonly LoaderMiddleware<any>[], Output> = () => LoaderHandle<
  Output
>

export interface LoaderFactory {
  <Output>(handler: LoaderHandler<{}, Output>): LoaderUse<[], Output>
  <M1 extends LoaderMiddleware<any>, Output>(
    middleware1: M1,
    handler: LoaderHandler<LoaderEnv<[M1]>, Output>,
  ): LoaderUse<[M1], Output>
  <M1 extends LoaderMiddleware<any>, M2 extends LoaderMiddleware<any>, Output>(
    middleware1: M1,
    middleware2: M2,
    handler: LoaderHandler<LoaderEnv<[M1, M2]>, Output>,
  ): LoaderUse<[M1, M2], Output>
  <M1 extends LoaderMiddleware<any>, M2 extends LoaderMiddleware<any>, M3 extends LoaderMiddleware<any>, Output>(
    middleware1: M1,
    middleware2: M2,
    middleware3: M3,
    handler: LoaderHandler<LoaderEnv<[M1, M2, M3]>, Output>,
  ): LoaderUse<[M1, M2, M3], Output>
  <
    M1 extends LoaderMiddleware<any>,
    M2 extends LoaderMiddleware<any>,
    M3 extends LoaderMiddleware<any>,
    M4 extends LoaderMiddleware<any>,
    Output,
  >(
    middleware1: M1,
    middleware2: M2,
    middleware3: M3,
    middleware4: M4,
    handler: LoaderHandler<LoaderEnv<[M1, M2, M3, M4]>, Output>,
  ): LoaderUse<[M1, M2, M3, M4], Output>
  <
    M1 extends LoaderMiddleware<any>,
    M2 extends LoaderMiddleware<any>,
    M3 extends LoaderMiddleware<any>,
    M4 extends LoaderMiddleware<any>,
    M5 extends LoaderMiddleware<any>,
    Output,
  >(
    middleware1: M1,
    middleware2: M2,
    middleware3: M3,
    middleware4: M4,
    middleware5: M5,
    handler: LoaderHandler<LoaderEnv<[M1, M2, M3, M4, M5]>, Output>,
  ): LoaderUse<[M1, M2, M3, M4, M5], Output>
}

interface RegisteredLoader {
  handler: LoaderHandler<any, unknown>
  id: string
  middlewares: LoaderMiddleware<any>[]
}

interface LoaderJsonSuccess {
  ok: true
  value: SerializedValue
}

interface LoaderJsonFailure {
  error: SerializedValue
  ok: false
}

const getLoaderRegistry = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[LOADER_REGISTRY_KEY]
  if (existing instanceof Map) {
    return existing as Map<string, RegisteredLoader>
  }
  const created = new Map<string, RegisteredLoader>()
  globalRecord[LOADER_REGISTRY_KEY] = created
  return created
}

const composeMiddlewares = async (
  c: Context<any>,
  middlewares: LoaderMiddleware<any>[],
  handler: LoaderHandler<any, unknown>,
): Promise<Response | unknown> => {
  let index = -1
  const dispatch = async (nextIndex: number): Promise<Response | unknown> => {
    if (nextIndex <= index) {
      throw new Error('Loader middleware called next() multiple times.')
    }
    index = nextIndex
    const middleware = middlewares[nextIndex]
    if (!middleware) {
      return handler(c)
    }
    let nextResult: Response | unknown = undefined
    const result = await middleware(c, (async () => {
      nextResult = await dispatch(nextIndex + 1)
    }) as Next)
    if (result !== undefined) {
      return result
    }
    return nextResult
  }
  return dispatch(0)
}

const toSerializedLoaderError = (error: unknown): SerializedValue => {
  if (error instanceof Error) {
    return serializeValue({
      message: error.message,
      name: error.name,
    })
  }
  try {
    return serializeValue(error)
  } catch {
    return serializeValue({
      message: 'Loader failed.',
    })
  }
}

const normalizeLoaderValue = (value: unknown) => {
  if (value instanceof Response) {
    throw new TypeError('loader$() handlers and middlewares must resolve to data, not Response.')
  }
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) {
    throw new TypeError('loader$() does not support ReadableStream results.')
  }
  if (value && typeof value === 'object' && Symbol.asyncIterator in value) {
    throw new TypeError('loader$() does not support async iterable results.')
  }
  return value
}

const updateLoaderSnapshot = (
  container: RuntimeContainer | null,
  id: string,
  snapshot: {
    data: unknown
    error: unknown
    loaded: boolean
  },
) => {
  container?.loaderStates.set(id, snapshot)
}

const createHandleSignal = <T>(
  container: RuntimeContainer | null,
  id: string,
  key: string,
  initialValue: T,
) => {
  try {
    return {
      detached: false,
      signal: useSignal(initialValue),
    }
  } catch {
    if (!container) {
      throw new Error('Loader handles require an active runtime container.')
    }
    return {
      detached: true,
      signal: createDetachedRuntimeSignal(container, `$loader:${id}:${key}`, initialValue),
    }
  }
}

const parseJsonLoaderResponse = async (response: Response) => {
  const body = (await response.json()) as LoaderJsonFailure | LoaderJsonSuccess
  if (!body || typeof body !== 'object' || typeof body.ok !== 'boolean') {
    throw new TypeError('Malformed loader response.')
  }
  if (!body.ok) {
    throw deserializeValue(body.error)
  }
  return deserializeValue(body.value)
}

const invokeLoader = async (id: string) => {
  const response = await fetch(`/__eclipsa/loader/${encodeURIComponent(id)}`, {
    headers: {
      accept: LOADER_CONTENT_TYPE,
    },
    method: 'GET',
  })
  return parseJsonLoaderResponse(response)
}

const resolveLoader = async (id: string, c: Context<any>) => {
  const loader = getLoaderRegistry().get(id)
  if (!loader) {
    throw new Error(`Unknown loader ${id}.`)
  }
  return normalizeLoaderValue(await composeMiddlewares(c, loader.middlewares, loader.handler))
}

export const loader$: LoaderFactory = (() => {
  throw new Error('loader$() must be compiled by the Eclipsa analyzer before it can run.')
}) as LoaderFactory

export function registerLoader<Output>(
  id: string,
  middlewares: readonly [],
  handler: LoaderHandler<{}, Output>,
): void
export function registerLoader<M1 extends LoaderMiddleware<any>, Output>(
  id: string,
  middlewares: readonly [M1],
  handler: LoaderHandler<LoaderEnv<[M1]>, Output>,
): void
export function registerLoader<
  M1 extends LoaderMiddleware<any>,
  M2 extends LoaderMiddleware<any>,
  Output,
>(
  id: string,
  middlewares: readonly [M1, M2],
  handler: LoaderHandler<LoaderEnv<[M1, M2]>, Output>,
): void
export function registerLoader<
  M1 extends LoaderMiddleware<any>,
  M2 extends LoaderMiddleware<any>,
  M3 extends LoaderMiddleware<any>,
  Output,
>(
  id: string,
  middlewares: readonly [M1, M2, M3],
  handler: LoaderHandler<LoaderEnv<[M1, M2, M3]>, Output>,
): void
export function registerLoader<
  M1 extends LoaderMiddleware<any>,
  M2 extends LoaderMiddleware<any>,
  M3 extends LoaderMiddleware<any>,
  M4 extends LoaderMiddleware<any>,
  Output,
>(
  id: string,
  middlewares: readonly [M1, M2, M3, M4],
  handler: LoaderHandler<LoaderEnv<[M1, M2, M3, M4]>, Output>,
): void
export function registerLoader<
  M1 extends LoaderMiddleware<any>,
  M2 extends LoaderMiddleware<any>,
  M3 extends LoaderMiddleware<any>,
  M4 extends LoaderMiddleware<any>,
  M5 extends LoaderMiddleware<any>,
  Output,
>(
  id: string,
  middlewares: readonly [M1, M2, M3, M4, M5],
  handler: LoaderHandler<LoaderEnv<[M1, M2, M3, M4, M5]>, Output>,
): void
export function registerLoader(
  id: string,
  middlewares: readonly LoaderMiddleware<any>[],
  handler: LoaderHandler<any, unknown>,
) {
  getLoaderRegistry().set(id, {
    handler,
    id,
    middlewares: [...middlewares] as LoaderMiddleware<any>[],
  })
}

export const hasLoader = (id: string) => getLoaderRegistry().has(id)

export const executeLoader = async (id: string, c: Context<any>) => {
  try {
    return new Response(
      JSON.stringify({
        ok: true,
        value: serializeValue(await resolveLoader(id, c)),
      } satisfies LoaderJsonSuccess),
      {
        headers: {
          'content-type': LOADER_CONTENT_TYPE,
        },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: toSerializedLoaderError(error),
        ok: false,
      } satisfies LoaderJsonFailure),
      {
        headers: {
          'content-type': LOADER_CONTENT_TYPE,
        },
        status: error instanceof Error && error.message.startsWith('Unknown loader ') ? 404 : 500,
      },
    )
  }
}

export const primeLoaderState = async (container: RuntimeContainer, id: string, c: Context<any>) => {
  const value = await resolveLoader(id, c)
  updateLoaderSnapshot(container, id, {
    data: value,
    error: undefined,
    loaded: true,
  })
  return value
}

export const __eclipsaLoader = <const Middlewares extends readonly LoaderMiddleware<any>[], Output>(
  id: string,
  middlewares: readonly [...Middlewares],
  handler: LoaderHandler<LoaderEnv<Middlewares>, Output>,
) => {
  if (typeof window === 'undefined') {
    getLoaderRegistry().set(id, {
      handler: handler as LoaderHandler<any, unknown>,
      id,
      middlewares: [...middlewares] as LoaderMiddleware<any>[],
    })
  }

  const useLoaderHandle = registerLoaderHook(
    id,
    setLoaderHookMeta(() => {
      const container = getRuntimeContainer()
      const existing = container?.loaders.get(id)
      if (existing) {
        return existing as LoaderHandle<Output>
      }

      const initialState = container?.loaderStates.get(id)
      if (typeof window === 'undefined' && !initialState?.loaded) {
        throw new Error(`loader$("${id}") was used during SSR before it was preloaded.`)
      }

      const loadingState = createHandleSignal(container, id, 'loading', false)
      const dataState = createHandleSignal<Output | undefined>(
        container,
        id,
        'data',
        initialState?.loaded ? (initialState.data as Output) : undefined,
      )
      const errorState = createHandleSignal(container, id, 'error', initialState?.error)
      const isDetached = loadingState.detached || dataState.detached || errorState.detached
      const isLoading = loadingState.signal
      const data = dataState.signal
      const error = errorState.signal
      let loaded = initialState?.loaded ?? false
      let inFlight: Promise<Output> | null = null
      let autoRequested = false

      const syncSnapshot = () => {
        updateLoaderSnapshot(container ?? null, id, {
          data: data.value,
          error: error.value,
          loaded,
        })
      }

      const load = async () => {
        if (inFlight) {
          return inFlight
        }
        isLoading.value = true
        error.value = undefined
        syncSnapshot()
        inFlight = (async () => {
          try {
            const value = (await invokeLoader(id)) as Output
            data.value = value
            loaded = true
            return value
          } catch (caught) {
            error.value = caught
            throw caught
          } finally {
            isLoading.value = false
            syncSnapshot()
            inFlight = null
          }
        })()
        return inFlight
      }

      const loaderHandle = setLoaderHandleMeta(
        {
          get data() {
            return data.value
          },
          get error() {
            return error.value
          },
          get isLoading() {
            return isLoading.value
          },
          load,
        } satisfies LoaderHandle<Output>,
        id,
      )
      container?.loaders.set(id, loaderHandle)
      syncSnapshot()

      if (typeof window !== 'undefined' && !isDetached && !loaded && !autoRequested) {
        autoRequested = true
        queueMicrotask(() => {
          void load().catch(() => {})
        })
      }

      return loaderHandle
    }, id),
  ) as () => LoaderHandle<Output>

  return useLoaderHandle
}
