# <img src="./docs/eclipsa.svg" align="right" width="128" alt=""> eclipsa

[![npm](https://img.shields.io/npm/v/eclipsa)](https://www.npmjs.com/package/eclipsa)
[![codecov](https://codecov.io/github/pnsk-lab/eclipsa/graph/badge.svg)](https://codecov.io/github/pnsk-lab/eclipsa)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/pnsk-lab/eclipsa)

eclipsa is a frontend framework, built on Vite Environment API and Hono.

```tsx
// app/+page.tsx
import { useSignal } from 'eclipsa'

export default function Page() {
  const count = useSignal(0)

  return <button onClick={() => count.value++}>
    Count: {count.value]
  </button>
}
```

## Quick Start

```bash
npm create eclipsa@latest
# or use the package manager you like
```

## Features

* 🚥 Signal APIs like [preact](https://preactjs.com/guide/v10/signals/), [Qwik](https://qwik.dev/) and [Vue](https://vuejs.org)
* ▶️ Resumability like [Qwik](https://qwik.dev/)
* 🔍 Fine-grained Reactivity like [Solid.js](https://www.solidjs.com/) and [Svelte](https://svelte.dev/)
* 🏎️ JSX Compile like [Solid.js](https://www.solidjs.com/)
* ✏️ Content Management System like [Astro](https://astro.build/)
