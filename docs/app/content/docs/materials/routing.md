---
title: Routing
description: Client-side routing with eclipsa's router.
---

# Routing

eclipsa has file-based routing built in.

```bash
app/
  +layout.tsx
  +page.tsx            # "/"
  about/
    +page.tsx          # "/about"
  blog/
    [slug]/
      +page.tsx        # "/blog/:slug"
  docs/
    [...parts]/
      +page.tsx        # "/docs/*"
  [[lang]]/
    about/
      +page.tsx        # "/about" and "/ja/about"
```

Each directory becomes a route segment, and special files define what that segment does.

## `+page.tsx`

A page component for that route.

```tsx
export default function Page() {
  return <h1>Hello</h1>
}
```

## `+layout.tsx`

A layout wraps every nested page below it. Layouts can be nested.

```tsx
import type { JSX } from 'eclipsa/jsx-runtime'

export default function Layout(props: { children: JSX.Childable }) {
  return (
    <div>
      <header>Header</header>
      <main>{props.children}</main>
    </div>
  )
}
```

## Dynamic Routes

Use bracket syntax for params.

```bash
app/
  blog/
    [slug]/
      +page.tsx
```

```tsx
import { useRouteParams } from 'eclipsa'

export default function BlogPost() {
  const params = useRouteParams()

  return <h1>{params.slug}</h1>
}
```

`[slug]` matches one segment and gives you a string.

## Catch-all Routes

Use `[...name]` to capture the rest of the path.

```bash
app/
  docs/
    [...parts]/
      +page.tsx
```

For `/docs/guide/routing`, `parts` becomes `['guide', 'routing']`.

## Optional Segments

Use `[[name]]` for an optional segment.

```bash
app/
  [[lang]]/
    about/
      +page.tsx
```

This matches both `/about` and `/ja/about`.

## Route Groups

Use parentheses to group routes without adding a URL segment.

```bash
app/
  (marketing)/
    about/
      +page.tsx
```

This still matches `/about`.

## Navigation

Use `Link` for client-side navigation.

```tsx
import { Link } from 'eclipsa'

export default function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
      <Link href="/blog/hello-world" prefetch="hover">
        Blog
      </Link>
    </nav>
  )
}
```

`prefetch` supports `'focus'`, `'hover'`, `'intent'`, and `'none'`.

## Imperative Navigation

Use `useNavigate` when navigation should happen in code.

```tsx
import { useNavigate } from 'eclipsa'

export default function LoginButton() {
  const navigate = useNavigate()

  return (
    <button
      onClick={async () => {
        await navigate('/dashboard')
      }}
    >
      Continue
    </button>
  )
}
```

## Current Location

Use `useLocation` to read the current URL.

```tsx
import { useLocation } from 'eclipsa'

export default function Breadcrumb() {
  const location = useLocation()

  return <div>{location.pathname}</div>
}
```

## Special Route Files

eclipsa also supports special files inside route directories.

- `+loading.tsx`: loading UI for that route subtree.
- `+not-found.tsx`: fallback when no route matches in that subtree.
- `+error.tsx`: error UI for thrown errors in that subtree.
- `+middleware.ts`: request middleware for matching routes.
- `+server.ts`: route-scoped server handler.

You can trigger a not found state from a page with `notFound()`.

```tsx
import { notFound } from 'eclipsa'

export default function Page() {
  notFound()
}
```

In `+error.tsx`, use `useRouteError()` to read the thrown value.

## Static Paths

Dynamic routes can declare `getStaticPaths` for static generation.

```tsx
import type { GetStaticPaths } from 'eclipsa'

export const render = 'static'

export const getStaticPaths: GetStaticPaths = async () => [
  { params: { slug: 'hello-world' } },
  { params: { slug: 'routing' } },
]

export default function Page() {
  return <div>Static page</div>
}
```

Use `render = 'static'` when the route should be generated ahead of time.
