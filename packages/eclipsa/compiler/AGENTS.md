# Compiler

This file applies to `packages/eclipsa/compiler/`.

## Responsibility

- Own the internal compiler pipeline.
- Keep analyze, client, and SSR stages intentionally separate.

## Current Contract

- `analyze/` extracts resumable symbols and validates captures.
- `client/` emits DOM-compiled code using helpers from `eclipsa/client`.
- `ssr/` emits JSX runtime objects for server rendering.
- `shared/` contains compiler utilities only.

## Guidance

- Do not mix client DOM helper imports into SSR transforms.
- Keep stage boundaries obvious in imports and naming.
- Keep generated code simple enough to debug from snapshots and built output.
