# Routing And Navigation

## Route Tree

- Eclipsa uses file-based routing from the `app/` directory.
- `+page.tsx` renders a route.
- `+layout.tsx` wraps nested pages and layouts.
- `[slug]` captures one segment.
- `[...parts]` captures the remaining path.
- `[[lang]]` makes a segment optional.
- `(marketing)` groups files without changing the URL.

## Concrete Route Example

```text
app/
  +page.tsx
  blog/
    +page.tsx
    [slug]/
      +page.tsx
  (marketing)/
    pricing/
      +page.tsx
```

- `/blog/[slug]/+page.tsx` matches `/blog/hello-world`
- `/(marketing)/pricing/+page.tsx` still matches `/pricing`

## Navigation

- Use `Link` for standard client-side navigation.
- Use `useNavigate()` when a click handler or async flow decides where to go.
- Use `useLocation()` for active navigation state and URL-aware UI.

## Active Nav Pattern

```tsx
import { Link, useLocation } from 'eclipsa'

const NavLink = (props: { href: string; label: string }) => {
  const location = useLocation()
  const active = location.pathname === props.href

  return (
    <Link class={active ? 'active' : 'inactive'} href={props.href}>
      {props.label}
    </Link>
  )
}

export default function AppNav() {
  return (
    <nav>
      <NavLink href="/" label="Home" />
      <NavLink href="/dashboard" label="Dashboard" />
      <NavLink href="/settings" label="Settings" />
    </nav>
  )
}
```

## Imperative Navigation Pattern

```tsx
import { useNavigate, useSignal } from 'eclipsa'

export default function SearchBox() {
  const query = useSignal('')
  const navigate = useNavigate()

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        await navigate(`/search?q=${encodeURIComponent(query.value)}`)
      }}
    >
      <input
        onInput={(event: InputEvent) => {
          query.value = (event.currentTarget as HTMLInputElement).value
        }}
        value={query.value}
      />
      <button type="submit">Search</button>
    </form>
  )
}
```

## Prefetch

`Link` supports `prefetch`:

- `'focus'`
- `'hover'`
- `'intent'`
- `'none'`

Boolean shortcuts:

- `true` means `'intent'`
- `false` means `'none'`

## Route Helpers

- Use `notFound()` to render the current subtree's `+not-found.tsx`.
- Use `useRouteError()` inside `+error.tsx`.
- Use `getStaticPaths` with `render = 'static'` when a dynamic route should be prebuilt.

## Params Pattern

Use request params inside a loader when page data depends on the URL:

```tsx
import { loader } from 'eclipsa'

const useArticle = loader(async (c) => {
  const slug = c.req.param('slug')
  return {
    slug,
  }
})
```

## Layout Pattern

- Put persistent chrome such as nav bars or sidebars in `+layout.tsx`.
- Keep page-specific content in `+page.tsx`.
- Use layouts for shared navigation state instead of duplicating logic in each page.
