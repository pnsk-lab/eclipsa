import {
  action$,
  validator,
  type ActionFormProps,
  type ActionHandle,
  type ActionMiddleware,
  type ActionSubmission,
  type StandardSchemaV1,
} from './action.ts'

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Expect<T extends true> = T

const userMiddleware: ActionMiddleware<{
  Variables: {
    traceId: string
    user: {
      id: string
    }
  }
}> = async (c, next) => {
  c.set('traceId', 'trace')
  c.set('user', { id: 'user-1' })
  await next()
}

const sumSchema = {
  '~standard': {
    types: undefined as unknown as {
      input: {
        left: string
        right: string
      }
      output: {
        left: number
        right: number
      }
    },
    validate(value: unknown) {
      return { value: value as { left: number; right: number } }
    },
    vendor: 'typecheck',
    version: 1 as const,
  },
} satisfies StandardSchemaV1<{ left: string; right: string }, { left: number; right: number }>

const useSum = action$(userMiddleware, validator(sumSchema), async (c) => {
  type _Input = Expect<Equal<typeof c.var.input, { left: number; right: number }>>
  type _TraceId = Expect<Equal<typeof c.var.traceId, string>>
  type _User = Expect<Equal<typeof c.var.user, { id: string }>>

  return {
    total: c.var.input.left + c.var.input.right,
    userId: c.var.user.id,
  }
})

type SumHandle = ReturnType<typeof useSum>
type _Handle = Expect<
  Equal<
    SumHandle,
    ActionHandle<
      { left: string; right: string },
      {
        total: number
        userId: string
      }
    >
  >
>

type _Form = Expect<Equal<Parameters<SumHandle['Form']>[0], ActionFormProps>>
type _Submission = Expect<
  Equal<
    SumHandle['lastSubmission'],
    | ActionSubmission<
        { left: string; right: string },
        {
          total: number
          userId: string
        }
      >
    | undefined
  >
>

declare const sumHandle: SumHandle
sumHandle.action({ left: '1', right: '2' })
sumHandle.action(new FormData())
// @ts-expect-error Validated action input remains required.
sumHandle.action()
// @ts-expect-error Input type comes from schema input, not output.
sumHandle.action({ left: 1, right: 2 })

const usePing = action$(async () => 'pong')

type PingHandle = ReturnType<typeof usePing>
type _Ping = Expect<Equal<PingHandle, ActionHandle<unknown, string>>>

declare const pingHandle: PingHandle
pingHandle.action()
pingHandle.action('value')
