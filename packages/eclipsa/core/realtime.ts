import type { Env, MiddlewareHandler, Next } from 'hono/types'
import {
  type AppContext,
  deserializePublicValue,
  serializePublicValue,
  type SerializedValue,
  transformCurrentPublicError,
  type WithAppEnv,
} from './hooks.ts'
import { createDetachedRuntimeSignal, getRuntimeContainer } from './runtime.ts'
import { onCleanup, onMount } from './signal.ts'

const REALTIME_REGISTRY_KEY = Symbol.for('eclipsa.realtime-registry')
export const REALTIME_FRAME_CONTENT_TYPE = 'application/eclipsa-realtime+json'

declare const REALTIME_INPUT_TYPE: unique symbol
declare const REALTIME_CLIENT_MESSAGE_TYPE: unique symbol
declare const REALTIME_SERVER_MESSAGE_TYPE: unique symbol

type MiddlewareEnv<T> = T extends {
  readonly __eclipsa_realtime_env__?: infer MiddlewareEnv
}
  ? Exclude<MiddlewareEnv, undefined> extends Env
    ? WithAppEnv<Exclude<MiddlewareEnv, undefined>>
    : {}
  : T extends MiddlewareHandler<infer MiddlewareEnv, any, any>
    ? WithAppEnv<MiddlewareEnv>
    : WithAppEnv<Env>

type RealtimeEnv<Middlewares extends readonly RealtimeMiddleware<any>[]> =
  Middlewares extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly RealtimeMiddleware<any>[]
      ? MiddlewareEnv<Head> & RealtimeEnv<Tail>
      : MiddlewareEnv<Head>
    : WithAppEnv<Env>

type HandlerInput<T> = T extends (connection: RealtimeConnection<infer Input, any, any, any>) => any
  ? Input
  : unknown

type HandlerClientMessage<T> = T extends (
  connection: RealtimeConnection<any, infer Message, any, any>,
) => any
  ? Message
  : unknown

type HandlerServerMessage<T> = T extends (
  connection: RealtimeConnection<any, any, infer Message, any>,
) => any
  ? Message
  : unknown

type RealtimeUse<Handler extends RealtimeHandler<any, any, any, any>> = () => RealtimeHandle<
  HandlerInput<Handler>,
  HandlerClientMessage<Handler>,
  HandlerServerMessage<Handler>
>

export type RealtimeStatus = 'closed' | 'connecting' | 'open'

export interface RealtimeHandle<Input, ClientMessage, ServerMessage> {
  close: (code?: number, reason?: string) => void
  connect: unknown extends Input
    ? (input?: Input) => void
    : undefined extends Input
      ? (input?: Input) => void
      : (input: Input) => void
  readonly error: unknown
  readonly isOpen: boolean
  readonly lastMessage: ServerMessage | undefined
  readonly messages: readonly ServerMessage[]
  send: (message: ClientMessage) => void
  readonly status: RealtimeStatus
}

export interface RealtimeMiddleware<E extends Env = Env> extends MiddlewareHandler<E> {
  readonly __eclipsa_realtime_env__?: E
}

export interface RealtimeConnection<Input, ClientMessage, ServerMessage, E extends Env = Env> {
  readonly c: AppContext<E>
  close: (code?: number, reason?: string) => void
  readonly input: Input
  onClose: (callback: (event: RealtimeCloseEvent) => void) => () => void
  onError: (callback: (event: unknown) => void) => () => void
  onMessage: (callback: (message: ClientMessage) => void | Promise<void>) => () => void
  send: (message: ServerMessage) => void
}

export interface RealtimeCloseEvent {
  code?: number
  reason?: string
  wasClean?: boolean
}

export type RealtimeHandler<
  E extends Env = Env,
  Input = unknown,
  ClientMessage = unknown,
  ServerMessage = unknown,
> = ((
  connection: RealtimeConnection<Input, ClientMessage, ServerMessage, E>,
) => void | Promise<void>) & {
  readonly [REALTIME_CLIENT_MESSAGE_TYPE]?: ClientMessage
  readonly [REALTIME_INPUT_TYPE]?: Input
  readonly [REALTIME_SERVER_MESSAGE_TYPE]?: ServerMessage
}

export interface RealtimeFactory {
  <Handler extends RealtimeHandler<{}, any, any, any>>(handler: Handler): RealtimeUse<Handler>
  <
    M1 extends RealtimeMiddleware<any>,
    Handler extends RealtimeHandler<RealtimeEnv<[M1]>, any, any, any>,
  >(
    middleware1: M1,
    handler: Handler,
  ): RealtimeUse<Handler>
  <
    M1 extends RealtimeMiddleware<any>,
    M2 extends RealtimeMiddleware<any>,
    Handler extends RealtimeHandler<RealtimeEnv<[M1, M2]>, any, any, any>,
  >(
    middleware1: M1,
    middleware2: M2,
    handler: Handler,
  ): RealtimeUse<Handler>
  <
    M1 extends RealtimeMiddleware<any>,
    M2 extends RealtimeMiddleware<any>,
    M3 extends RealtimeMiddleware<any>,
    Handler extends RealtimeHandler<RealtimeEnv<[M1, M2, M3]>, any, any, any>,
  >(
    middleware1: M1,
    middleware2: M2,
    middleware3: M3,
    handler: Handler,
  ): RealtimeUse<Handler>
  <
    M1 extends RealtimeMiddleware<any>,
    M2 extends RealtimeMiddleware<any>,
    M3 extends RealtimeMiddleware<any>,
    M4 extends RealtimeMiddleware<any>,
    Handler extends RealtimeHandler<RealtimeEnv<[M1, M2, M3, M4]>, any, any, any>,
  >(
    middleware1: M1,
    middleware2: M2,
    middleware3: M3,
    middleware4: M4,
    handler: Handler,
  ): RealtimeUse<Handler>
  <
    M1 extends RealtimeMiddleware<any>,
    M2 extends RealtimeMiddleware<any>,
    M3 extends RealtimeMiddleware<any>,
    M4 extends RealtimeMiddleware<any>,
    M5 extends RealtimeMiddleware<any>,
    Handler extends RealtimeHandler<RealtimeEnv<[M1, M2, M3, M4, M5]>, any, any, any>,
  >(
    middleware1: M1,
    middleware2: M2,
    middleware3: M3,
    middleware4: M4,
    middleware5: M5,
    handler: Handler,
  ): RealtimeUse<Handler>
}

export interface RealtimeSocketLike {
  addEventListener?: (type: string, listener: (event: any) => void) => void
  close: (code?: number, reason?: string) => void
  onclose?: ((event: RealtimeCloseEvent) => void) | null
  onerror?: ((event: unknown) => void) | null
  onmessage?: ((event: { data: unknown }) => void) | null
  send: (data: string) => void
}

interface RegisteredRealtime {
  handler: RealtimeHandler<any, any, any, any>
  id: string
  middlewares: RealtimeMiddleware<any>[]
}

interface RealtimeMessageFrame {
  type: 'message'
  value: SerializedValue
}

interface RealtimeErrorFrame {
  error: SerializedValue
  type: 'error'
}

type RealtimeFrame = RealtimeErrorFrame | RealtimeMessageFrame

const realtimeHandles = new WeakMap<object, Map<string, unknown>>()

const getRealtimeRegistry = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[REALTIME_REGISTRY_KEY]
  if (existing instanceof Map) {
    return existing as Map<string, RegisteredRealtime>
  }
  const created = new Map<string, RegisteredRealtime>()
  globalRecord[REALTIME_REGISTRY_KEY] = created
  return created
}

const encodeFrame = (frame: RealtimeFrame) => JSON.stringify(frame)

const decodeFrame = (value: unknown): RealtimeFrame => {
  const frame = typeof value === 'string' ? JSON.parse(value) : value
  if (!frame || typeof frame !== 'object') {
    throw new TypeError('Malformed realtime frame.')
  }
  const type = (frame as { type?: unknown }).type
  if (type !== 'message' && type !== 'error') {
    throw new TypeError('Malformed realtime frame.')
  }
  return frame as RealtimeFrame
}

const encodeMessageFrame = (value: unknown): string =>
  encodeFrame({
    type: 'message',
    value: serializePublicValue(value),
  })

const decodeMessageFrame = (value: unknown) => {
  const frame = decodeFrame(value)
  if (frame.type === 'error') {
    throw deserializePublicValue(frame.error)
  }
  return deserializePublicValue(frame.value)
}

const composeMiddlewares = async (
  c: AppContext<any>,
  middlewares: RealtimeMiddleware<any>[],
  handler: () => void | Promise<void>,
): Promise<void> => {
  let index = -1
  const dispatch = async (nextIndex: number): Promise<void> => {
    if (nextIndex <= index) {
      throw new Error('Realtime middleware called next() multiple times.')
    }
    index = nextIndex
    const middleware = middlewares[nextIndex]
    if (!middleware) {
      await handler()
      return
    }
    await middleware(c, (() => dispatch(nextIndex + 1)) as Next)
  }
  await dispatch(0)
}

const addSocketListener = (
  socket: RealtimeSocketLike,
  type: 'close' | 'error' | 'message',
  listener: (event: any) => void,
) => {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(type, listener)
    return
  }
  const key = `on${type}` as 'onclose' | 'onerror' | 'onmessage'
  const previous = socket[key]
  socket[key] = ((event: any) => {
    previous?.(event)
    listener(event)
  }) as never
}

const readRealtimeInput = (c: AppContext<any>, input?: unknown) => {
  if (input !== undefined) {
    return input
  }
  const encoded = c.req.query('input')
  if (!encoded) {
    return undefined
  }
  return deserializePublicValue(JSON.parse(encoded))
}

export const realtime: RealtimeFactory = (() => {
  throw new Error('realtime() must be compiled by the Eclipsa analyzer before it can run.')
}) as RealtimeFactory

export function registerRealtime<Handler extends RealtimeHandler<{}, any, any, any>>(
  id: string,
  middlewares: readonly [],
  handler: Handler,
): void
export function registerRealtime<
  M1 extends RealtimeMiddleware<any>,
  Handler extends RealtimeHandler<RealtimeEnv<[M1]>, any, any, any>,
>(id: string, middlewares: readonly [M1], handler: Handler): void
export function registerRealtime(
  id: string,
  middlewares: readonly RealtimeMiddleware<any>[],
  handler: RealtimeHandler<any, any, any, any>,
) {
  getRealtimeRegistry().set(id, {
    handler,
    id,
    middlewares: [...middlewares] as RealtimeMiddleware<any>[],
  })
}

export const hasRealtime = (id: string) => getRealtimeRegistry().has(id)

export const executeRealtime = async (
  id: string,
  c: AppContext<any>,
  socket: RealtimeSocketLike,
  input?: unknown,
) => {
  const realtimeEntry = getRealtimeRegistry().get(id)
  if (!realtimeEntry) {
    throw new Error(`Unknown realtime ${id}.`)
  }

  const messageCallbacks = new Set<(message: unknown) => void | Promise<void>>()
  const closeCallbacks = new Set<(event: RealtimeCloseEvent) => void>()
  const errorCallbacks = new Set<(event: unknown) => void>()
  const connection = {
    c,
    close: (code?: number, reason?: string) => socket.close(code, reason),
    input: readRealtimeInput(c, input),
    onClose(callback: (event: RealtimeCloseEvent) => void) {
      closeCallbacks.add(callback)
      return () => closeCallbacks.delete(callback)
    },
    onError(callback: (event: unknown) => void) {
      errorCallbacks.add(callback)
      return () => errorCallbacks.delete(callback)
    },
    onMessage(callback: (message: unknown) => void | Promise<void>) {
      messageCallbacks.add(callback)
      return () => messageCallbacks.delete(callback)
    },
    send: (message: unknown) => socket.send(encodeMessageFrame(message)),
  } satisfies RealtimeConnection<unknown, unknown, unknown>

  addSocketListener(socket, 'message', (event) => {
    void (async () => {
      try {
        const message = decodeMessageFrame(event.data)
        await Promise.all([...messageCallbacks].map((callback) => callback(message)))
      } catch (error) {
        const publicError = await transformCurrentPublicError(error, 'transport')
        socket.send(
          encodeFrame({
            error: serializePublicValue(publicError),
            type: 'error',
          }),
        )
      }
    })()
  })
  addSocketListener(socket, 'close', (event) => {
    for (const callback of closeCallbacks) {
      callback(event)
    }
  })
  addSocketListener(socket, 'error', (event) => {
    for (const callback of errorCallbacks) {
      callback(event)
    }
  })

  await composeMiddlewares(c, realtimeEntry.middlewares, () => realtimeEntry.handler(connection))
}

const createRealtimeUrl = (id: string, input: unknown) => {
  const baseHref = typeof window !== 'undefined' ? window.location.href : 'http://localhost/'
  const url = new URL(`/__eclipsa/realtime/${encodeURIComponent(id)}`, baseHref)
  if (input !== undefined) {
    url.searchParams.set('input', JSON.stringify(serializePublicValue(input)))
  }
  return url
}

const toWebSocketUrl = (url: URL) => {
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}

export const __eclipsaRealtime = <
  const _Middlewares extends readonly RealtimeMiddleware<any>[],
  Handler extends RealtimeHandler<RealtimeEnv<_Middlewares>, any, any, any>,
>(
  id: string,
  middlewares: readonly [..._Middlewares],
  handler: Handler,
): RealtimeUse<Handler> => {
  if (typeof window === 'undefined') {
    getRealtimeRegistry().set(id, {
      handler: handler as RealtimeHandler<any, any, any, any>,
      id,
      middlewares: [...middlewares] as RealtimeMiddleware<any>[],
    })
  }

  return (() => {
    type Input = HandlerInput<Handler>
    type ClientMessage = HandlerClientMessage<Handler>
    type ServerMessage = HandlerServerMessage<Handler>

    const container = getRuntimeContainer()
    if (!container) {
      throw new Error('Realtime handles require an active runtime container.')
    }
    let handles = realtimeHandles.get(container)
    if (!handles) {
      handles = new Map()
      realtimeHandles.set(container, handles)
    }
    const existing = handles.get(id)
    if (existing) {
      return existing as RealtimeHandle<Input, ClientMessage, ServerMessage>
    }

    let socket: WebSocket | null = null
    const status = createDetachedRuntimeSignal<RealtimeStatus>(
      container,
      `$realtime:${id}:status`,
      'closed',
    )
    const error = createDetachedRuntimeSignal<unknown>(
      container,
      `$realtime:${id}:error`,
      undefined,
    )
    const messages = createDetachedRuntimeSignal<ServerMessage[]>(
      container,
      `$realtime:${id}:messages`,
      [],
    )
    const lastMessage = createDetachedRuntimeSignal<ServerMessage | undefined>(
      container,
      `$realtime:${id}:last-message`,
      undefined,
    )

    const connect = (input?: Input) => {
      if (typeof WebSocket === 'undefined') {
        throw new TypeError('realtime() requires WebSocket support in the current runtime.')
      }
      if (
        socket &&
        (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
      ) {
        return
      }
      error.value = undefined
      status.value = 'connecting'
      const nextSocket = new WebSocket(toWebSocketUrl(createRealtimeUrl(id, input)))
      socket = nextSocket
      nextSocket.addEventListener('open', () => {
        status.value = 'open'
      })
      nextSocket.addEventListener('message', (event) => {
        try {
          const message = decodeMessageFrame(event.data) as ServerMessage
          lastMessage.value = message
          messages.value = [...messages.value, message]
        } catch (caught) {
          error.value = caught
        }
      })
      nextSocket.addEventListener('error', (event) => {
        error.value = event
      })
      nextSocket.addEventListener('close', () => {
        status.value = 'closed'
        if (socket === nextSocket) {
          socket = null
        }
      })
    }

    const close = (code?: number, reason?: string) => {
      socket?.close(code, reason)
      socket = null
      status.value = 'closed'
    }

    const realtimeHandle = {
      close,
      connect: connect as RealtimeHandle<Input, ClientMessage, ServerMessage>['connect'],
      get error() {
        return error.value
      },
      get isOpen() {
        return status.value === 'open'
      },
      get lastMessage() {
        return lastMessage.value
      },
      get messages() {
        return messages.value
      },
      send(message: ClientMessage) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          throw new TypeError('Cannot send realtime message before the WebSocket is open.')
        }
        socket.send(encodeMessageFrame(message))
      },
      get status() {
        return status.value
      },
    } satisfies RealtimeHandle<Input, ClientMessage, ServerMessage>

    onMount(() => {
      onCleanup(close)
    })
    handles.set(id, realtimeHandle)
    return realtimeHandle
  }) as RealtimeUse<Handler>
}
