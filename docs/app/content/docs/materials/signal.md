---
title: Signal
description: Build reactive local state with eclipsa signals.
---

# Signal

`useSignal()` is the basic state primitive in eclipsa.

When you read and write through `.value`, only the UI that depends on that value updates.

## First example

```tsx
import { useSignal } from 'eclipsa'

export default function Counter() {
  const count = useSignal(0)

  return <button onClick={() => count.value++}>Count: {count.value}</button>
}
```

## Why signals

Signals are designed for fine-grained updates instead of rerunning the whole component tree.

They work well for local state such as:

- Counters and tabs
- Open / close state
- Input values
- Animation or interaction flags

## Reading and writing

```tsx
const name = useSignal('Ada')

console.log(name.value)
name.value = 'Grace'
```

You can also store objects and arrays.

```tsx
const form = useSignal({
  email: '',
  subscribed: false,
})

form.value = {
  ...form.value,
  subscribed: true,
}
```

## Watching changes

Use `useWatch()` when you need side effects.

```tsx
import { useSignal, useWatch } from 'eclipsa'

export default function DebugCounter() {
  const count = useSignal(0)

  useWatch(() => {
    console.log('count changed:', count.value)
  })

  return <button onClick={() => count.value++}>{count.value}</button>
}
```

If you want to make dependencies explicit, use the second argument.

```tsx
useWatch(() => {
  console.log(count.value)
}, [count])
```

## Derived state

Use `useComputed()` for values derived from other signals.

```tsx
import { useComputed, useSignal } from 'eclipsa'

export default function Price() {
  const quantity = useSignal(2)
  const price = useSignal(1200)
  const total = useComputed(() => quantity.value * price.value)

  return <p>Total: {total.value}</p>
}
```

If you want to make dependencies explicit, use the second argument.

```tsx
const total = useComputed(() => quantity.value * price.value, [quantity, price])
```

You also read `useComputed()` values through `.value`.

## Async computed values

You can also model asynchronous derived values.

```tsx
import { Suspense, useComputed, useSignal } from 'eclipsa'

function SearchResult() {
  const query = useSignal('eclipsa')
  const result = useComputed(async () => {
    const response = await fetch(`/api/search?q=${query.value}`)
    return response.json()
  }, [query])

  return <pre>{JSON.stringify(result.value, null, 2)}</pre>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SearchResult />
    </Suspense>
  )
}
```

Async computed values suspend while pending, so they are usually used together with `Suspense`.

## Local vs shared state

`useSignal()` is for local state.

If you need to share state across distant components, use `atom()` from `eclipsa/atom`.

## Rules

- Call `useSignal()` at the top level of the component
- Read and write values through `.value`
- Keep derived values in `useComputed()` and side effects in `useWatch()` for clearer code
