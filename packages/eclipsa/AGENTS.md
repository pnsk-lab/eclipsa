# Eclipsa Package

This file applies to `packages/eclipsa/` unless overridden.

## Responsibility

- Own the framework runtime, compiler pipeline, and Vite integration.
- Preserve the current model:
  - SSR emits resumable metadata
  - client code is DOM-compiled
  - events resume lazily through symbol modules

## Important Invariants

- `$`, `useSignal`, `For`, `resumeContainer`, and `renderSSR` are the core public surface.
- Client transforms and symbol transforms must stay consistent with runtime expectations.
- Avoid falling back to full route hydration when making runtime changes.

## Validation

- `bun run test --filter=eclipsa`
- `bunx tsc -p tsconfig.json --noEmit`

## Subsystems

- `core/`: runtime behavior
- `jsx/`: JSX element model and SSR rendering entry points
- `compiler/analyze/`: resumable symbol extraction and compile-time analysis
- `compiler/client/`: client DOM code generation
- `compiler/ssr/`: SSR JSX runtime code generation
- `compiler/shared/`: compiler utilities shared across stages
- `vite/`: dev/build integration
