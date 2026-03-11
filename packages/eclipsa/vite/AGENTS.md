# Vite Integration

This file applies to `packages/eclipsa/vite/`.

## Responsibility

- Dev server integration
- SSR app loading in development
- client and SSR build wiring
- symbol module serving and build output naming

## Guidance

- Keep client and SSR compilation paths explicit.
- Symbol module loading must stay consistent between dev and prod.
- `+server-entry.ts` is the server entry contract for the example app.

## Checkpoints

- `bun run dev`
- `bun run build`
- Verify symbol modules load from `/entries/symbol__*.js` in production builds
