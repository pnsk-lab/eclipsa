# Getting Started

## Create A New App

- Start with `npm create eclipsa@latest`.
- The starter prompts for a project name and a toolchain.
- Current toolchain choices are `vite` and `vite-plus`.

## Fast Path

```bash
npm create eclipsa@latest
cd my-app
bun install
bun run dev
```

## Starter Commands

After scaffolding, the normal workflow is:

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run start`
- `bun run typecheck`

If the user picked `vite-plus`, the same workflow may also be available through `vp dev`, `vp build`, and `vp run typecheck`.

## Starter Shape

A fresh app includes:

- `app/+page.tsx`: the first route page.
- `app/+client.dev.tsx`: client resume entry.
- `app/+server-entry.ts`: Hono server entry.
- `app/+ssr-root.tsx`: HTML shell used during SSR.
- `vite.config.ts`: Eclipsa Vite plugin wiring.

## First Useful Edit

The starter page is intentionally small. A realistic first edit looks like this:

```tsx
import { Link, useSignal } from 'eclipsa'

export default function Page() {
  const count = useSignal(0)

  return (
    <main>
      <h1>Hello from Eclipsa</h1>
      <p>The starter is wired for SSR first and resumable client updates.</p>
      <button onClick={() => count.value++} type="button">
        Count: {count.value}
      </button>
      <p>
        <Link href="/dashboard">Open the dashboard</Link>
      </p>
    </main>
  )
}
```

## Mental Model

- Eclipsa renders on the server first.
- Client interactivity resumes from the server output.
- Normal app code should be written with that SSR plus resume model in mind.
