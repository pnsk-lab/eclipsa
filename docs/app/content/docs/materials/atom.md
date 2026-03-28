---
title: Atom
description: Share state across distant components with eclipsa's atom.
---

# Atom

`atom()` creates a shared state container outside component scope.

If `useSignal()` is local component state, `atom()` is shared state that multiple components can read.

## First example

```tsx
import { atom, useAtom } from 'eclipsa/atom'

const countAtom = atom(0)

function Counter() {
  const count = useAtom(countAtom)

  return <button onClick={() => count.value++}>Count: {count.value}</button>
}
```

`useAtom()` returns a `Signal<T>`, so you read and write through `.value`.

## When to use atom

`atom()` is a good fit when you want to:

- Share the same UI state between distant parts of the tree
- Avoid passing props through many layers
- Keep small app-wide state in a lightweight way

If the state only matters inside one component, `useSignal()` is usually simpler.

## Shared across components

```tsx
import { atom, useAtom } from 'eclipsa/atom'

const sidebarOpenAtom = atom(true)

function SidebarToggle() {
  const sidebarOpen = useAtom(sidebarOpenAtom)

  return (
    <button onClick={() => (sidebarOpen.value = !sidebarOpen.value)}>
      {sidebarOpen.value ? 'Close' : 'Open'}
    </button>
  )
}

function Sidebar() {
  const sidebarOpen = useAtom(sidebarOpenAtom)

  return <aside hidden={!sidebarOpen.value}>Menu</aside>
}
```

Both components read the same atom, so updates propagate automatically.

## Creating atoms

Atoms are usually created at module scope.

```tsx
import { atom } from 'eclipsa/atom'

export const currentTabAtom = atom<'overview' | 'api'>('overview')
```

If you call `atom()` during render, you create a new shared container every time. Put shared atoms outside the component.

## Derived values

Atoms do not have a built-in derived API. Use them together with `useComputed$()` or `useWatch()` when needed.

```tsx
import { useComputed$ } from 'eclipsa'
import { atom, useAtom } from 'eclipsa/atom'

const itemsAtom = atom([
  { id: 1, done: false },
  { id: 2, done: true },
])

function Summary() {
  const items = useAtom(itemsAtom)
  const completed = useComputed$(() => items.value.filter((item) => item.done).length)

  return <p>{completed.value} completed</p>
}
```

## Rules

- `useAtom()` はコンポーネントのトップレベルで呼びます
- `useAtom()` can only receive values created by `atom()`
- Avoid using atoms for state that does not actually need to be shared

## Choosing between signal and atom

Choose `useSignal()` when:

- The state only belongs to one component
- You are handling temporary form input
- You are modeling local UI state such as hover, open, or selected

Choose `atom()` when:

- Multiple distant components need the same state
- You want to share shell-level app state
- You want to avoid passing props through many layers
