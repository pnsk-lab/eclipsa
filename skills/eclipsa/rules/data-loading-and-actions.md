# Data Loading And Actions

## `loader()`

- Use `loader()` for route data in pages and layouts.
- A loader works for initial SSR and later client navigation with the same API.
- A loader handle exposes:
  - `data`
  - `error`
  - `isLoading`
  - `load()`

## Concrete Loader Example

Declare loaders at module scope:

```tsx
import { loader, type LoaderMiddleware } from 'eclipsa'

const requestMeta: LoaderMiddleware<{
  Variables: {
    traceId: string
  }
}> = async (c, next) => {
  c.set('traceId', 'trace-dashboard')
  await next()
}

const useTeamLoader = loader(requestMeta, async (c) => {
  const teamId = c.req.param('teamId')

  return {
    name: `Team ${teamId}`,
    traceId: c.var.traceId,
  }
})
```

```tsx
export default function TeamPage() {
  const team = useTeamLoader()

  return (
    <section>
      <h1>{team.data?.name ?? 'Loading team...'}</h1>
      <p>{team.error ? 'Failed to load team.' : `trace: ${team.data?.traceId ?? 'pending'}`}</p>
      <button disabled={team.isLoading} onClick={() => void team.load()} type="button">
        Refresh
      </button>
    </section>
  )
}
```

## Loader Guidance

- Read route params from the request context, for example `c.req.param('slug')`.
- Use `load()` for manual refresh.
- Return public, serializable data such as strings, numbers, booleans, arrays, and plain objects.
- Do not design loaders around `Response` or `ReadableStream` results.
- Keep `loader()` at module scope so the compiler can register it once.

## Loader Middleware

- Use loader middleware when request-scoped shared values are needed.
- Values set with `c.set()` become available through `c.var` in the loader handler.

## `action()`

- Use `action()` for mutations, submissions, and side effects.
- An action handle exposes:
  - `Form`
  - `action()`
  - `isPending`
  - `result`
  - `error`
  - `lastSubmission`

## Concrete Action Example

Declare actions at module scope too:

```tsx
import { action, useSignal } from 'eclipsa'

const useSaveProfile = action(async (c) => {
  const name = String(c.var.input?.name ?? '').trim()

  return {
    name,
    saved: name.length > 0,
  }
})
```

```tsx
export default function ProfileEditor() {
  const name = useSignal('Ada')
  const saveProfile = useSaveProfile()

  return (
    <section>
      <label>
        Name
        <input
          name="name"
          onInput={(event: InputEvent) => {
            name.value = (event.currentTarget as HTMLInputElement).value
          }}
          value={name.value}
        />
      </label>
      <button
        disabled={saveProfile.isPending}
        onClick={() => void saveProfile.action({ name: name.value })}
        type="button"
      >
        Save
      </button>
      <saveProfile.Form class="stack">
        <input name="name" value={name.value} />
        <button disabled={saveProfile.isPending} type="submit">
          Save with form submit
        </button>
      </saveProfile.Form>
      <p>{saveProfile.result?.saved ? `Saved ${saveProfile.result.name}` : 'Not saved yet'}</p>
      <p>{saveProfile.error ? 'Save failed.' : 'No error'}</p>
    </section>
  )
}
```

## Action Guidance

- Use `Form` for native form submission.
- Use `action(input)` for programmatic submission.
- Keep action input and output serializable.
- Use `validator()` to validate and transform incoming input before the handler runs.
- Standard Schema based validators and adapters such as Zod or valibot fit well here.
- Keep `action()` at module scope so the compiler can register it once.

## Action Middleware

- Actions can use middleware in the same Hono-style pattern as loaders.
- Values written with `c.set()` are read back through `c.var`.

## Streaming

- Actions may return async generators or readable streams when the UI should consume progressive results.

## `realtime()`

- Use `realtime()` for long-lived bidirectional WebSocket sessions.
- Keep realtime handlers at module scope so the compiler can register them once.
- A realtime handle exposes:
  - `connect(input)`
  - `send(message)`
  - `close(code?, reason?)`
  - `status`
  - `isOpen`
  - `lastMessage`
  - `messages`
  - `error`

## Concrete Realtime Example

Declare realtime handlers at module scope:

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
```

```tsx
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

## Realtime Guidance

- Use `connect(input)` to open the WebSocket session.
- Use `send(message)` only after the handle is open.
- Read connection input from `connection.input` on the server.
- Use `connection.onMessage()` for client-to-server messages.
- Use `connection.send()` for server-to-client messages.
- Keep input and messages public and serializable.
- Host integrations that support WebSocket upgrade should route `__eclipsa/realtime/:id` upgrades to `executeRealtime(id, c, socket, input?)`.
