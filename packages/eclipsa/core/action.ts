import type { JSX } from '../jsx/types.ts'
import type { Env, MiddlewareHandler, Next } from 'hono/types'
import {
  type AppContext,
  deserializePublicValue,
  serializePublicValue,
  type SerializedReference,
  type SerializedValue,
  transformCurrentPublicError,
  type WithAppEnv,
} from './hooks.ts'
import {
  createDetachedRuntimeSignal,
  ensureRuntimeElementId,
  findRuntimeElement,
  getRuntimeContainer,
  getRuntimeSignalId,
  type RuntimeContainer,
} from './runtime.ts'
import { registerActionHook, setActionHandleMeta, setActionHookMeta } from './internal.ts'

const ACTION_REGISTRY_KEY = Symbol.for('eclipsa.action-registry')
export const ACTION_CONTENT_TYPE = 'application/eclipsa-action+json'
const ACTION_STREAM_CONTENT_TYPE = 'application/eclipsa-action-stream+json'
export const ACTION_FORM_ATTR = 'data-e-action-form'
export const ACTION_FORM_FIELD = '__e_action'
const ACTION_INPUT_CACHE_KEY = Symbol.for('eclipsa.action-input-cache')

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
    readonly validate: (
      value: unknown,
      options?: { readonly libraryOptions?: Record<string, unknown> },
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>
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

export type InferStandardSchemaInput<Schema extends StandardSchemaV1<any, any>> = NonNullable<
  Schema['~standard']['types']
>['input']

export type InferStandardSchemaOutput<Schema extends StandardSchemaV1<any, any>> = NonNullable<
  Schema['~standard']['types']
>['output']

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
    ? WithAppEnv<Exclude<MiddlewareEnv, undefined>>
    : {}
  : T extends MiddlewareHandler<infer MiddlewareEnv, any, any>
    ? WithAppEnv<MiddlewareEnv>
    : WithAppEnv<Env>

type ActionEnv<Middlewares extends readonly ActionMiddleware<any>[]> =
  Middlewares extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly ActionMiddleware<any>[]
      ? MiddlewareEnv<Head> & ActionEnv<Tail>
      : MiddlewareEnv<Head>
    : WithAppEnv<Env>
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
  ? (input?: Input | FormData) => Promise<Output>
  : undefined extends Input
    ? (input?: Input | FormData) => Promise<Output>
    : (input: Input | FormData) => Promise<Output>

export interface ActionSubmission<Input, Output> {
  readonly error: unknown
  readonly input: Input
  readonly result: Output | undefined
}

export interface ActionFormProps extends Record<string, unknown> {
  children?: JSX.Element | JSX.Element[]
}

export interface ActionHandle<Input, Output> {
  Form: (props: ActionFormProps) => JSX.Element
  action: ActionInvoker<Input, Output>
  readonly error: unknown
  readonly formActionId: string
  readonly isPending: boolean
  readonly lastSubmission: ActionSubmission<Input, Output> | undefined
  readonly result: Output | undefined
}

export interface ActionMiddleware<E extends Env = Env> extends MiddlewareHandler<E> {
  readonly __eclipsa_action_env__?: E
}
export interface ActionValidatorMiddleware<Input, Output> extends ActionMiddleware<{
  Variables: {
    input: Output
  }
}> {
  readonly [ACTION_INPUT_TYPE]?: Input
}
export type ActionHandler<E extends Env = Env, Output = unknown> = (
  c: AppContext<E>,
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
  <
    M1 extends ActionMiddleware<any>,
    M2 extends ActionMiddleware<any>,
    M3 extends ActionMiddleware<any>,
    Output,
  >(
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

interface ActionStateSnapshot {
  error: unknown
  input: unknown
  result: unknown
}

interface ActionExecutionValue {
  input: unknown
  kind: 'value'
  value: unknown
}

interface ActionExecutionResponse {
  input: unknown
  kind: 'response'
  response: Response
}

type ActionExecutionResult = ActionExecutionResponse | ActionExecutionValue

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

const isFormDataValue = (value: unknown): value is FormData =>
  typeof FormData !== 'undefined' && value instanceof FormData

const formDataToInputObject = (value: FormData) => {
  const result: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {}
  for (const [key, entry] of value.entries()) {
    const existing = result[key]
    if (existing === undefined) {
      result[key] = entry
      continue
    }
    result[key] = Array.isArray(existing) ? [...existing, entry] : [existing, entry]
  }
  return result
}

const normalizeFormSubmissionInput = (value: unknown) => {
  if (!isFormDataValue(value)) {
    return value
  }
  const normalized = formDataToInputObject(value)
  return Object.fromEntries(
    Object.entries(normalized).flatMap(([key, entry]) => {
      if (key === ACTION_FORM_FIELD) {
        return []
      }
      if (Array.isArray(entry)) {
        const values = entry
          .filter((candidate): candidate is string => typeof candidate === 'string')
          .map((candidate) => candidate)
        return values.length > 0 ? [[key, values.length === 1 ? values[0] : values]] : []
      }
      return typeof entry === 'string' ? [[key, entry]] : []
    }),
  )
}

const getActionInputCache = (c: AppContext<any>) => {
  const record = c as AppContext<any> & {
    [ACTION_INPUT_CACHE_KEY]?: Promise<unknown>
  }
  if (!record[ACTION_INPUT_CACHE_KEY]) {
    record[ACTION_INPUT_CACHE_KEY] = (async () => {
      const contentType = c.req.header('content-type') ?? ''
      if (contentType.startsWith(ACTION_CONTENT_TYPE)) {
        let parsedBody: unknown
        try {
          parsedBody = await c.req.json()
        } catch {
          throw new TypeError('Action input must be valid JSON.')
        }
        if (!parsedBody || typeof parsedBody !== 'object' || !('input' in parsedBody)) {
          throw new TypeError('Action request body must contain an input field.')
        }
        return deserializeActionServerValue((parsedBody as { input: SerializedValue }).input)
      }
      if (
        contentType.startsWith('application/x-www-form-urlencoded') ||
        contentType.startsWith('multipart/form-data')
      ) {
        return c.req.formData()
      }
      return undefined
    })()
  }
  return record[ACTION_INPUT_CACHE_KEY]!
}

const createActionRefScope = (container: RuntimeContainer | null) =>
  container ? serializePublicValue({ container: container.id }) : undefined

const readActionRefContainerId = (reference: SerializedReference) => {
  if (!reference.data) {
    return null
  }
  const decoded = deserializePublicValue(reference.data)
  if (!decoded || typeof decoded !== 'object') {
    return null
  }
  const containerId = (decoded as Record<string, unknown>).container
  return typeof containerId === 'string' ? containerId : null
}

const serializeActionClientValue = (container: RuntimeContainer | null, value: unknown) =>
  serializePublicValue(value, {
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
  deserializePublicValue(value, {
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
  deserializePublicValue(value, {
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
  serializePublicValue(value, {
    serializeReference(candidate) {
      if (isOpaqueSignalRef(candidate)) {
        return {
          __eclipsa_type: 'ref',
          data:
            candidate.containerId === null
              ? undefined
              : serializePublicValue({
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
              : serializePublicValue({
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

const toClientAsyncGenerator = async function* (
  response: Response,
  container: RuntimeContainer | null,
) {
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
  const isFormSubmission = isFormDataValue(input)
  const response = await fetch(`/__eclipsa/action/${encodeURIComponent(id)}`, {
    body: isFormSubmission
      ? input
      : JSON.stringify({
          input: serializeActionClientValue(container, input),
        }),
    headers: {
      accept: `${ACTION_STREAM_CONTENT_TYPE}, ${ACTION_CONTENT_TYPE}`,
      ...(isFormSubmission ? {} : { 'content-type': ACTION_CONTENT_TYPE }),
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
  c: AppContext<any>,
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
    return new Response(
      streamActionValue(value, (entry) => serializeActionServerValue(entry)),
      {
        headers: {
          'content-type': ACTION_STREAM_CONTENT_TYPE,
          'x-eclipsa-stream-kind': 'readable-stream',
        },
      },
    )
  }
  if (isAsyncGeneratorValue(value)) {
    return new Response(
      streamActionValue(value, (entry) => serializeActionServerValue(entry)),
      {
        headers: {
          'content-type': ACTION_STREAM_CONTENT_TYPE,
          'x-eclipsa-stream-kind': 'async-generator',
        },
      },
    )
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
  if (!container) {
    throw new Error('Action handles require an active runtime container.')
  }
  return createDetachedRuntimeSignal(container, `$action:${id}:${key}`, initialValue)
}

const readActionSubmissionInput = async (c: AppContext<any>) => {
  const cached = await getActionInputCache(c)
  const actionVars = c.var as Record<string, unknown>
  return normalizeFormSubmissionInput(actionVars.__e_action_raw_input ?? cached)
}

export const getNormalizedActionInput = (c: AppContext<any>) => readActionSubmissionInput(c)

export const getActionFormSubmissionId = async (c: AppContext<any>) => {
  const input = await getActionInputCache(c)
  if (!isFormDataValue(input)) {
    return null
  }
  const actionId = input.get(ACTION_FORM_FIELD)
  return typeof actionId === 'string' && actionId ? actionId : null
}

export const executeActionSubmission = async (
  id: string,
  c: AppContext<any>,
): Promise<ActionExecutionResult> => {
  const action = getActionRegistry().get(id)
  if (!action) {
    throw new Error(`Unknown action ${id}.`)
  }
  const input = await readActionSubmissionInput(c)
  const result = await composeMiddlewares(c, action.middlewares, action.handler)
  if (result instanceof Response) {
    return {
      input,
      kind: 'response',
      response: result,
    }
  }
  return {
    input,
    kind: 'value',
    value: result,
  }
}

export const primeActionState = (
  container: RuntimeContainer,
  id: string,
  snapshot: ActionStateSnapshot,
) => {
  container.actionStates.set(id, {
    error: snapshot.error,
    input: snapshot.input,
    result: snapshot.result,
  })
}

const appendClientChildren = (parent: Element, value: unknown) => {
  let resolved = value
  while (typeof resolved === 'function') {
    resolved = resolved()
  }

  if (Array.isArray(resolved)) {
    for (const entry of resolved) {
      appendClientChildren(parent, entry)
    }
    return
  }
  if (resolved === null || resolved === undefined || resolved === false) {
    return
  }
  if (resolved instanceof Node) {
    parent.appendChild(resolved)
    return
  }

  parent.appendChild(document.createTextNode(String(resolved)))
}

const createActionFormNode = (id: string, props: ActionFormProps) => {
  const form = document.createElement('form')
  form.setAttribute(ACTION_FORM_ATTR, id)
  form.setAttribute('method', 'post')

  const hiddenInput = document.createElement('input')
  hiddenInput.name = ACTION_FORM_FIELD
  hiddenInput.type = 'hidden'
  hiddenInput.value = id
  form.appendChild(hiddenInput)

  for (const [name, value] of Object.entries(props)) {
    if (
      name === 'children' ||
      name === 'action' ||
      name === 'method' ||
      value === false ||
      value === undefined ||
      value === null
    ) {
      continue
    }
    if (name === 'class') {
      form.className = String(value)
      continue
    }
    if (name === 'style' && value && typeof value === 'object') {
      form.setAttribute(
        'style',
        Object.entries(value as Record<string, unknown>)
          .map(([styleName, styleValue]) => `${styleName}: ${styleValue}`)
          .join('; '),
      )
      continue
    }
    if (value === true) {
      form.setAttribute(name, '')
      continue
    }
    form.setAttribute(name, String(value))
  }

  appendClientChildren(form, props.children)
  return form
}

export const action: ActionFactory = (() => {
  throw new Error('action() must be compiled by the Eclipsa analyzer before it can run.')
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
      parsedBody = await getActionInputCache(c)
    } catch (error) {
      return c.json(
        {
          error: serializePublicValue({
            issues: [
              {
                message:
                  error instanceof Error && error.message
                    ? error.message
                    : 'Action input could not be parsed.',
              },
            ],
          }),
          ok: false,
        } satisfies ActionJsonFailure,
        400,
      )
    }
    const rawInput = normalizeFormSubmissionInput(parsedBody)
    const validated = await schema['~standard'].validate(rawInput)
    if ('issues' in validated) {
      return c.json(
        {
          error: serializePublicValue({
            issues: validated.issues,
          }),
          ok: false,
        } satisfies ActionJsonFailure,
        400,
      )
    }
    c.set('__e_action_raw_input', rawInput)
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

export const executeAction = async (id: string, c: AppContext<any>) => {
  try {
    const result = await executeActionSubmission(id, c)
    return result.kind === 'response' ? result.response : toActionResponse(result.value)
  } catch (error) {
    const publicError = await transformCurrentPublicError(error, 'action')
    return new Response(
      JSON.stringify({
        error: toSerializedActionError(publicError),
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

      const initialState = container?.actionStates.get(id)
      const pending = createHandleSignal(container, id, 'pending', false)
      const result = createHandleSignal<Output | undefined>(
        container,
        id,
        'result',
        initialState?.result as Output | undefined,
      )
      const error = createHandleSignal<unknown>(container, id, 'error', initialState?.error)
      const lastSubmission = createHandleSignal<
        ActionSubmission<ActionInput<Middlewares>, Output> | undefined
      >(
        container,
        id,
        'last-submission',
        initialState
          ? ({
              error: initialState.error,
              input: initialState.input as ActionInput<Middlewares>,
              result: initialState.result as Output | undefined,
            } satisfies ActionSubmission<ActionInput<Middlewares>, Output>)
          : undefined,
      )

      const syncSnapshot = () => {
        if (!container) {
          return
        }
        const submission = lastSubmission.value
        if (!submission) {
          container.actionStates.delete(id)
          return
        }
        container.actionStates.set(id, {
          error: submission.error,
          input: submission.input,
          result: submission.result,
        })
      }

      const invoke = async (input: ActionInput<Middlewares> | FormData) => {
        pending.value = true
        error.value = undefined
        const normalizedInput = normalizeFormSubmissionInput(input) as ActionInput<Middlewares>
        try {
          const value = (await invokeAction(id, input, container)) as Output
          result.value = value
          lastSubmission.value = {
            error: undefined,
            input: normalizedInput,
            result: value,
          }
          syncSnapshot()
          return value
        } catch (caught) {
          error.value = caught
          lastSubmission.value = {
            error: caught,
            input: normalizedInput,
            result: undefined,
          }
          syncSnapshot()
          throw caught
        } finally {
          pending.value = false
        }
      }

      const Form = (props: ActionFormProps) => {
        if (typeof document !== 'undefined') {
          return createActionFormNode(id, props) as unknown as JSX.Element
        }

        const nextProps: Record<string, unknown> = {
          ...props,
          [ACTION_FORM_ATTR]: id,
          method: 'post',
          children: [
            {
              isStatic: true,
              props: {
                name: ACTION_FORM_FIELD,
                type: 'hidden',
                value: id,
              },
              type: 'input',
            },
            props.children,
          ],
        }
        delete nextProps.action
        delete nextProps.method
        return {
          isStatic: true,
          props: nextProps,
          type: 'form',
        } satisfies JSX.Element
      }
      const actionHandle = setActionHandleMeta(
        {
          Form,
          action: invoke as ActionInvoker<ActionInput<Middlewares>, Output>,
          get error() {
            return error.value
          },
          get formActionId() {
            return id
          },
          get isPending() {
            return pending.value
          },
          get lastSubmission() {
            return lastSubmission.value
          },
          get result() {
            return result.value
          },
        } satisfies ActionHandle<ActionInput<Middlewares>, Output>,
        id,
      )
      container?.actions.set(id, actionHandle)
      syncSnapshot()
      return actionHandle
    }, id),
  ) as () => ActionHandle<ActionInput<Middlewares>, Output>

  return useActionHandle
}
