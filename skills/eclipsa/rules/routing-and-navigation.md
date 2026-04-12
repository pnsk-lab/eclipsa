# Routing And Navigation

## Route Tree

- Eclipsa uses file-based routing from the `app/` directory.
- `+page.tsx` renders a route.
- `+layout.tsx` wraps nested pages and layouts.
- `[slug]` captures one segment.
- `[...parts]` captures the remaining path.
- `[[lang]]` makes a segment optional.
- `(marketing)` groups files without changing the URL.

## Navigation

- Use `Link` for standard client-side navigation.
- Use `useNavigate()` when a click handler or async flow decides where to go.
- Use `useLocation()` for active navigation state and URL-aware UI.

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

## Layout Pattern

- Put persistent chrome such as nav bars or sidebars in `+layout.tsx`.
- Keep page-specific content in `+page.tsx`.
- Use layouts for shared navigation state instead of duplicating logic in each page.
