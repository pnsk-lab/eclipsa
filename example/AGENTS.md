# Example App

This file applies to `example/` and its subdirectories unless overridden.

## Purpose

- This app is the primary end-to-end verification target for Eclipsa.
- Changes here should make framework behavior observable, not hide framework regressions.

## Expectations

- Keep the app small and explicit.
- Prefer simple UI that exercises signals, event handlers, nested components, and resumable activation.
- Keep scripts aligned with the framework workflow:
  - `bun run dev`
  - `bun run build`
  - `bun run start`

## Avoid

- Do not add app-specific abstractions unless they are needed to reproduce or verify framework behavior.
- Do not depend on code from `.contexts/`.

# Example App Routes

This file applies to `example/app/`.

## Structure

- `+page.tsx`: route component used for main interaction checks
- `+ssr-root.tsx`: HTML document shell for SSR
- `+server-entry.ts`: server entry used in dev and prod
- `+client.dev.tsx`: client boot entry

## Editing Guidance

- Keep route components focused on validating runtime and compiler behavior.
- If you add interactivity, prefer patterns that exercise:
  - `component$`
  - `useSignal`
  - `onX$`
  - nested components
  - list rendering through `For`

## Boot Contract

- Client boot should continue to use `resumeContainer(document)`.
- Server entry and SSR root should remain compatible with the Vite plugin contract in `packages/eclipsa/vite/`.
