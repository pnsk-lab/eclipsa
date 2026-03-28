---
title: Quick Start
description: A minimal markdown page rendered by @eclipsa/content.
---

# Quick Start

## Create a new project

To create a new eclipsa project, use [create-eclipsa](https://npmx.dev/package/create-eclipsa):

```bash
bun create eclipsa
pnpm create eclipsa
deno run -A npm:create-eclipsa
yarn create eclipsa
npm create eclipsa
```

and
```bash
cd my-app
bun install # or pnpm install, deno task install, yarn install, npm install
```

## Run the development server

```bash
bun dev # or pnpm dev, deno task dev, yarn dev, npm run dev
```

## Verify search indexing

Use the phrase `stellar-search-probe` if you want to confirm the docs search index is picking up headings, body text, and inline code.
