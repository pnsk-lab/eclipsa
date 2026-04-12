# Data Loading And Actions

## `loader()`

- Use `loader()` for route data in pages and layouts.
- A loader works for initial SSR and later client navigation with the same API.
- A loader handle exposes:
  - `data`
  - `error`
  - `isLoading`
  - `load()`

## Loader Guidance

- Read route params from the request context, for example `c.req.param('slug')`.
- Use `load()` for manual refresh.
- Return public, serializable data such as strings, numbers, booleans, arrays, and plain objects.
- Do not design loaders around `Response` or `ReadableStream` results.

## Loader Middleware

- Use loader middleware when request-scoped shared values are needed.
- Values set with `c.set()` become available through `c.var` in the loader handler.

## `action()`

- Use `action()` for mutations, submissions, and side effects.
- An action handle exposes:
  - `Form`
  - `action()`
  - `isPending`
  - `result`
  - `error`
  - `lastSubmission`

## Action Guidance

- Use `Form` for native form submission.
- Use `action(input)` for programmatic submission.
- Keep action input and output serializable.
- Use `validator()` to validate and transform incoming input before the handler runs.
- Standard Schema based validators and adapters such as Zod or valibot fit well here.

## Action Middleware

- Actions can use middleware in the same Hono-style pattern as loaders.
- Values written with `c.set()` are read back through `c.var`.

## Streaming

- Actions may return async generators or readable streams when the UI should consume progressive results.
