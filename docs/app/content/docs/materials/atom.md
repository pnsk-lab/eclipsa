---
title: Atom
description: Global state management with eclipsa's atom.
---

# Atom

eclipsa's Atom provides a simple way to manage global state across your application. Atoms are reactive and can be used to share state between components without prop drilling.

```tsx
import { atom, useAtom } from 'eclipsa/atom'

const countAtom = atom(0)

function MyComponent() {
  const count = useAtom(countAtom)
  return (
    <div>
      <p>Count: {count.value}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  )
}
```
