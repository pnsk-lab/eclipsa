# Project Creation

## Public Entry Point

- The public way to create a new app is `npm create eclipsa@latest`.

## What The Starter Sets Up

- The starter is a Node SSR app.
- Toolchain choices are `vite` and `vite-plus`.
- The prompt defaults to `vite` when the user does not choose.
- `vite` maps to `vite dev` and `vite build`.
- `vite-plus` maps to `vp dev` and `vp build`.

## Files A Fresh App Should Have

- `app/+page.tsx`: default interactive route.
- `app/+client.dev.tsx`: client boot entry; it must call `resumeContainer(document)`.
- `app/+server-entry.ts`: Hono server entry.
- `app/+ssr-root.tsx`: HTML shell for SSR.
- `vite.config.ts`: `appType: 'custom'` and `plugins: [eclipsa()]`.
- `package.json`: `eclipsa` and `hono` in dependencies, TypeScript and selected toolchain in devDependencies.

## Expected Next Steps After Scaffolding

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run start`

## Practical Advice

- Keep the initial `+ssr-root.tsx` minimal and standards-based.
- Put app routes under `app/` instead of inventing a custom route table.
- Use the generated Vite config unless the user has a concrete integration need.
