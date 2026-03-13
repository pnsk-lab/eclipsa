import type { Context } from 'hono'
import type { Env, MiddlewareHandler, Next } from 'hono/types'
import {
  deserializeValue,
  serializeValue,
  type SerializedReference,
  type SerializedValue,
} from './serialize.ts'
import {
  createDetachedRuntimeSignal,
  ensureRuntimeElementId,
  findRuntimeElement,
  getRuntimeContainer,
  getRuntimeSignalId,
  type RuntimeContainer,
} from './runtime.ts'
import { registerActionHook, setActionHandleMeta, setActionHookMeta } from './internal.ts'
import { useSignal } from './signal.ts'

const ACTION_REGISTRY_KEY = Symbol.for('eclipsa.action-registry')
const ACTION_CONTENT_TYPE = 'application/eclipsa-action+json'
const ACTION_STREAM_CONTENT_TYPE = 'application/eclipsa-action-stream+json'

declare const ACTION_REF_BRAND: unique symbol
declare const ACTION_INPUT_TYPE: unique symbol

export interface StandardSchemaIssue {
  message: string
  path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
}

export type StandardSchemaResult<T> =
  | {
      issues: readonly StandardSchemaIssue[]
    }
  | {
      issues?: undefined
      value: T
    }

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly validate:
      | ((value: unknown, options?: { readonly libraryOptions?: Record<string, unknown> }) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>)
    readonly types?:
      | {
          readonly input: Input
          readonly output: Output
        }
      | undefined
    readonly vendor: string
    readonly version: 1
  }
}

export type InferStandardSchemaInput<Schema extends StandardSchemaV1<any, any>> =
  NonNullable<Schema['~standard']['types']>['input']

export type InferStandardSchemaOutput<Schema extends StandardSchemaV1<any, any>> =
  NonNullable<Schema['~standard']['types']>['output']

export interface OpaqueSignalRef {
  readonly [ACTION_REF_BRAND]?: 'signal'
  readonly containerId: string | null
  readonly kind: 'signal-ref'
  readonly token: string
}

export interface OpaqueDomRef {
  readonly [ACTION_REF_BRAND]?: 'dom'
  readonly containerId: string | null
  readonly kind: 'dom-ref'
  readonly token: string
}

export type ActionOpaqueRef = OpaqueSignalRef | OpaqueDomRef

type MiddlewareEnv<T> = T extends {
  readonly __eclipsa_action_env__?: infer MiddlewareEnv
}
  ? Exclude<MiddlewareEnv, undefined> extends Env
    ? Exclude<MiddlewareEnv, undefined>
    : {}
  : T extends MiddlewareHandler<infer MiddlewareEnv, any, any>
    ? MiddlewareEnv
    : {}

type ActionEnv<Middlewares extends readonly ActionMiddleware<any>[]> =
  Middlewares extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly ActionMiddleware<any>[]
      ? MiddlewareEnv<Head> & ActionEnv<Tail>
      : MiddlewareEnv<Head>
    : {}
type MiddlewareActionInput<T> = T extends {
  readonly [ACTION_INPUT_TYPE]?: infer Input
}
  ? Exclude<Input, undefined>
  : never

type ActionInput<Middlewares extends readonly ActionMiddleware<any>[]> = [
  MiddlewareActionInput<Middlewares[number]>,
] extends [never]
  ? unknown
  : MiddlewareActionInput<Middlewares[number]>

type ActionInvoker<Input, Output> = unknown extends Input
  ? (input?: Input) => Promise<Output>
  : undefined extends Input
    ? (input?: Input) => Promise<Output>
    : (input: Input) => Promise<Output>

export interface ActionHandle<Input, Output> {
  action: ActionInvoker<Input, Output>
  readonly error: unknown
  readonly isPending: boolean
  readonly result: Output | undefined
}

export interface ActionMiddleware<E extends Env = Env> extends MiddlewareHandler<E> {
  readonly __eclipsa_action_env__?: E
}
export interface ActionValidatorMiddleware<Input, Output>
  extends ActionMiddleware<{
    Variables: {
      input: Output
    }
  }> {
  readonly [ACTION_INPUT_TYPE]?: Input
}
export type ActionHandler<E extends Env = Env, Output = unknown> = (
  c: Context<E>,
) => Output | Promise<Output>

type ActionUse<Middlewares extends readonly ActionMiddleware<any>[], Output> = () => ActionHandle<
  ActionInput<Middlewares>,
  Output
>

export interface ActionFactory {
  <Output>(handler: ActionHandler<{}, Output>): ActionUse<[], Output>
  <M1 extends ActionMiddleware<any>, Output>(
    middleware1: M1,
    handler: ActionHandler<ActionEnv<[M1]>, Output>,
  ): ActionUse<[M1], Output>
  <M1 extends ActionMiddleware<any>, M2 extends ActionMiddleware<any>, Output>(
    middleware1: M1,
    middleware2: M2,
    handler: ActionHandler<ActionEnv<[M1, M2]>, Output>,
  ): ActionUse<[M1, M2], Output>
  <M1 extends ActionMiddleware<any>, M2 extends ActionMiddleware<any>, M3 extends ActionMiddleware<any>, Output>(
    middleware1: M1,
    middleware2: M2,
    middleware3: M3,
    handler: ActionHandler<ActionEnv<[M1, M2, M3]>, Output>,
  ): ActionUse<[M1, M2, M3], Output>
  <
    M1 extends ActionMiddleware<any>,
    M2 extends ActionMiddleware<any>,
    M3 extends ActionMiddleware<any>,
    M4 extends ActionMiddleware<any>,
    Output,
  >(
    middleware1: M1,
    middleware2: M2,
    middleware3: M3,
    middleware4: M4,
    handler: ActionHandler<ActionEnv<[M1, M2, M3, M4]>, Output>,
  ): ActionUse<[M1, M2, M3, M4], Output>
  <
    M1 extends ActionMiddleware<any>,
    M2 extends ActionMiddleware<any>,
    M3 extends ActionMiddleware<any>,
    M4 extends ActionMiddleware<any>,
    M5 extends ActionMiddleware<any>,
    Output,
  >(
    middleware1: M1,
    middleware2: M2,
    middleware3: M3,
    middleware4: M4,
    middleware5: M5,
    handler: ActionHandler<ActionEnv<[M1, M2, M3, M4, M5]>, Output>,
  ): ActionUse<[M1, M2, M3, M4, M5], Output>
}

interface RegisteredAction {
  handler: ActionHandler<any, unknown>
  id: string
  middlewares: ActionMiddleware<any>[]
}

interface ActionJsonSuccess {
  ok: true
  value: SerializedValue
}

interface ActionJsonFailure {
  error: SerializedValue
  ok: false
}

interface StreamChunkFrame {
  type: 'chunk'
  value: SerializedValue
}

interface StreamDoneFrame {
  type: 'done'
}

interface StreamErrorFrame {
  error: SerializedValue
  type: 'error'
}

type ActionStreamFrame = StreamChunkFrame | StreamDoneFrame | StreamErrorFrame

const getActionRegistry = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[ACTION_REGISTRY_KEY]
  if (existing instanceof Map) {
    return existing as Map<string, RegisteredAction>
  }
  const created = new Map<string, RegisteredAction>()
  globalRecord[ACTION_REGISTRY_KEY] = created
  return created
}

const createActionRefScope = (container: RuntimeContainer | null) =>
  container ? serializeValue({ container: container.id }) : undefined

const readActionRefContainerId = (reference: SerializedReference) => {
  if (!reference.data) {
    return null
  }
  const decoded = deserializeValue(reference.data)
  if (!decoded || typeof decoded !== 'object') {
    return null
  }
  const containerId = (decoded as Record<string, unknown>).container
  return typeof containerId === 'string' ? containerId : null
}

const serializeActionClientValue = (container: RuntimeContainer | null, value: unknown) =>
  serializeValue(value, {
    serializeReference(candidate) {
      const signalId = getRuntimeSignalId(candidate)
      if (signalId) {
        return {
          __eclipsa_type: 'ref',
          data: createActionRefScope(container),
          kind: 'signal',
          token: signalId,
        }
      }
      if (container && typeof Element !== 'undefined' && candidate instanceof Element) {
        return {
          __eclipsa_type: 'ref',
          data: createActionRefScope(container),
          kind: 'dom',
          token: ensureRuntimeElementId(container, candidate),
        }
      }
      return null
    },
  })

const deserializeActionServerValue = (value: SerializedValue) =>
  deserializeValue(value, {
    deserializeReference(reference) {
      const containerId = readActionRefContainerId(reference)
      if (reference.kind === 'signal') {
        return {
          containerId,
          kind: 'signal-ref',
          token: reference.token,
        } satisfies OpaqueSignalRef
      }
      if (reference.kind === 'dom') {
        return {
          containerId,
          kind: 'dom-ref',
          token: reference.token,
        } satisfies OpaqueDomRef
      }
      throw new TypeError(`Unsupported action input reference kind "${reference.kind}".`)
    },
  })

const deserializeActionClientValue = (container: RuntimeContainer | null, value: SerializedValue) =>
  deserializeValue(value, {
    deserializeReference(reference) {
      if (!container) {
        throw new TypeError('Action references require an active runtime container.')
      }
      const containerId = readActionRefContainerId(reference)
      if (containerId !== container.id) {
        throw new TypeError('Action reference does not belong to the active runtime container.')
      }
      if (reference.kind === 'signal') {
        const signal = container.signals.get(reference.token)
        if (!signal) {
          throw new Error(`Missing action signal ${reference.token}.`)
        }
        return signal.handle
      }
      if (reference.kind === 'dom') {
        const element = findRuntimeElement(container, reference.token)
        if (!element) {
          throw new Error(`Missing action DOM ref ${reference.token}.`)
        }
        return element
      }
      throw new TypeError(`Unsupported action output reference kind "${reference.kind}".`)
    },
  })

const isOpaqueSignalRef = (value: unknown): value is OpaqueSignalRef =>
  !!value &&
  typeof value === 'object' &&
  (value as Record<string, unknown>).kind === 'signal-ref' &&
  typeof (value as Record<string, unknown>).token === 'string'

const isOpaqueDomRef = (value: unknown): value is OpaqueDomRef =>
  !!value &&
  typeof value === 'object' &&
  (value as Record<string, unknown>).kind === 'dom-ref' &&
  typeof (value as Record<string, unknown>).token === 'string'

const serializeActionServerValue = (value: unknown) =>
  serializeValue(value, {
    serializeReference(candidate) {
      if (isOpaqueSignalRef(candidate)) {
        return {
          __eclipsa_type: 'ref',
          data:
            candidate.containerId === null
              ? undefined
              : serializeValue({
                  container: candidate.containerId,
                }),
          kind: 'signal',
          token: candidate.token,
        }
      }
      if (isOpaqueDomRef(candidate)) {
        return {
          __eclipsa_type: 'ref',
          data:
            candidate.containerId === null
              ? undefined
              : serializeValue({
                  container: candidate.containerId,
                }),
          kind: 'dom',
          token: candidate.token,
        }
      }
      return null
    },
  })

const isReadableStreamValue = (value: unknown): value is ReadableStream<unknown> =>
  typeof ReadableStream !== 'undefined' && value instanceof ReadableStream

const isAsyncGeneratorValue = (
  value: unknown,
): value is AsyncGenerator<unknown, unknown, unknown> | AsyncIterable<unknown> =>
  !!value && typeof value === 'object' && Symbol.asyncIterator in value

const toSerializedActionError = (error: unknown): SerializedValue => {
  if (error instanceof Error) {
    return serializeActionServerValue({
      message: error.message,
      name: error.name,
    })
  }
  try {
    return serializeActionServerValue(error)
  } catch {
    return serializeActionServerValue({
      message: 'Action failed.',
    })
  }
}

const toAsyncIterable = async function* (
  value: ReadableStream<unknown> | AsyncIterable<unknown>,
): AsyncGenerator<unknown, void, void> {
  if (isReadableStreamValue(value)) {
    const reader = value.getReader()
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) {
          return
        }
        yield next.value
      }
    } finally {
      reader.releaseLock()
    }
  }
  yield* value
}

const encodeStreamFrame = (frame: ActionStreamFrame) =>
  `${JSON.stringify(frame)}
`

const streamActionValue = (
  value: ReadableStream<unknown> | AsyncIterable<unknown>,
  serializeChunk: (value: unknown) => SerializedValue,
) => {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of toAsyncIterable(value)) {
          controller.enqueue(
            encoder.encode(
              encodeStreamFrame({
                type: 'chunk',
                value: serializeChunk(chunk),
              }),
            ),
          )
        }
        controller.enqueue(
          encoder.encode(
            encodeStreamFrame({
              type: 'done',
            }),
          ),
        )
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeStreamFrame({
              error: toSerializedActionError(error),
              type: 'error',
            }),
          ),
        )
      } finally {
        controller.close()
      }
    },
  })
}

const parseJsonActionResponse = async (response: Response, container: RuntimeContainer | null) => {
  const body = (await response.json()) as ActionJsonFailure | ActionJsonSuccess
  if (!body || typeof body !== 'object' || typeof body.ok !== 'boolean') {
    throw new TypeError('Malformed action response.')
  }
  if (!body.ok) {
    throw deserializeActionClientValue(container, body.error)
  }
  return deserializeActionClientValue(container, body.value)
}

const iterateStreamFrames = async function* (
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ActionStreamFrame, void, void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        break
      }
      buffer += decoder.decode(next.value, { stream: true })
      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex < 0) {
          break
        }
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) {
          continue
        }
        yield JSON.parse(line) as ActionStreamFrame
      }
    }
    const trailing = buffer.trim()
    if (trailing) {
      yield JSON.parse(trailing) as ActionStreamFrame
    }
  } finally {
    reader.releaseLock()
  }
}

const toClientStream = (response: Response, container: RuntimeContainer | null) => {
  if (!response.body) {
    throw new TypeError('Missing action stream body.')
  }
  return new ReadableStream<unknown>({
    async start(controller) {
      try {
        for await (const frame of iterateStreamFrames(response.body!)) {
          if (frame.type === 'chunk') {
            controller.enqueue(deserializeActionClientValue(container, frame.value))
            continue
          }
          if (frame.type === 'done') {
            controller.close()
            return
          }
          controller.error(deserializeActionClientValue(container, frame.error))
          return
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

const toClientAsyncGenerator = async function* (response: Response, container: RuntimeContainer | null) {
  if (!response.body) {
    throw new TypeError('Missing action stream body.')
  }
  for await (const frame of iterateStreamFrames(response.body)) {
    if (frame.type === 'chunk') {
      yield deserializeActionClientValue(container, frame.value)
      continue
    }
    if (frame.type === 'done') {
      return
    }
    throw deserializeActionClientValue(container, frame.error)
  }
}

const invokeAction = async (id: string, input: unknown, container: RuntimeContainer | null) => {
  const response = await fetch(`/__eclipsa/action/${encodeURIComponent(id)}`, {
    body: JSON.stringify({
      input: serializeActionClientValue(container, input),
    }),
    headers: {
      accept: `${ACTION_STREAM_CONTENT_TYPE}, ${ACTION_CONTENT_TYPE}`,
      'content-type': ACTION_CONTENT_TYPE,
    },
    method: 'POST',
  })
  const contentType = response.headers.get('content-type') ?? ''
  const streamKind = response.headers.get('x-eclipsa-stream-kind')
  if (contentType.startsWith(ACTION_STREAM_CONTENT_TYPE)) {
    if (streamKind === 'async-generator') {
      return toClientAsyncGenerator(response, container)
    }
    return toClientStream(response, container)
  }
  return parseJsonActionResponse(response, container)
}

const composeMiddlewares = async (
  c: Context<any>,
  middlewares: ActionMiddleware<any>[],
  handler: ActionHandler<any, unknown>,
): Promise<Response | unknown> => {
  let index = -1
  const dispatch = async (nextIndex: number): Promise<Response | unknown> => {
    if (nextIndex <= index) {
      throw new Error('Action middleware called next() multiple times.')
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

const toActionResponse = (value: unknown): Response => {
  if (value instanceof Response) {
    return value
  }
  if (isReadableStreamValue(value)) {
    return new Response(streamActionValue(value, (entry) => serializeActionServerValue(entry)), {
      headers: {
        'content-type': ACTION_STREAM_CONTENT_TYPE,
        'x-eclipsa-stream-kind': 'readable-stream',
      },
    })
  }
  if (isAsyncGeneratorValue(value)) {
    return new Response(streamActionValue(value, (entry) => serializeActionServerValue(entry)), {
      headers: {
        'content-type': ACTION_STREAM_CONTENT_TYPE,
        'x-eclipsa-stream-kind': 'async-generator',
      },
    })
  }
  return new Response(
    JSON.stringify({
      ok: true,
      value: serializeActionServerValue(value),
    } satisfies ActionJsonSuccess),
    {
      headers: {
        'content-type': ACTION_CONTENT_TYPE,
      },
    },
  )
}

const createHandleSignal = <T>(
  container: RuntimeContainer | null,
  id: string,
  key: string,
  initialValue: T,
) => {
  try {
    return useSignal(initialValue)
  } catch {
    if (!container) {
      throw new Error('Action handles require an active runtime container.')
    }
    return createDetachedRuntimeSignal(container, `$action:${id}:${key}`, initialValue)
  }
}

export const action$: ActionFactory = (() => {
  throw new Error('action$() must be compiled by the Eclipsa analyzer before it can run.')
}) as ActionFactory

export const validator = <Schema extends StandardSchemaV1<any, any>>(
  schema: Schema,
): ActionValidatorMiddleware<
  InferStandardSchemaInput<Schema>,
  InferStandardSchemaOutput<Schema>
> => {
  const middleware = async (c: any, next: any) => {
    let parsedBody: unknown
    try {
      parsedBody = await c.req.json()
    } catch {
      return c.json(
        {
          error: serializeValue({
            issues: [{ message: 'Action input must be valid JSON.' }],
          }),
          ok: false,
        } satisfies ActionJsonFailure,
        400,
      )
    }
    if (!parsedBody || typeof parsedBody !== 'object' || !('input' in parsedBody)) {
      return c.json(
        {
          error: serializeValue({
            issues: [{ message: 'Action request body must contain an input field.' }],
          }),
          ok: false,
        } satisfies ActionJsonFailure,
        400,
      )
    }
    const decoded = deserializeActionServerValue((parsedBody as { input: SerializedValue }).input)
    const validated = await schema['~standard'].validate(decoded)
    if ('issues' in validated) {
      return c.json(
        {
          error: serializeValue({
            issues: validated.issues,
          }),
          ok: false,
        } satisfies ActionJsonFailure,
        400,
      )
    }
    c.set('input', validated.value as InferStandardSchemaOutput<Schema>)
    await next()
  }
  return middleware as ActionValidatorMiddleware<
    InferStandardSchemaInput<Schema>,
    InferStandardSchemaOutput<Schema>
  >
}

export function registerAction<Output>(
  id: string,
  middlewares: readonly [],
  handler: ActionHandler<{}, Output>,
): void
export function registerAction<M1 extends ActionMiddleware<any>, Output>(
  id: string,
  middlewares: readonly [M1],
  handler: ActionHandler<ActionEnv<[M1]>, Output>,
): void
export function registerAction<
  M1 extends ActionMiddleware<any>,
  M2 extends ActionMiddleware<any>,
  Output,
>(
  id: string,
  middlewares: readonly [M1, M2],
  handler: ActionHandler<ActionEnv<[M1, M2]>, Output>,
): void
export function registerAction<
  M1 extends ActionMiddleware<any>,
  M2 extends ActionMiddleware<any>,
  M3 extends ActionMiddleware<any>,
  Output,
>(
  id: string,
  middlewares: readonly [M1, M2, M3],
  handler: ActionHandler<ActionEnv<[M1, M2, M3]>, Output>,
): void
export function registerAction<
  M1 extends ActionMiddleware<any>,
  M2 extends ActionMiddleware<any>,
  M3 extends ActionMiddleware<any>,
  M4 extends ActionMiddleware<any>,
  Output,
>(
  id: string,
  middlewares: readonly [M1, M2, M3, M4],
  handler: ActionHandler<ActionEnv<[M1, M2, M3, M4]>, Output>,
): void
export function registerAction<
  M1 extends ActionMiddleware<any>,
  M2 extends ActionMiddleware<any>,
  M3 extends ActionMiddleware<any>,
  M4 extends ActionMiddleware<any>,
  M5 extends ActionMiddleware<any>,
  Output,
>(
  id: string,
  middlewares: readonly [M1, M2, M3, M4, M5],
  handler: ActionHandler<ActionEnv<[M1, M2, M3, M4, M5]>, Output>,
): void
export function registerAction(
  id: string,
  middlewares: readonly ActionMiddleware<any>[],
  handler: ActionHandler<any, unknown>,
) {
  getActionRegistry().set(id, {
    handler,
    id,
    middlewares: [...middlewares] as ActionMiddleware<any>[],
  })
}

export const hasAction = (id: string) => getActionRegistry().has(id)

export const executeAction = async (id: string, c: Context<any>) => {
  const action = getActionRegistry().get(id)
  if (!action) {
    throw new Error(`Unknown action ${id}.`)
  }
  try {
    const result = await composeMiddlewares(c, action.middlewares, action.handler)
    return result instanceof Response ? result : toActionResponse(result)
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: toSerializedActionError(error),
        ok: false,
      } satisfies ActionJsonFailure),
      {
        headers: {
          'content-type': ACTION_CONTENT_TYPE,
        },
        status: 500,
      },
    )
  }
}

export const __eclipsaAction = <const Middlewares extends readonly ActionMiddleware<any>[], Output>(
  id: string,
  middlewares: readonly [...Middlewares],
  handler: ActionHandler<ActionEnv<Middlewares>, Output>,
) => {
  if (typeof window === 'undefined') {
    getActionRegistry().set(id, {
      handler: handler as ActionHandler<any, unknown>,
      id,
      middlewares: [...middlewares] as ActionMiddleware<any>[],
    })
  }

  const useActionHandle = registerActionHook(
    id,
    setActionHookMeta(() => {
      const container = getRuntimeContainer()
      const existing = container?.actions.get(id)
      if (existing) {
        return existing as ActionHandle<ActionInput<Middlewares>, Output>
      }

      const pending = createHandleSignal(container, id, 'pending', false)
      const result = createHandleSignal<Output | undefined>(container, id, 'result', undefined)
      const error = createHandleSignal<unknown>(container, id, 'error', undefined)
      const actionHandle = setActionHandleMeta(
        {
          action: (async (input: ActionInput<Middlewares>) => {
            pending.value = true
            error.value = undefined
            try {
              const value = (await invokeAction(id, input, container)) as Output
              result.value = value
              return value
            } catch (caught) {
              error.value = caught
              throw caught
            } finally {
              pending.value = false
            }
          }) as ActionInvoker<ActionInput<Middlewares>, Output>,
          get error() {
            return error.value
          },
          get isPending() {
            return pending.value
          },
          get result() {
            return result.value
          },
        } satisfies ActionHandle<ActionInput<Middlewares>, Output>,
        id,
      )
      container?.actions.set(id, actionHandle)
      return actionHandle
    }, id),
  ) as () => ActionHandle<ActionInput<Middlewares>, Output>

  return useActionHandle
}
