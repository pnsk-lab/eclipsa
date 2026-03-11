# Compiler Analyze

This file applies to `packages/eclipsa/compiler/analyze/`.

## Responsibility

- Analyze TSX modules for resumable symbols.
- Extract component, event, and lazy symbols.
- Enforce resumable capture rules at compile time.

## Guidance

- Keep the analyze stage deterministic. Snapshot tests should remain readable and stable.
- Prefer compile-time errors for unsupported captures over runtime fallbacks.
- Preserve clean-room implementation. `.contexts/` is reference-only.

## Validation

- `bun run test --filter=eclipsa`
- Review `snapshots/*.snap` after analyze-stage changes.
