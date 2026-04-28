export const ROUTE_LINK_ATTR = 'data-e-link'
export const ROUTE_DATA_ENDPOINT = '/__eclipsa/route-data'
export const ROUTE_DATA_REQUEST_HEADER = 'x-eclipsa-route-data'
export const ROUTE_MANIFEST_ELEMENT_ID = 'eclipsa-route-manifest'
export const ROUTE_PREFETCH_ATTR = 'data-e-link-prefetch'
export const ROUTE_PREFLIGHT_ENDPOINT = '/__eclipsa/route-preflight'
export const ROUTE_PREFLIGHT_REQUEST_HEADER = 'x-eclipsa-route-preflight'
export const ROUTE_RPC_URL_HEADER = 'x-eclipsa-route-url'
export const ROUTE_RPC_URL_QUERY = '__eclipsa_route_url'
export const ROUTE_REPLACE_ATTR = 'data-e-link-replace'

export interface NavigateOptions {
  replace?: boolean
}

export interface Navigate {
  (href: string, options?: NavigateOptions): Promise<void>
  readonly isNavigating: boolean
}

export type LinkPrefetchMode = 'focus' | 'hover' | 'intent' | 'none'

export interface RouteLocation {
  readonly hash: string
  readonly href: string
  readonly pathname: string
  readonly search: string
}

export type RouteParams = Record<string, string | string[] | undefined>

export interface StaticPath {
  params: RouteParams
}

export type GetStaticPaths = () => StaticPath[] | Promise<StaticPath[]>

export interface RoutePathSegment {
  kind: 'static' | 'required' | 'optional' | 'rest'
  value: string
}

export interface RouteModuleManifest {
  error: string | null
  hasMiddleware: boolean
  layouts: string[]
  loading: string | null
  notFound: string | null
  page: string | null
  routePath: string
  segments: RoutePathSegment[]
  server: string | null
}

export type RouteManifest = RouteModuleManifest[]
