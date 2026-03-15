import { loader$, type LoaderHandle, type LoaderMiddleware } from './loader.ts'

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Expect<T extends true> = T

const requestMeta: LoaderMiddleware<{
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

const useProfile = loader$(requestMeta, async (c) => {
  type _TraceId = Expect<Equal<typeof c.var.traceId, string>>
  type _User = Expect<Equal<typeof c.var.user, { id: string }>>

  return {
    traceId: c.var.traceId,
    userId: c.var.user.id,
  }
})

type ProfileHandle = ReturnType<typeof useProfile>
type _Handle = Expect<
  Equal<
    ProfileHandle,
    LoaderHandle<{
      traceId: string
      userId: string
    }>
  >
>

declare const profileHandle: ProfileHandle
profileHandle.load()
// @ts-expect-error loader$ does not accept client input.
profileHandle.load('value')

const usePing = loader$(async () => 'pong')

type PingHandle = ReturnType<typeof usePing>
type _Ping = Expect<Equal<PingHandle, LoaderHandle<string>>>
