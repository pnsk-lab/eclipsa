# Getting Started

## Create A New App

- Start with `npm create eclipsa@latest`.
- The starter prompts for a project name and a toolchain.
- Current toolchain choices are `vite` and `vite-plus`.

## Starter Commands

After scaffolding, the normal workflow is:

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run start`
- `bun run typecheck`

## Starter Shape

A fresh app includes:

- `app/+page.tsx`: the first route page.
- `app/+client.dev.tsx`: client resume entry.
- `app/+server-entry.ts`: Hono server entry.
- `app/+ssr-root.tsx`: HTML shell used during SSR.
- `vite.config.ts`: Eclipsa Vite plugin wiring.

## Mental Model

- Eclipsa renders on the server first.
- Client interactivity resumes from the server output.
- Normal app code should be written with that SSR plus resume model in mind.
