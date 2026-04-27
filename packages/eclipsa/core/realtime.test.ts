import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AppContext } from './hooks.ts'
import {
  __eclipsaRealtime,
  createRealtimeHonoUpgradeHandler,
  executeRealtime,
  registerRealtime,
  type RealtimeConnection,
  type RealtimeHonoWebSocketEvents,
  type RealtimeSocketLike,
} from './realtime.ts'
import type { RuntimeContainer } from './runtime.ts'
import { withRuntimeContainer } from './runtime.ts'

class FakeSocket implements RealtimeSocketLike {
  listeners = new Map<string, Array<(event: any) => void>>()
  sent: string[] = []

  addEventListener(type: string, listener: (event: any) => void) {
    const existing = this.listeners.get(type) ?? []
    existing.push(listener)
    this.listeners.set(type, existing)
  }

  close = vi.fn()

  dispatch(type: string, event: any) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }

  send(data: string) {
    this.sent.push(data)
  }
}

const createRuntimeContainer = (): RuntimeContainer =>
  ({
    actions: new Map(),
    actionStates: new Map(),
    asyncSignalSnapshotCache: new Map(),
    asyncSignalStates: new Map(),
    atoms: new WeakMap(),
    components: new Map(),
    dirty: new Set(),
    dirtyFlushQueued: false,
    eventBindingScopeCache: new Map(),
    eventDispatchPromise: null,
    externalRenderCache: new Map(),
    hasRuntimeRefMarkers: false,
    id: 'rt-test',
    imports: new Map(),
    insertMarkerLookup: new Map(),
    interactivePrefetchCheckQueued: false,
    loaderStates: new Map(),
    loaders: new Map(),
    materializedScopes: new Map(),
    nextAtomId: 0,
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
    pendingSuspensePromises: new Set(),
    resumeReadyPromise: null,
    rootChildCursor: 0,
    router: null,
    scopes: new Map(),
    signals: new Map(),
    symbols: new Map(),
    visibilityCheckQueued: false,
    visibilityListenersCleanup: null,
    visibles: new Map(),
    watches: new Map(),
  }) satisfies RuntimeContainer

describe('realtime runtime', () => {
  it('executes registered realtime handlers over a socket adapter', async () => {
    const app = new Hono()
    let context: AppContext | null = null
    app.get('/realtime', (c) => {
      context = c as unknown as AppContext
      return c.text('ok')
    })
    const socket = new FakeSocket()
    const received: unknown[] = []

    registerRealtime(
      'room',
      [],
      async (
        connection: RealtimeConnection<{ room: string }, { text: string }, { echo: string }>,
      ) => {
        expect(connection.input).toEqual({ room: 'main' })
        connection.send({ echo: 'ready' })
        connection.onMessage((message) => {
          received.push(message)
          connection.send({ echo: message.text })
        })
      },
    )

    await app.request('http://localhost/realtime?input=null')
    expect(context).toBeTruthy()
    await executeRealtime('room', context!, socket, { room: 'main' })

    expect(JSON.parse(socket.sent[0] ?? '')).toMatchObject({ type: 'message' })
    socket.dispatch('message', {
      data: JSON.stringify({
        type: 'message',
        value: {
          __eclipsa_type: 'object',
          entries: [['text', 'hello']],
        },
      }),
    })
    await Promise.resolve()

    expect(received).toEqual([{ text: 'hello' }])
    expect(JSON.parse(socket.sent[1] ?? '')).toMatchObject({ type: 'message' })
  })

  it('adapts Hono WebSocket event handlers into realtime sockets', async () => {
    const app = new Hono()
    let events: RealtimeHonoWebSocketEvents | null = null
    const ws = {
      close: vi.fn(),
      sent: [] as string[],
      send(data: string) {
        this.sent.push(data)
      },
    }

    registerRealtime(
      'hono-room',
      [],
      async (
        connection: RealtimeConnection<{ room: string }, { text: string }, { text: string }>,
      ) => {
        connection.send({ text: `joined ${connection.input.room}` })
        connection.onMessage((message) => {
          connection.send(message)
        })
      },
    )

    app.get(
      '/realtime/:id',
      createRealtimeHonoUpgradeHandler(
        (createEvents) => (c) => {
          events = createEvents(c)
          return c.text('upgraded')
        },
        async (c, socket) => {
          await executeRealtime(c.req.param('id'), c as unknown as AppContext, socket, {
            room: 'main',
          })
        },
      ),
    )

    const response = await app.request('http://localhost/realtime/hono-room')
    expect(response.status).toBe(200)
    expect(events).toBeTruthy()

    await Promise.resolve()
    expect(ws.sent).toEqual([])

    await events!.onOpen?.(new Event('open'), ws)
    expect(JSON.parse(ws.sent[0] ?? '')).toMatchObject({ type: 'message' })

    await events!.onMessage?.(
      {
        data: JSON.stringify({
          type: 'message',
          value: {
            __eclipsa_type: 'object',
            entries: [['text', 'hello']],
          },
        }),
      },
      ws,
    )
    await Promise.resolve()
    expect(JSON.parse(ws.sent[1] ?? '')).toMatchObject({ type: 'message' })
  })

  it('connects client handles with WebSocket transport and records messages', () => {
    const sockets: FakeBrowserWebSocket[] = []
    const OriginalWebSocket = globalThis.WebSocket

    class FakeBrowserWebSocket extends EventTarget {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3

      readyState = FakeBrowserWebSocket.CONNECTING
      sent: string[] = []
      url: string

      constructor(url: string) {
        super()
        this.url = url
        sockets.push(this)
      }

      close() {
        this.readyState = FakeBrowserWebSocket.CLOSED
        this.dispatchEvent(new Event('close'))
      }

      open() {
        this.readyState = FakeBrowserWebSocket.OPEN
        this.dispatchEvent(new Event('open'))
      }

      receive(data: string) {
        this.dispatchEvent(new MessageEvent('message', { data }))
      }

      send(data: string) {
        this.sent.push(data)
      }
    }

    globalThis.WebSocket = FakeBrowserWebSocket as unknown as typeof WebSocket

    try {
      const container = createRuntimeContainer()
      const useRoom = __eclipsaRealtime(
        'client-room',
        [],
        async (
          _connection: RealtimeConnection<{ room: string }, { text: string }, { text: string }>,
        ) => {},
      )
      const room = withRuntimeContainer(container, () => useRoom())

      room.connect({ room: 'main' })
      expect(room.status).toBe('connecting')
      expect(sockets[0]?.url).toContain('/__eclipsa/realtime/client-room')

      sockets[0]!.open()
      expect(room.isOpen).toBe(true)
      room.send({ text: 'hello' })
      expect(JSON.parse(sockets[0]!.sent[0] ?? '')).toMatchObject({ type: 'message' })

      sockets[0]!.receive(
        JSON.stringify({
          type: 'message',
          value: {
            __eclipsa_type: 'object',
            entries: [['text', 'world']],
          },
        }),
      )
      expect(room.lastMessage).toEqual({ text: 'world' })
      expect(room.messages).toEqual([{ text: 'world' }])
    } finally {
      globalThis.WebSocket = OriginalWebSocket
    }
  })
})
