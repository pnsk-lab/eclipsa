# Core Runtime

This file applies to `packages/eclipsa/core/`.

## Responsibility

- Runtime container lifecycle
- signal records and subscriptions
- resumable payload encode/decode
- delegated event dispatch
- client activation and focused DOM updates

## Editing Guidance

- Preserve stable behavior across SSR pause and client resume.
- Treat focus, selection, and DOM identity as runtime responsibilities, especially during first activation.
- Prefer narrow DOM updates over rebuilding large subtrees.

## Avoid

- Do not move JSX compilation logic into `core/`.
- Do not introduce route-level hydration shortcuts here.

## Files

- `runtime.ts`: main resumable runtime
- `resume.ts`: client boot from SSR payload
- `ssr.ts`: SSR entry helpers
- `signal.ts`: public signal/effect APIs
