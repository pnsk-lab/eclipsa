export const ROUTE_LINK_ATTR = 'data-e-link'
export const ROUTE_MANIFEST_ELEMENT_ID = 'eclipsa-route-manifest'
export const ROUTE_REPLACE_ATTR = 'data-e-link-replace'

export interface NavigateOptions {
  replace?: boolean
}

export interface Navigate {
  (href: string, options?: NavigateOptions): Promise<void>
  readonly isNavigating: boolean
}

export interface RouteModuleManifest {
  layouts: string[]
  page: string
}

export type RouteManifest = Record<string, RouteModuleManifest>
