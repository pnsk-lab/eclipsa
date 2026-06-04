---
title: Hosting
description: Build server adapters, static output, and deployment entry points.
---

# Hosting

Eclipsa builds two kinds of production output:

- `dist/client/`: browser assets, route entry modules, prerendered pages, and other static files.
- `dist/server/`: server entry files for dynamic SSR, actions, loaders, realtime, and route middleware.

Static pages and prerendered endpoint output always belong in `dist/client/`. Server files are only emitted when the app is not configured as SSG-only.

## Default server output

By default, Eclipsa writes `dist/server/index.mjs`.

That file exports a handler factory:

```ts
import createHandler from './dist/server/index.mjs'

const handleRequest = createHandler({
  upgradeWebSocket,
})

const response = await handleRequest(request)
```

The returned function accepts a standard `Request` and resolves to a standard `Response`. Runtime adapters pass host-specific capabilities through the first argument. The first adapter capability is `upgradeWebSocket`, used by realtime routes.

## Node

Use `@eclipsa/node` when you want a Node HTTP entry file generated for you.

```bash
bun add @eclipsa/node
```

```ts
import { defineConfig } from 'vite'
import { eclipsa } from 'eclipsa/vite'
import { node } from '@eclipsa/node'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsa(), node()],
})
```

Build output includes:

- `dist/server/index.mjs`: the standard `Request => Response` handler factory.
- `dist/server/node.mjs`: a Node HTTP server that serves `dist/client/` and delegates dynamic requests to the standard handler.

Start the Node server with:

```bash
node dist/server/node.mjs
```

## Other hosts

Cloudflare, Vercel, and other host integrations follow the same shape as `@eclipsa/node`: add the host plugin next to `eclipsa()` and let it emit host-specific entry files or config from the standard server handler.

Adapter plugins should not move prerendered output out of `dist/client/`. Static pages, route assets, and prerendered endpoint responses remain ordinary client output regardless of host.

## SSG-only output

Use `ssg: true` when the app should emit only static output.

```ts
import { defineConfig } from 'vite'
import { eclipsa } from 'eclipsa/vite'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsa({ ssg: true })],
})
```

In SSG mode, Eclipsa prerenders static routes into `dist/client/` and removes `dist/server/`.

SSG mode cannot include dynamic routes or route middleware. Keep routes static or remove `ssg: true` and deploy with a server adapter.
