---
title: Signal
description: Manage state with eclipsa's reactive signal.
---

# Signal

eclipsa uses Signal to manage state. Signal provides a fine-grained reactivity system that updates the UI efficiently when state changes, like SolidJS and Svelte.

```tsx
import { useSignal } from 'eclipsa'

export default function Counter() {
  const count = useSignal(0)

  return <button onClick={() => count.value++}>{count.value}</button>
}
```

To change a value, access `.value`.

## Watching signals

Use `useWatch` to watch signals.

```ts
const count = useSignal(0)

useWatch(() => {
  console.log(`Count changed: ${count.value}`)
})
```

Or, you can specify dependencies:

```ts
const count = useSignal(0)
useWatch(() => {
  console.log(`Count changed: ${count.value}`)
}, [count])
```

## Derived signals

Use `useComputed` to create a derived signal that automatically updates when its dependencies change.

```ts
const count = useSignal(0)
const doubleCount = useComputed(() => count.value * 2)
console.log(doubleCount.value) // 0
count.value = 1
console.log(doubleCount.value) // 2
```
