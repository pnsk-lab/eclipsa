---
title: Loader
description: Fetch route data with typed loaders that work with SSR and navigation.
---

# Loader

`loader()` is the route data-fetching API for pages and layouts.

It works the same way during SSR and during client-side navigation, and it returns a handle with `data`, `error`, `isLoading`, and `load()`.

## First example

```tsx
import { loader } from 'eclipsa'

const useProfile = loader(async () => {
  const response = await fetch('https://example.com/api/profile')
  return response.json()
})

export default function Page() {
  const profile = useProfile()

  if (profile.error) {
    return <p>Failed to load profile.</p>
  }

  return <pre>{JSON.stringify(profile.data, null, 2)}</pre>
}
```

## Returned handle

A loader handle such as `useProfile()` exposes:

- `data`: loaded data, or `undefined` if not loaded yet
- `error`: the current error, if any
- `isLoading`: whether a request is in flight
- `load()`: a function that reloads the data explicitly

## Route params with loader

If the data depends on the route URL, read params from the request context.

```tsx
import { loader } from 'eclipsa'

const useArticle = loader(async (c) => {
  const slug = c.req.param('slug')
  const response = await fetch(`https://example.com/api/articles/${slug}`)
  return response.json()
})

export default function Page() {
  const article = useArticle()
  return <article>{article.data?.title}</article>
}
```

## Manual reload

Call `load()` when the user should be able to refresh the data manually.

```tsx
import { loader } from 'eclipsa'

const useClock = loader(async () => {
  const response = await fetch('/api/time')
  return response.text()
})

export default function Clock() {
  const clock = useClock()

  return (
    <div>
      <p>{clock.data}</p>
      <button onClick={() => void clock.load()} disabled={clock.isLoading}>
        Refresh
      </button>
    </div>
  )
}
```

## Middleware

Loaders can also use middleware. This is useful for adding shared request metadata or auth-related state.

```tsx
import { loader, type LoaderMiddleware } from 'eclipsa'

const requestMeta: LoaderMiddleware<{
  Variables: {
    traceId: string
  }
}> = async (c, next) => {
  c.set('traceId', crypto.randomUUID())
  await next()
}

const useProfile = loader(requestMeta, async (c) => {
  return {
    traceId: c.var.traceId,
  }
})
```

Values written with `c.set()` in middleware are available as `c.var` inside the handler.

## SSR and navigation

Loaders are used in both cases:

- Initial SSR
- Reloads after client-side navigation

Because the API stays the same, page code usually does not need to care when the loader ran.

## What loaders should return

Loaders should return public data values such as:

- strings
- numbers
- booleans
- plain objects
- arrays

They are not meant to return `Response` or `ReadableStream` directly.
