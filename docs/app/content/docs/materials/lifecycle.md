---
title: Lifecycle
description: Run effects and DOM-aware hooks at the right timing in eclipsa.
---

# Lifecycle

In eclipsa, state usually lives in `useSignal()`, while timing-sensitive behavior belongs in lifecycle hooks.

The four most common hooks are:

- `useWatch()`: run side effects when dependencies change
- `onMount()`: run once after mount
- `onCleanup()`: clean up subscriptions and resources
- `onVisible()`: run when the element becomes visible

## `useWatch()`

Use this when behavior should react to signal changes.

```tsx
import { useSignal, useWatch } from 'eclipsa'

export default function SearchLogger() {
  const query = useSignal('')

  useWatch(() => {
    console.log('query:', query.value)
  })

  return <input value={query.value} onInput={(e) => (query.value = e.currentTarget.value)} />
}
```

`useWatch()` is for side effects, not for deriving values.

## `onMount()`

Use this when you need to run something once after the DOM is available.

```tsx
import { onMount } from 'eclipsa'

export default function Page() {
  onMount(() => {
    console.log('mounted')
  })

  return <div>Ready</div>
}
```

Common cases:

- Initial DOM measurement
- Third-party library setup
- Client-only work that should happen after mount

## `onCleanup()`

Use this to clean up event listeners, timers, and similar resources.

```tsx
import { onCleanup, onMount } from 'eclipsa'

export default function Clock() {
  onMount(() => {
    const timer = window.setInterval(() => {
      console.log('tick')
    }, 1000)

    onCleanup(() => {
      window.clearInterval(timer)
    })
  })

  return <div>Clock</div>
}
```

If mount logic starts something, keep the cleanup close to it.

## `onVisible()`

Use this when work should start only after the element becomes visible.

```tsx
import { onVisible } from 'eclipsa'

export default function Hero() {
  onVisible(() => {
    console.log('hero became visible')
  })

  return <section>Hero</section>
}
```

Common cases:

- Delayed animation start
- Measurement after visibility
- Deferring heavy work in lower sections of the page

## Choosing the right hook

`useWatch()`:

- Side effects based on signals
- Behavior that should track changing values

`onMount()`:

- One-time work
- DOM-dependent logic

`onCleanup()`:

- Removing listeners or timers
- Cleaning up resources created by mount or watch logic

`onVisible()`:

- Work that should start after the element enters the viewport

## Rule of thumb

- Keep UI values in `useSignal()` or `useComputed$()`
- Put console, analytics, DOM APIs, and timers in hooks
- Keep setup and cleanup close together
