---
title: Action
description: Mutate server state with typed actions that work with forms, validation, and resume.
---

# Action

`action()` is the mutation API for eclipsa.

Use it when the client should submit data to the server, run side effects, and reflect the latest submission state back into the UI.

## First example

```tsx
import { action } from 'eclipsa'

const useCreateTodo = action(async () => {
  return {
    ok: true,
  }
})

export default function TodoComposer() {
  const createTodo = useCreateTodo()

  return (
    <button disabled={createTodo.isPending} onClick={() => void createTodo.action()}>
      {createTodo.isPending ? 'Saving...' : 'Create todo'}
    </button>
  )
}
```

## Returned handle

An action handle such as `useCreateTodo()` exposes:

- `Form`: a form component that posts to the action endpoint
- `action()`: a function that submits input programmatically
- `isPending`: whether a submission is in flight
- `result`: the latest successful result
- `error`: the latest submission error
- `lastSubmission`: the latest submission snapshot including `input`, `result`, and `error`

## Form submission

Use `Form` when the mutation should be triggered by a native form submit.

```tsx
import { action, validator, type StandardSchemaV1 } from 'eclipsa'

const formSchema = {
  '~standard': {
    types: undefined as unknown as {
      input: { title: string }
      output: { title: string }
    },
    validate(value: unknown) {
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as Record<string, unknown>).title === 'string'
      ) {
        return { value: value as { title: string } }
      }

      return {
        issues: [{ message: 'title is required' }],
      }
    },
    vendor: 'docs',
    version: 1 as const,
  },
} satisfies StandardSchemaV1<{ title: string }, { title: string }>

const useCreateTodo = action(validator(formSchema), async (c) => {
  return { title: c.var.input.title }
})

export default function TodoForm() {
  const createTodo = useCreateTodo()

  return (
    <createTodo.Form class="flex gap-2">
      <input name="title" />
      <button disabled={createTodo.isPending} type="submit">
        Add
      </button>
    </createTodo.Form>
  )
}
```

When a form submits, eclipsa normalizes the `FormData` payload and sends it through the same action pipeline as `action()`.

## Programmatic input

Pass JSON-serializable input directly when you want to submit from event handlers.

```tsx
import { action } from 'eclipsa'

const useRename = action(async (c) => {
  return {
    savedName: c.var.input?.name ?? '',
  }
})

export default function RenameButton() {
  const rename = useRename()

  return <button onClick={() => void rename.action({ name: 'eclipsa' })}>Rename</button>
}
```

## Validation

Use `validator()` to validate and transform incoming input before it reaches the action handler.

```tsx
import { action, validator, type StandardSchemaV1 } from 'eclipsa'

const todoSchema = {
  '~standard': {
    types: undefined as unknown as {
      input: { title: string }
      output: { title: string }
    },
    validate(value: unknown) {
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as Record<string, unknown>).title === 'string'
      ) {
        return { value: value as { title: string } }
      }

      return {
        issues: [{ message: 'title is required' }],
      }
    },
    vendor: 'docs',
    version: 1 as const,
  },
} satisfies StandardSchemaV1<{ title: string }, { title: string }>

const useCreateTodo = action(validator(todoSchema), async (c) => {
  return {
    title: c.var.input.title,
  }
})
```

After validation, the transformed value is available as `c.var.input`.

## Middleware

Actions can use middleware the same way loaders do.

```tsx
import { action, type ActionMiddleware } from 'eclipsa'

const requestMeta: ActionMiddleware<{
  Variables: {
    traceId: string
  }
}> = async (c, next) => {
  c.set('traceId', crypto.randomUUID())
  await next()
}

const useCheckout = action(requestMeta, async (c) => {
  return {
    traceId: c.var.traceId,
  }
})
```

Values written with `c.set()` in middleware are available as `c.var` inside the handler.

## Streaming results

Actions can also return async generators or readable streams.

```tsx
import { action } from 'eclipsa'

const useCounter = action(async function* () {
  yield 0
  yield 1
})
```

In that case, `action()` returns an async generator and `result` tracks the latest emitted value.

## What actions should accept and return

Action input and output should stay public and serializable, such as:

- strings
- numbers
- booleans
- plain objects
- arrays
- `FormData` for native form submission

Avoid passing opaque server-only objects unless they are values explicitly supported by eclipsa's action serialization.
