import type {
  RouteLocation,
  RouteManifest,
  RouteModuleManifest,
  RouteParams,
} from '../router-shared.ts'
import type { RouteDataResponse, RouterState } from './types.ts'

export const normalizeRoutePath = (pathname: string) => {
  const normalizedPath = pathname.trim() || '/'
  const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1)
  }
  return withLeadingSlash
}

export const parseLocationHref = (href: string) => new URL(href, 'http://localhost')

export const createStandaloneLocation = (): RouteLocation => ({
  get hash() {
    return typeof window === 'undefined' ? '' : window.location.hash
  },
  get href() {
    return typeof window === 'undefined' ? '/' : window.location.href
  },
  get pathname() {
    return typeof window === 'undefined' ? '/' : normalizeRoutePath(window.location.pathname)
  },
  get search() {
    return typeof window === 'undefined' ? '' : window.location.search
  },
})

export const createRouterLocation = (router: RouterState): RouteLocation => ({
  get hash() {
    return parseLocationHref(router.currentUrl.value).hash
  },
  get href() {
    return router.currentUrl.value
  },
  get pathname() {
    return normalizeRoutePath(parseLocationHref(router.currentUrl.value).pathname)
  },
  get search() {
    return parseLocationHref(router.currentUrl.value).search
  },
})

export const EMPTY_ROUTE_PARAMS = Object.freeze({}) as RouteParams
export const ROUTE_DOCUMENT_FALLBACK = Object.freeze({
  document: true,
  ok: false,
} as const)

const decodeRoutePathSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

const splitRawRoutePath = (pathname: string) =>
  normalizeRoutePath(pathname).split('/').filter(Boolean)

const splitRoutePath = (pathname: string) => splitRawRoutePath(pathname).map(decodeRoutePathSegment)

const matchRouteSegments = (
  segments: RouteModuleManifest['segments'],
  pathnameSegments: string[],
  routeIndex = 0,
  pathIndex = 0,
  params: RouteParams = {},
): RouteParams | null => {
  if (routeIndex >= segments.length) {
    return pathIndex >= pathnameSegments.length ? params : null
  }

  const segment = segments[routeIndex]!
  switch (segment.kind) {
    case 'static':
      if (pathnameSegments[pathIndex] !== segment.value) {
        return null
      }
      return matchRouteSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, params)
    case 'required':
      if (pathIndex >= pathnameSegments.length) {
        return null
      }
      return matchRouteSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, {
        ...params,
        [segment.value]: pathnameSegments[pathIndex],
      })
    case 'optional': {
      const consumed =
        pathIndex < pathnameSegments.length
          ? matchRouteSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, {
              ...params,
              [segment.value]: pathnameSegments[pathIndex],
            })
          : null
      if (consumed) {
        return consumed
      }
      return matchRouteSegments(segments, pathnameSegments, routeIndex + 1, pathIndex, {
        ...params,
        [segment.value]: undefined,
      })
    }
    case 'rest': {
      const rest = pathnameSegments.slice(pathIndex)
      if (rest.length === 0) {
        return null
      }
      return matchRouteSegments(
        segments,
        pathnameSegments,
        segments.length,
        pathnameSegments.length,
        {
          ...params,
          [segment.value]: rest,
        },
      )
    }
  }
}

export const matchRouteManifest = (manifest: RouteManifest, pathname: string) => {
  const normalizedPath = normalizeRoutePath(pathname)
  const pathnameSegments = splitRoutePath(normalizedPath)
  for (const entry of manifest) {
    const params = matchRouteSegments(entry.segments, pathnameSegments)
    if (params) {
      return {
        entry,
        params,
        pathname: normalizedPath,
      }
    }
  }
  return null
}

export const scoreSpecialManifestEntry = (entry: RouteModuleManifest, pathname: string) => {
  const pathSegments = splitRoutePath(pathname)
  let score = 0
  for (let index = 0; index < entry.segments.length && index < pathSegments.length; index += 1) {
    const segment = entry.segments[index]!
    const pathnameSegment = pathSegments[index]
    if (segment.kind === 'static') {
      if (segment.value !== pathnameSegment) {
        break
      }
      score += 10
      continue
    }
    score += segment.kind === 'rest' ? 1 : 2
    if (segment.kind === 'rest') {
      break
    }
  }
  return score
}

export const findSpecialManifestEntry = (
  manifest: RouteManifest,
  pathname: string,
  kind: 'error' | 'notFound',
) => {
  const normalizedPath = normalizeRoutePath(pathname)
  const matched = matchRouteManifest(manifest, normalizedPath)
  if (matched?.entry[kind]) {
    return matched
  }

  const rawPathSegments = splitRawRoutePath(normalizedPath)
  for (let length = rawPathSegments.length - 1; length >= 0; length -= 1) {
    const candidatePath = length === 0 ? '/' : `/${rawPathSegments.slice(0, length).join('/')}`
    const candidate = matchRouteManifest(manifest, candidatePath)
    if (candidate?.entry[kind]) {
      return candidate
    }
  }

  let best: ReturnType<typeof matchRouteManifest> = null
  let bestScore = -1
  for (const entry of manifest) {
    if (!entry[kind]) {
      continue
    }
    const score = scoreSpecialManifestEntry(entry, pathname)
    if (score > bestScore) {
      best = {
        entry,
        params: EMPTY_ROUTE_PARAMS,
        pathname: normalizedPath,
      }
      bestScore = score
    }
  }

  return best
}

export const resolvePageRouteMatch = (manifest: RouteManifest, pathname: string) => {
  const matched = matchRouteManifest(manifest, pathname)
  return matched?.entry.page ? matched : null
}

export const resolveNotFoundRouteMatch = (manifest: RouteManifest, pathname: string) => {
  const matched = findSpecialManifestEntry(manifest, pathname, 'notFound')
  return matched?.entry.notFound ? matched : null
}

export const resolveRoutableMatch = (
  manifest: RouteManifest,
  pathname: string,
): {
  kind: 'page' | 'not-found'
  matched: NonNullable<ReturnType<typeof matchRouteManifest>>
} | null => {
  const matched = matchRouteManifest(manifest, pathname)
  if (matched?.entry.page) {
    return {
      kind: 'page',
      matched,
    }
  }

  if (matched) {
    return null
  }

  const notFoundMatch = resolveNotFoundRouteMatch(manifest, pathname)
  if (!notFoundMatch) {
    return null
  }

  return {
    kind: 'not-found',
    matched: notFoundMatch,
  }
}

export const resolveCurrentRouteManifestEntry = (router: RouterState) => {
  const currentPath = normalizeRoutePath(router.currentPath.value)
  const matched = matchRouteManifest(router.manifest, currentPath)
  if (matched?.entry.page) {
    return matched.entry
  }
  return findSpecialManifestEntry(router.manifest, currentPath, 'notFound')?.entry ?? null
}

export const getRouteModuleUrl = (
  entry: RouteModuleManifest,
  variant: 'page' | 'loading' | 'error' | 'not-found' = 'page',
) =>
  variant === 'page'
    ? entry.page
    : variant === 'loading'
      ? entry.loading
      : variant === 'error'
        ? entry.error
        : entry.notFound

export const isRouteDataSuccess = (
  body: RouteDataResponse,
): body is Extract<RouteDataResponse, { ok: true }> =>
  body.ok === true &&
  typeof body.finalHref === 'string' &&
  typeof body.finalPathname === 'string' &&
  (body.kind === 'page' || body.kind === 'not-found') &&
  !!body.loaders &&
  typeof body.loaders === 'object'

export const routeCacheKey = (
  pathname: string,
  variant: 'page' | 'loading' | 'error' | 'not-found' = 'page',
) => `${normalizeRoutePath(pathname)}::${variant}`

export const routePrefetchKey = (url: URL) => `${normalizeRoutePath(url.pathname)}${url.search}`

export const isLoaderSignalId = (id: string) => id.startsWith('$loader:')
