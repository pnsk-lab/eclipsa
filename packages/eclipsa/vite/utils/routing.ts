import fg from 'fast-glob'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import type { RouteManifest, RouteModuleManifest } from '../../core/router-shared.ts'

export const normalizeRoutePath = (pathname: string) => {
  const normalizedPath = pathname.trim() || '/'
  const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1)
  }
  return withLeadingSlash
}

const filePathToHonoPath = (filePath: string) => {
  const segments = filePath.split('/').slice(0, -1)

  return normalizeRoutePath(segments.join('/') || '/')
}

export interface RouteEntry {
  honoPath: string
  layouts: RouteModuleEntry[]
  page: RouteModuleEntry
}

export interface RouteModuleEntry {
  entryName: string
  filePath: string
}

const toEntryName = (relativePath: string) => {
  const normalized = relativePath.replaceAll('\\', '/')
  const withoutExt = normalized.replace(/\.tsx$/, '')
  const segments = withoutExt.split('/')
  const fileName = segments.pop() ?? '+page'
  const kind = fileName === '+layout' ? 'layout' : 'route'
  const mapped = segments
    .map((segment) => segment.replaceAll(/[^a-zA-Z0-9]+/g, '_') || 'index')
    .concat(fileName === '+layout' ? 'layout' : 'page')

  return [kind, ...mapped].join('__')
}

const toRouteModuleEntry = (appDir: string, filePath: string): RouteModuleEntry => {
  const relativePath = path.relative(appDir, filePath)
  return {
    entryName: toEntryName(relativePath),
    filePath,
  }
}

const findAncestorLayouts = async (appDir: string, filePath: string) => {
  const pageDir = path.dirname(filePath)
  const relativeDir = path.relative(appDir, pageDir).replaceAll('\\', '/')
  const segments = relativeDir === '' ? [] : relativeDir.split('/')
  const layouts: RouteModuleEntry[] = []

  for (let index = 0; index <= segments.length; index += 1) {
    const candidateDir = index === 0 ? appDir : path.join(appDir, ...segments.slice(0, index))
    const candidatePath = path.join(candidateDir, '+layout.tsx')
    try {
      await fs.access(candidatePath)
      layouts.push(toRouteModuleEntry(appDir, candidatePath))
    } catch {
      continue
    }
  }

  return layouts
}

export const createRoutes = async (root: string): Promise<RouteEntry[]> => {
  const appDir = path.join(root, 'app')
  const result: RouteEntry[] = []
  for await (const entry of fg.stream(path.join(appDir, '**/+page.tsx').replaceAll('\\', '/'))) {
    const filePath = entry.toString()
    const relativePath = path.relative(appDir, filePath)
    result.push({
      honoPath: filePathToHonoPath(relativePath),
      layouts: await findAncestorLayouts(appDir, filePath),
      page: toRouteModuleEntry(appDir, filePath),
    })
  }
  return result
}

export const collectRouteModules = (routes: RouteEntry[]): RouteModuleEntry[] => {
  const modules = new Map<string, RouteModuleEntry>()
  for (const route of routes) {
    modules.set(route.page.filePath, route.page)
    for (const layout of route.layouts) {
      modules.set(layout.filePath, layout)
    }
  }
  return [...modules.values()]
}

export const createDevModuleUrl = (root: string, module: RouteModuleEntry) =>
  `/${path.relative(root, module.filePath).replaceAll('\\', '/')}`

export const createBuildModuleUrl = (module: RouteModuleEntry) => `/entries/${module.entryName}.js`

export const createBuildServerModuleUrl = (module: RouteModuleEntry) =>
  `../ssr/entries/${module.entryName}.mjs`

export const createRouteManifest = (
  routes: RouteEntry[],
  resolveUrl: (module: RouteModuleEntry) => string,
): RouteManifest =>
  Object.fromEntries(
    routes.map((route) => [
      normalizeRoutePath(route.honoPath),
      {
        layouts: route.layouts.map((layout) => resolveUrl(layout)),
        page: resolveUrl(route.page),
      } satisfies RouteModuleManifest,
    ]),
  )
