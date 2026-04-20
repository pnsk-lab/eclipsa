---
title: Routing
description: File-based routing, layouts, params, and navigation in eclipsa.
---

# Routing

eclipsa has file-based routing built in.

Instead of declaring routes in a separate router table, the route structure comes from your `app/` directories.

## Route tree

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
  (marketing)/
    pricing/
      +page.tsx        # "/pricing"
```

Each directory becomes a route segment, and special files starting with `+` define how that segment behaves.

## `+page.tsx`

This is the page component rendered for the route.

```tsx
export default function Page() {
  return <h1>Hello</h1>
}
```

## `+layout.tsx`

Layouts wrap the pages and nested layouts below them.

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

Nested `+layout.tsx` files compose from top to bottom.

## Dynamic routes

`[name]` captures exactly one path segment.

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

For `/blog/hello-world`, `params.slug === 'hello-world'`.

## Catch-all routes

`[...name]` captures the rest of the path.

```bash
app/
  docs/
    [...parts]/
      +page.tsx
```

For `/docs/guide/routing`, `parts` becomes `['guide', 'routing']`.

## Optional segments

`[[name]]` makes a segment optional.

```bash
app/
  [[lang]]/
    about/
      +page.tsx
```

This matches both `/about` and `/ja/about`.

## Route groups

`(group-name)` is a grouping directory that does not appear in the URL.

```bash
app/
  (marketing)/
    about/
      +page.tsx
```

This still matches `/about`. Use it when you want to organize routes without changing the URL.

## Navigation with `Link`

Use `Link` for normal client-side navigation.

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

`Link` performs client-side navigation. `prefetch` supports:

- `'focus'`
- `'hover'`
- `'intent'`
- `'none'`

`true` means `'intent'`, and `false` means `'none'`.

## Imperative navigation

Use `useNavigate()` when navigation should happen from code.

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

## Reading the current location

Use `useLocation()` to read the current URL.

```tsx
import { useLocation } from 'eclipsa'

export default function Breadcrumb() {
  const location = useLocation()

  return <div>{location.pathname}</div>
}
```

This is useful for navigation UI and active-state checks.

## Special route files

Route directories can also contain these special files:

- `+loading.tsx`: loading UI for that subtree
- `+not-found.tsx`: UI for not found states inside that subtree
- `+error.tsx`: error UI for thrown errors inside that subtree
- `+middleware.ts`: request middleware for that subtree
- `+server.ts`: route-scoped server handler

## Not found

Call `notFound()` from a page or loader to fall back to that subtree's `+not-found.tsx`.

```tsx
import { notFound } from 'eclipsa'

export default function Page() {
  notFound()
}
```

## Route errors

Inside `+error.tsx`, use `useRouteError()` to read the thrown value.

```tsx
import { useRouteError } from 'eclipsa'

export default function RouteError() {
  const error = useRouteError<Error>()
  return <pre>{error?.message}</pre>
}
```

## Static paths

Use `getStaticPaths` when dynamic routes should be generated at build time.

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

With `render = 'static'`, the route is generated ahead of time.

## Practical routing pattern

For a docs-style app, a practical pattern is:

- Use `+layout.tsx` to share the sidebar and shell
- Use `[slug]` or `[...slug]` for document pages
- Use `getStaticPaths` to prebuild known pages
- Use `Link` and `useLocation()` for active navigation
