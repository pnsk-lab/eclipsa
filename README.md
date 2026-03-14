# eclipsa

<img src="./docs/eclipsa.svg" align="right" width="128">

eclipsa is a frontend framework, built on Vite Environment API and Hono.

## Development

```bash
bun install
bun run dev
```

## Build

```bash
bun run pack
```

`packages/eclipsa/vite.config.ts` uses `vite-plus` `pack` with `dts: true`, so
`vp pack` builds the library and emits declaration files in `dist/`.

## Docs Deploy

```bash
cd docs
bun run deploy
```

This deploys `docs/dist/client` with Cloudflare Workers Static Assets using
[`docs/wrangler.jsonc`](/home/nakasyou/eclipsa/docs/wrangler.jsonc).

## Test

```bash
bun run test
```
