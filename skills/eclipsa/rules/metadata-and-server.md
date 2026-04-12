# Metadata And Server

## Route Metadata

- Export `metadata` from a page or layout to control route head tags.
- Metadata can be an object or a function that receives `MetadataContext`.
- Common fields include:
  - `title`
  - `canonical`
  - `openGraph`
  - `twitter`

## Concrete Metadata Example

```tsx
import type { MetadataContext } from 'eclipsa'

export const metadata = ({ url }: MetadataContext) => ({
  title: 'Dashboard',
  canonical: url.pathname,
  openGraph: {
    title: 'Dashboard',
    url: url.href,
  },
  twitter: {
    card: 'summary',
    title: 'Dashboard',
  },
})
```

## Practical Metadata Pattern

- Use `canonical: url.pathname` when the canonical path should follow the current route.
- Set `openGraph.title` and `twitter.card` or `twitter.title` when social metadata matters.
- Put shared metadata in layouts and route-specific metadata in pages.

## `+ssr-root.tsx`

- Use `SSRRootProps`.
- Render the base document structure:
  - `<html>`
  - `<head>{props.head}</head>`
  - `<body>{props.children}</body>`
- Keep the root shell minimal unless the user needs a custom document structure.

```tsx
import type { SSRRootProps } from 'eclipsa'

export default function Root(props: SSRRootProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta content="width=device-width, initial-scale=1.0" name="viewport" />
        {props.head}
      </head>
      <body>{props.children}</body>
    </html>
  )
}
```

## `+server-entry.ts`

- The generated starter uses Hono.
- Export a Hono app as the server entry.
- Put route-scoped request handling in route files before expanding global server complexity.

```ts
import { Hono } from 'hono'

const app = new Hono()

export default app
```
