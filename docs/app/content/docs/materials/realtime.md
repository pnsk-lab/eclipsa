---
title: Realtime
description: Use compiled realtime handlers for bidirectional WebSocket sessions.
---

# Realtime

`realtime()` is the bidirectional transport API for long-lived client and server sessions.

Use it when the client should open a WebSocket connection, send multiple messages, and receive server-pushed updates without modeling the exchange as separate actions.

## First example

Declare realtime handlers at module scope. The compiler rewrites each handler into a registered server symbol and returns a hook for components.

```tsx
import { realtime } from 'eclipsa'

const useRoom = realtime<{ roomId: string }, { text: string }, { from: string; text: string }>(
  async (connection) => {
    connection.send({
      from: 'system',
      text: `Joined ${connection.input.roomId}`,
    })

    connection.onMessage((message) => {
      connection.send({
        from: 'server',
        text: message.text,
      })
    })
  },
)

export default function Room() {
  const room = useRoom()

  return (
    <section>
      <button onClick={() => room.connect({ roomId: 'general' })} type="button">
        Connect
      </button>
      <button disabled={!room.isOpen} onClick={() => room.send({ text: 'Hello' })} type="button">
        Send
      </button>
      <p>Status: {room.status}</p>
      <p>Latest: {room.lastMessage?.text ?? 'No messages yet'}</p>
    </section>
  )
}
```

## Returned handle

A realtime handle such as `useRoom()` exposes:

- `connect(input)`: open the WebSocket session
- `send(message)`: send a typed client message
- `close(code?, reason?)`: close the current session
- `status`: `"closed"`, `"connecting"`, or `"open"`
- `isOpen`: whether the socket is currently open
- `lastMessage`: the latest server message
- `messages`: all server messages received by this handle
- `error`: the latest socket or frame decode error

`connect()` input is serialized into the connection URL. `send()` and incoming server messages use the same public serialization path as actions and loaders.

## Server connection API

The handler receives a typed connection based on the generic arguments passed to `realtime()`.

```tsx
import { realtime } from 'eclipsa'

const usePresence = realtime<
  { userId: string },
  { typing: boolean },
  { online: boolean; userId: string }
>(async (connection) => {
  connection.send({
    online: true,
    userId: connection.input.userId,
  })

  connection.onMessage((message) => {
    if (message.typing) {
      connection.send({
        online: true,
        userId: connection.input.userId,
      })
    }
  })

  connection.onClose(() => {
    // Release room membership, presence records, or other request-scoped state.
  })
})
```

The connection object exposes:

- `input`: the typed value passed to `connect(input)`
- `send(message)`: send a typed server message
- `onMessage(callback)`: receive typed client messages
- `onClose(callback)`: observe socket close events
- `onError(callback)`: observe socket errors
- `close(code?, reason?)`: close the socket from the server
- `c`: the request context

## Middleware

Realtime handlers use the same Hono-style middleware shape as loaders and actions.

```tsx
import { realtime, type RealtimeConnection, type RealtimeMiddleware } from 'eclipsa'

const requestMeta: RealtimeMiddleware<{
  Variables: {
    traceId: string
  }
}> = async (c, next) => {
  c.set('traceId', crypto.randomUUID())
  await next()
}

const useRoom = realtime(
  requestMeta,
  async (
    connection: RealtimeConnection<
      { roomId: string },
      { text: string },
      { traceId: string },
      {
        Variables: {
          traceId: string
        }
      }
    >,
  ) => {
    connection.send({
      traceId: connection.c.var.traceId,
    })
  },
)
```

Values written with `c.set()` in middleware are available as `connection.c.var` inside the handler.

## Host integration

`realtime()` compiles and registers server handlers the same way `action()` and `loader()` do.

Eclipsa does not choose a WebSocket runtime for you. Configure the Hono-compatible WebSocket adapter exported by your runtime in `app/+server-entry.ts`:

```ts
import { Hono } from 'hono'
import { upgradeWebSocket, websocket } from 'hono/bun'
import { defineRealtimeWebSocketAdapter } from 'eclipsa'

const app = new Hono()

export const realtimeWebSocket = defineRealtimeWebSocketAdapter({
  upgradeWebSocket,
})

export { websocket }
export default app
```

Eclipsa reads the `realtimeWebSocket` export and mounts `GET /__eclipsa/realtime/:id` with the supplied `upgradeWebSocket` handler.

During Vite development, Node WebSocket adapters should be configured as a factory so Eclipsa can pass its internal Hono app and inject the adapter into Vite's HTTP server:

```ts
import { Hono } from 'hono'
import { defineRealtimeWebSocketAdapter } from 'eclipsa'
import { createNodeRealtimeWebSocket } from './node-realtime-websocket'

const app = new Hono()

export const realtimeWebSocket = defineRealtimeWebSocketAdapter((realtimeApp) => {
  const { injectWebSocket, upgradeWebSocket } = createNodeRealtimeWebSocket(realtimeApp)
  return { injectWebSocket, upgradeWebSocket }
})

export default app
```

The factory form is the important part. It lets Node adapters, including wrappers around Hono's Node adapter, bind the generated realtime routes to Vite's active HTTP server instead of creating a separate server.

The adapter must follow Hono's WebSocket helper shape:

```ts
upgradeWebSocket((c) => ({
  onOpen(_event, ws) {},
  onMessage(event, ws) {},
  onClose(event, ws) {},
  onError(event, ws) {},
}))
```

Use the adapter import for your runtime, such as `hono/bun`, `hono/deno`, `hono/cloudflare-workers`, or `@hono/node-ws`.

## What realtime messages should contain

Realtime input and messages should stay public and serializable, such as:

- strings
- numbers
- booleans
- plain objects
- arrays

Use `action()` for one-shot mutations, `loader()` for route data, and `realtime()` for long-lived bidirectional sessions.
