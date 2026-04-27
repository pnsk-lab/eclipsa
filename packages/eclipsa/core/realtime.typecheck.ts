import {
  realtime,
  type RealtimeConnection,
  type RealtimeHandle,
  type RealtimeMiddleware,
} from './realtime.ts'

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Expect<T extends true> = T

const userMiddleware: RealtimeMiddleware<{
  Variables: {
    traceId: string
  }
}> = async (c, next) => {
  c.set('traceId', 'trace')
  await next()
}

const useRoom = realtime(
  userMiddleware,
  async (
    connection: RealtimeConnection<
      { room: string },
      { text: string },
      { text: string; traceId: string },
      {
        Variables: {
          traceId: string
        }
      }
    >,
  ) => {
    type _TraceId = Expect<Equal<typeof connection.c.var.traceId, string>>

    connection.onMessage((message) => {
      connection.send({
        text: message.text,
        traceId: connection.c.var.traceId,
      })
    })
  },
)

type RoomHandle = ReturnType<typeof useRoom>
type _Handle = Expect<
  Equal<
    RoomHandle,
    RealtimeHandle<{ room: string }, { text: string }, { text: string; traceId: string }>
  >
>

declare const room: RoomHandle
room.connect({ room: 'main' })
// @ts-expect-error Realtime connection input remains required.
room.connect()
room.send({ text: 'hello' })
// @ts-expect-error Client messages keep their declared payload type.
room.send({ value: 'hello' })
