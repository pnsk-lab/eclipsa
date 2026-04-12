# App Structure

## Route File Conventions

- `app/+page.tsx`: page component for a route segment.
- `app/+layout.tsx`: shared layout state and shared shell for nested routes.
- `app/+middleware.ts`: route guard or request-time routing decisions.
- `app/+ssr-root.tsx`: document shell for SSR.
- `app/+server-entry.ts`: server entry used in dev and production.
- `app/+client.dev.tsx`: client resume entry during development.

## Routing Shape

- Dynamic segments use bracket syntax such as `[id]`.
- Catch-all segments use `[...slug]`.
- Optional segments use `[[name]]`.
- Route groups use `(group-name)` and do not appear in the URL.

## Preferred Interactive Patterns

- Use `useSignal` for component-local reactive state.
- Use `Link` for declarative navigation.
- Use `useNavigate` for imperative navigation.
- Use `For` for list rendering instead of ad hoc array mutation patterns that obscure reactivity.
- Use `useWatch`, `onMount`, and related primitives when behavior depends on runtime lifecycle.

## File Responsibilities

- Put normal route UI in `+page.tsx`.
- Put shared shells and shared state in `+layout.tsx`.
- Put subtree request logic such as auth or redirects in `+middleware.ts`.
- Put document HTML in `+ssr-root.tsx`.
- Put server setup in `+server-entry.ts`.
- Keep `+client.dev.tsx` only for client resume boot.
