# JSX Layer

This file applies to `packages/eclipsa/jsx/`.

## Responsibility

- Define the JSX element shape used before transforms.
- Provide JSX dev/runtime entry points used by SSR and compiler stages.

## Guidance

- Keep this layer small.
- Runtime-specific client DOM behavior belongs in `core/` and `compiler/client`, not here.
- SSR rendering entry points must remain compatible with `core/ssr.ts`.
