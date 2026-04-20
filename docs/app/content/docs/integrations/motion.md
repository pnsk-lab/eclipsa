---
title: Motion
description: Animate Eclipsa components with @eclipsa/motion.
---

# Motion

[motion](https://motion.dev/) (fka framer-motion) integration for eclipsa.

## Installation

Install `@eclipsa/motion`:

```bash
bun add @eclipsa/motion
pnpm add @eclipsa/motion
yarn add @eclipsa/motion
npm install @eclipsa/motion
```

## Usage

Animate elements with the familiar `motion.div` API:

```tsx
import { motion, AnimatePresence, MotionConfig } from '@eclipsa/motion'
import { useSignal } from 'eclipsa'

export default function Page() {
  const open = useSignal(true)

  return (
    <MotionConfig transition={{ duration: 0.2 }}>
      <button onClick={() => (open.value = !open.value)}>Toggle</button>
      <AnimatePresence>
        {open.value && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            hello motion
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
```

The current package includes:

- `motion` / `m`
- `MotionConfig`
- `AnimatePresence`
- `LayoutGroup`
- `Reorder`
- `animate`, `delay`, `stagger`, `spring`
- motion value hooks like `useAnimate`, `useMotionValue`, `useTransform`, and `useScroll`
