import fg from 'fast-glob'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import type {
  RouteManifest,
  RouteModuleManifest,
  RouteParams,
  RoutePathSegment,
} from '../../core/router-shared.ts'

export const normalizeRoutePath = (pathname: string) => {
  const normalizedPath = pathname.trim() || '/'
  const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1)
  }
  return withLeadingSlash
}

export interface RouteEntry {
  error: RouteModuleEntry | null
  layouts: RouteModuleEntry[]
  loading: RouteModuleEntry | null
  middlewares: RouteModuleEntry[]
  notFound: RouteModuleEntry | null
  page: RouteModuleEntry | null
  renderMode?: 'dynamic' | 'static' | null
  routePath: string
  segments: RoutePathSegment[]
  server: RouteModuleEntry | null
}

export interface RouteModuleEntry {
  entryName: string
  filePath: string
}

interface RouteFileEntry extends RouteModuleEntry {
  breakoutTarget: string | null
  dir: string
}

interface RouteDirectoryEntry {
  error: RouteFileEntry | null
  layout: RouteFileEntry | null
  loading: RouteFileEntry | null
  middleware: RouteFileEntry | null
  notFound: RouteFileEntry | null
  page: RouteFileEntry | null
  server: RouteFileEntry | null
}

interface RouteMatch<T> {
  params: RouteParams
  route: T
}

const createDirectoryEntry = (): RouteDirectoryEntry => ({
  error: null,
  layout: null,
  loading: null,
  middleware: null,
  notFound: null,
  page: null,
  server: null,
})

const toEntryName = (relativePath: string) => {
  const normalized = relativePath.replaceAll('\\', '/')
  const withoutExt = normalized.replace(/\.[^.]+$/, '')
  const segments = withoutExt.split('/')
  const fileName = segments.pop() ?? 'index'
  const prefix = fileName.startsWith('+layout')
    ? 'layout'
    : fileName.startsWith('+page')
      ? 'route'
      : fileName.startsWith('+server')
        ? 'server'
        : 'special'
  const mapped = segments
    .map((segment) => segment.replaceAll(/[^a-zA-Z0-9]+/g, '_') || 'index')
    .concat(fileName.replaceAll(/[^a-zA-Z0-9]+/g, '_') || 'index')

  return [prefix, ...mapped].join('__')
}

const toRouteModuleEntry = (
  appDir: string,
  filePath: string,
  breakoutTarget: string | null,
): RouteFileEntry => {
  const relativePath = path.relative(appDir, filePath).replaceAll('\\', '/')
  return {
    breakoutTarget,
    dir: normalizeRelativeDir(path.posix.dirname(relativePath)),
    entryName: toEntryName(relativePath),
    filePath,
  }
}

const normalizeRelativeDir = (relativeDir: string) =>
  relativeDir === '.' || relativeDir === '' ? '' : relativeDir.replaceAll('\\', '/')

const splitRelativeDir = (relativeDir: string) => (relativeDir === '' ? [] : relativeDir.split('/'))

const ancestorDirs = (relativeDir: string) => {
  const segments = splitRelativeDir(relativeDir)
  return Array.from({ length: segments.length + 1 }, (_, index) =>
    normalizeRelativeDir(segments.slice(0, index).join('/')),
  )
}

const getDirBaseName = (relativeDir: string) => {
  const segments = splitRelativeDir(relativeDir)
  return segments.length === 0 ? '' : segments[segments.length - 1]!
}

const isGroupSegment = (segment: string) => /^\(.+\)$/.test(segment)

const toRouteSegment = (segment: string): RoutePathSegment | null => {
  if (isGroupSegment(segment)) {
    return null
  }
  const optionalMatch = /^\[\[([^\]]+)\]\]$/.exec(segment)
  if (optionalMatch) {
    return {
      kind: 'optional',
      value: optionalMatch[1]!,
    }
  }
  const restMatch = /^\[\.\.\.([^\]]+)\]$/.exec(segment)
  if (restMatch) {
    return {
      kind: 'rest',
      value: restMatch[1]!,
    }
  }
  const requiredMatch = /^\[([^\]]+)\]$/.exec(segment)
  if (requiredMatch) {
    return {
      kind: 'required',
      value: requiredMatch[1]!,
    }
  }
  return {
    kind: 'static',
    value: segment,
  }
}

const toRouteSegments = (relativeDir: string) =>
  splitRelativeDir(relativeDir)
    .map((segment) => toRouteSegment(segment))
    .filter((segment): segment is RoutePathSegment => segment !== null)

const segmentsToRoutePath = (segments: RoutePathSegment[]) => {
  if (segments.length === 0) {
    return '/'
  }
  return normalizeRoutePath(
    segments
      .map((segment) => {
        switch (segment.kind) {
          case 'required':
            return `[${segment.value}]`
          case 'optional':
            return `[[${segment.value}]]`
          case 'rest':
            return `[...${segment.value}]`
          default:
            return segment.value
        }
      })
      .join('/'),
  )
}

const resolveAncestorDirs = (relativeDir: string, breakoutTarget: string | null) => {
  const candidates = ancestorDirs(relativeDir)
  if (breakoutTarget === null) {
    return candidates
  }
  if (breakoutTarget === '') {
    return candidates.slice(0, 1)
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const baseName = getDirBaseName(candidates[index]!)
    if (baseName === breakoutTarget || baseName === `(${breakoutTarget})`) {
      return candidates.slice(0, index + 1)
    }
  }
  return candidates.slice(0, 1)
}

const scoreSegment = (segment: RoutePathSegment | undefined) => {
  if (!segment) {
    return 0
  }
  switch (segment.kind) {
    case 'static':
      return 4
    case 'required':
      return 3
    case 'optional':
      return 2
    case 'rest':
      return 1
  }
}

const compareRouteEntries = (left: RouteEntry, right: RouteEntry) => {
  const limit = Math.max(left.segments.length, right.segments.length)
  for (let index = 0; index < limit; index += 1) {
    const scoreDelta = scoreSegment(right.segments[index]) - scoreSegment(left.segments[index])
    if (scoreDelta !== 0) {
      return scoreDelta
    }
  }
  return right.segments.length - left.segments.length
}

const matchSegments = (
  segments: RoutePathSegment[],
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
      return matchSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, params)
    case 'required':
      if (pathIndex >= pathnameSegments.length) {
        return null
      }
      return matchSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, {
        ...params,
        [segment.value]: pathnameSegments[pathIndex],
      })
    case 'optional': {
      const consumed =
        pathIndex < pathnameSegments.length
          ? matchSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, {
              ...params,
              [segment.value]: pathnameSegments[pathIndex],
            })
          : null
      if (consumed) {
        return consumed
      }
      return matchSegments(segments, pathnameSegments, routeIndex + 1, pathIndex, {
        ...params,
        [segment.value]: undefined,
      })
    }
    case 'rest':
      return matchSegments(segments, pathnameSegments, segments.length, pathnameSegments.length, {
        ...params,
        [segment.value]: pathnameSegments.slice(pathIndex),
      })
  }
}

const toMatch = <T extends { segments: RoutePathSegment[] }>(
  route: T,
  pathname: string,
): RouteMatch<T> | null => {
  const pathnameSegments = normalizeRoutePath(pathname).split('/').filter(Boolean)
  const params = matchSegments(route.segments, pathnameSegments)
  if (!params) {
    return null
  }
  return {
    params,
    route,
  }
}

const selectNearestSpecial = (
  directories: Map<string, RouteDirectoryEntry>,
  candidateDirs: string[],
  kind: 'error' | 'loading' | 'notFound',
) => {
  for (let index = candidateDirs.length - 1; index >= 0; index -= 1) {
    const entry = directories.get(candidateDirs[index]!)?.[kind]
    if (entry) {
      return entry
    }
  }
  return null
}

const collectLayouts = (
  directories: Map<string, RouteDirectoryEntry>,
  relativeDir: string,
  breakoutTarget: string | null,
) => {
  let layouts: RouteFileEntry[] = []
  for (const candidateDir of ancestorDirs(relativeDir)) {
    const layout = directories.get(candidateDir)?.layout
    if (!layout) {
      continue
    }
    if (layout.breakoutTarget !== null) {
      const allowedDirs = new Set(resolveAncestorDirs(candidateDir, layout.breakoutTarget))
      layouts = layouts.filter((entry) => allowedDirs.has(entry.dir))
    }
    layouts.push(layout)
  }

  if (breakoutTarget !== null) {
    const allowedDirs = new Set(resolveAncestorDirs(relativeDir, breakoutTarget))
    layouts = layouts.filter((entry) => allowedDirs.has(entry.dir))
  }

  return layouts.map(({ entryName, filePath }) => ({ entryName, filePath }))
}

const collectMiddlewares = (
  directories: Map<string, RouteDirectoryEntry>,
  candidateDirs: string[],
) =>
  candidateDirs.flatMap((candidateDir) => {
    const middleware = directories.get(candidateDir)?.middleware
    return middleware ? [{ entryName: middleware.entryName, filePath: middleware.filePath }] : []
  })

const parseAppFile = (appDir: string, filePath: string) => {
  const relativePath = path.relative(appDir, filePath).replaceAll('\\', '/')
  const fileName = path.posix.basename(relativePath)
  const dir = normalizeRelativeDir(path.posix.dirname(relativePath))

  const pageMatch = /^\+page(?:@(.*))?\.tsx$/.exec(fileName)
  if (pageMatch) {
    return {
      breakoutTarget: pageMatch[1] ?? null,
      dir,
      kind: 'page' as const,
      relativePath,
    }
  }

  const layoutMatch = /^\+layout(?:@(.*))?\.tsx$/.exec(fileName)
  if (layoutMatch) {
    return {
      breakoutTarget: layoutMatch[1] ?? null,
      dir,
      kind: 'layout' as const,
      relativePath,
    }
  }

  if (fileName === '+loading.tsx') {
    return { breakoutTarget: null, dir, kind: 'loading' as const, relativePath }
  }
  if (/^\+middleware\.(ts|tsx)$/.test(fileName)) {
    return { breakoutTarget: null, dir, kind: 'middleware' as const, relativePath }
  }
  if (fileName === '+error.tsx') {
    return { breakoutTarget: null, dir, kind: 'error' as const, relativePath }
  }
  if (fileName === '+not-found.tsx') {
    return { breakoutTarget: null, dir, kind: 'notFound' as const, relativePath }
  }
  if (/^\+server\.(ts|tsx)$/.test(fileName)) {
    return { breakoutTarget: null, dir, kind: 'server' as const, relativePath }
  }
  return null
}

const resolvePageRenderMode = async (filePath: string): Promise<'dynamic' | 'static' | null> => {
  const source = await fs.readFile(filePath, 'utf8')
  const match = source.match(/export\s+const\s+render\s*=\s*(['"])([^'"\\]+)\1(?:\s+as\s+const)?/s)
  if (!match) {
    return null
  }
  if (match[2] === 'dynamic' || match[2] === 'static') {
    return match[2]
  }
  throw new Error(
    `Unsupported render mode "${match[2]}" in ${filePath}. Expected "static" or "dynamic".`,
  )
}

export const createRoutes = async (root: string): Promise<RouteEntry[]> => {
  const appDir = path.join(root, 'app')
  const filePaths = (await fg(path.join(appDir, '**/*.{ts,tsx}').replaceAll('\\', '/'))).sort()
  const directories = new Map<string, RouteDirectoryEntry>()

  for (const filePath of filePaths) {
    const parsed = parseAppFile(appDir, filePath)
    if (!parsed) {
      continue
    }
    const directory = directories.get(parsed.dir) ?? createDirectoryEntry()
    directory[parsed.kind] = toRouteModuleEntry(appDir, filePath, parsed.breakoutTarget)
    directories.set(parsed.dir, directory)
  }

  const result: RouteEntry[] = []
  const seenRoutePaths = new Map<string, string>()

  for (const [relativeDir, directory] of [...directories.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!directory.page && !directory.server) {
      continue
    }

    const segments = toRouteSegments(relativeDir)
    const routePath = segmentsToRoutePath(segments)
    const previousDir = seenRoutePaths.get(routePath)
    if (previousDir && previousDir !== relativeDir) {
      throw new Error(`Duplicate route pattern ${routePath} for ${previousDir} and ${relativeDir}.`)
    }
    seenRoutePaths.set(routePath, relativeDir)

    const effectiveAncestorDirs = resolveAncestorDirs(
      relativeDir,
      directory.page?.breakoutTarget ?? null,
    )
    result.push({
      error: directory.page
        ? selectNearestSpecial(directories, effectiveAncestorDirs, 'error')
        : null,
      layouts: directory.page
        ? collectLayouts(directories, relativeDir, directory.page?.breakoutTarget ?? null)
        : [],
      loading: directory.page
        ? selectNearestSpecial(directories, effectiveAncestorDirs, 'loading')
        : null,
      middlewares:
        directory.page || directory.server
          ? collectMiddlewares(directories, effectiveAncestorDirs)
          : [],
      notFound: directory.page
        ? selectNearestSpecial(directories, effectiveAncestorDirs, 'notFound')
        : null,
      page: directory.page,
      renderMode: directory.page ? await resolvePageRenderMode(directory.page.filePath) : null,
      routePath,
      segments,
      server: directory.server,
    })
  }

  return result.sort(compareRouteEntries)
}

export const collectRouteModules = (routes: RouteEntry[]): RouteModuleEntry[] => {
  const modules = new Map<string, RouteModuleEntry>()
  for (const route of routes) {
    for (const entry of [
      route.page,
      ...route.layouts,
      route.loading,
      route.error,
      route.notFound,
    ]) {
      if (!entry) {
        continue
      }
      modules.set(entry.filePath, entry)
    }
  }
  return [...modules.values()]
}

export const collectRouteServerModules = (routes: RouteEntry[]): RouteModuleEntry[] => {
  const modules = new Map<string, RouteModuleEntry>()
  for (const route of routes) {
    for (const middleware of route.middlewares) {
      modules.set(middleware.filePath, middleware)
    }
    if (route.server) {
      modules.set(route.server.filePath, route.server)
    }
  }
  return [...modules.values()]
}

export const createDevModuleUrl = (root: string, entry: { filePath: string }) =>
  `/${path.relative(root, entry.filePath).replaceAll('\\', '/')}`

export const createBuildModuleUrl = (entry: RouteModuleEntry) => `/entries/${entry.entryName}.js`

export const createBuildServerModuleUrl = (entry: RouteModuleEntry) =>
  `../ssr/entries/${entry.entryName}.mjs`

export const createRouteManifest = (
  routes: RouteEntry[],
  resolveUrl: (module: RouteModuleEntry) => string,
): RouteManifest =>
  routes.map(
    (route) =>
      ({
        error: route.error ? resolveUrl(route.error) : null,
        hasMiddleware: route.middlewares.length > 0,
        layouts: route.layouts.map((layout) => resolveUrl(layout)),
        loading: route.loading ? resolveUrl(route.loading) : null,
        notFound: route.notFound ? resolveUrl(route.notFound) : null,
        page: route.page ? resolveUrl(route.page) : null,
        routePath: route.routePath,
        segments: route.segments,
        server: route.server ? resolveUrl(route.server) : null,
      }) satisfies RouteModuleManifest,
  )

export const matchRoute = <T extends { routePath: string; segments: RoutePathSegment[] }>(
  routes: T[],
  pathname: string,
): RouteMatch<T> | null => {
  for (const route of routes) {
    const matched = toMatch(route, pathname)
    if (matched) {
      return matched
    }
  }
  return null
}
