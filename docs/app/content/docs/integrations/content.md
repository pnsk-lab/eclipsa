---
title: Ox Content
description: Integrate Eclipsa with Ox Content.
---

# Content

eclipsa has a content-management system like Astro, powered by [Ox Content](https://ubugeeei.github.io/ox-content/).

## Installation

```bash
bun add @eclipsa/content
pnpm add @eclipsa/content
yarn add @eclipsa/content
npm install @eclipsa/content
```

And change your `vite.config.ts`:

```ts
import { defineConfig } from 'vite-plus'
import { eclipsa } from 'eclipsa/vite'
import { eclipsaContent } from '@eclipsa/content/vite' // add this

export default defineConfig({
  appType: 'custom',
  plugins: [
    eclipsa(),
    eclipsaContent(), // add this
  ],
})
```

## Usage

Create `app/content.config.ts`:
```ts
import { defineCollection, glob } from '@eclipsa/content'

export const docs = defineCollection({
  loader: glob({
    base: './content/docs',
    pattern: '**/*.md',
  }),
})
```

Then, put your markdown files in `content/docs`. For example, `content/docs/hello.md`:

```md
---
title: Hello
---
# Hello

This is a markdown file.
```

You can load the content in your components:

```tsx
// app/docs/[...slug]/+page.tsx
import { Content, getCollection, getEntry, render, getCollection } from "@eclipsa/content";

const normalizeSlugParam = (slug: string | string[] | undefined) => {
  if (Array.isArray(slug)) {
    return slug.join('/')
  }
  return typeof slug === 'string' ? slug : ''
}
const useDocsPage = loader(async (c) => {
  const entries = await getCollection(docs)
  const page = entries.find((entry) => entry.slug === c.params.slug)
  const entry = await getEntry(docs, id)
  return {
    html: (await render(entry)).html,
    title: entry.data.title,
  }
});

export default () => {
  const page = useDocsPage();

  return <Content as="div" class="markdown-content" html={page.data?.html ?? ""} />;
};
```
