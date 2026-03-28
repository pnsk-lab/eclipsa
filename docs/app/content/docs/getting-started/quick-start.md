---
title: Quick Start
description: A minimal markdown page rendered by @eclipsa/content.
---

# Quick Start

To create a new eclipsa project, use [create-eclipsa](https://npmx.dev/package/create-eclipsa):

```bash
bun create eclipsa
pnpm create eclipsa
deno run -A npm:create-eclipsa
yarn create eclipsa
npm create eclipsa
```

After created, run:

```bash
cd my-app
bun install # or pnpm install, deno task install, yarn install, npm install
bun dev # or pnpm dev, deno task dev, yarn dev, npm run dev
```

Context is available from `eclipsa`:

```tsx
import { createContext, useContext } from 'eclipsa'

const ThemeContext = createContext<'light' | 'dark'>()

function ThemeLabel() {
  const theme = useContext(ThemeContext)
  return <p>Theme: {theme}</p>
}

export default function App() {
  return (
    <ThemeContext.Provider value="dark">
      <ThemeLabel />
    </ThemeContext.Provider>
  )
}
```

Animation primitives are available from `@eclipsa/motion`:

```tsx
import { motion } from '@eclipsa/motion'

export default function Hero() {
  return (
    <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      Hello motion
    </motion.h1>
  )
}
```
