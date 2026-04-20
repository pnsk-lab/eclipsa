export const ROUTE_LINK_ATTR = 'data-e-link'
export const ROUTE_DATA_ENDPOINT = '/__eclipsa/route-data'
export const ROUTE_DATA_REQUEST_HEADER = 'x-eclipsa-route-data'
export const ROUTE_MANIFEST_ELEMENT_ID = 'eclipsa-route-manifest'
export const ROUTE_PREFETCH_ATTR = 'data-e-link-prefetch'
export const ROUTE_PREFLIGHT_ENDPOINT = '/__eclipsa/route-preflight'
export const ROUTE_PREFLIGHT_REQUEST_HEADER = 'x-eclipsa-route-preflight'
export const ROUTE_RPC_URL_HEADER = 'x-eclipsa-route-url'
export const ROUTE_REPLACE_ATTR = 'data-e-link-replace'

export interface NavigateOptions {
  replace?: boolean
}

export type RoutePathParamValue = string | number | boolean
export type RoutePathParamInput = RoutePathParamValue | null | undefined
export type RoutePathRestParamInput = RoutePathParamValue | readonly RoutePathParamValue[]
export type RouteSearchParamValue =
  | RoutePathParamValue
  | readonly RoutePathParamValue[]
  | null
  | undefined
export type RouteSearchParamsInput = URLSearchParams | Record<string, RouteSearchParamValue>

type TrimLeadingSlash<Path extends string> = Path extends `/${infer Rest}`
  ? TrimLeadingSlash<Rest>
  : Path

type TrimTrailingSlash<Path extends string> = Path extends `${infer Rest}/`
  ? TrimTrailingSlash<Rest>
  : Path

type NormalizePath<Path extends string> = TrimTrailingSlash<TrimLeadingSlash<Path>>

type SplitPath<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? [Head, ...SplitPath<Tail>]
  : [Path]

type PathSegments<Path extends string> = NormalizePath<Path> extends ''
  ? []
  : SplitPath<NormalizePath<Path>>

type RequiredParamName<Segment extends string> = Segment extends `[${infer Name}]`
  ? Segment extends `[[${string}]]`
    ? never
    : Segment extends `[...${string}]`
      ? never
      : Name
  : never

type OptionalParamName<Segment extends string> = Segment extends `[[${infer Name}]]` ? Name : never

type RestParamName<Segment extends string> = Segment extends `[...${infer Name}]` ? Name : never

type RouteRequiredParamNames<Path extends string> = RequiredParamName<PathSegments<Path>[number]>
type RouteOptionalParamNames<Path extends string> = OptionalParamName<PathSegments<Path>[number]>
type RouteRestParamNames<Path extends string> = RestParamName<PathSegments<Path>[number]>

export type RoutePathParams<Path extends string> = string extends Path
  ? Record<string, RoutePathParamInput | RoutePathRestParamInput>
  : {
      [Name in RouteRequiredParamNames<Path>]: RoutePathParamValue
    } & {
      [Name in RouteOptionalParamNames<Path>]?: RoutePathParamInput
    } & {
      [Name in RouteRestParamNames<Path>]: RoutePathRestParamInput
    }

type RoutePathParamsArg<Path extends string> = string extends Path
  ? { params?: RoutePathParams<Path> }
  : keyof RoutePathParams<Path> extends never
    ? { params?: RoutePathParams<Path> }
    : { params: RoutePathParams<Path> }

export type RouteTarget<Path extends string = string> = {
  hash?: string
  replace?: boolean
  search?: RouteSearchParamsInput
  to: Path
} & RoutePathParamsArg<Path>

export interface Navigate {
  (href: string, options?: NavigateOptions): Promise<void>
  <Path extends string>(target: RouteTarget<Path>, options?: NavigateOptions): Promise<void>
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

const normalizeRoutePathTemplate = (path: string) => {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '/') {
    return '/'
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

const toTemplateSegments = (path: string) =>
  normalizeRoutePathTemplate(path)
    .split('/')
    .filter(Boolean)

const encodeRouteSegmentValue = (value: RoutePathParamValue) => encodeURIComponent(String(value))

const appendSearchParams = (search: URLSearchParams, value: Record<string, RouteSearchParamValue>) => {
  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === null || rawValue === undefined) {
      continue
    }
    if (Array.isArray(rawValue)) {
      for (const entry of rawValue) {
        search.append(key, String(entry))
      }
      continue
    }
    search.append(key, String(rawValue))
  }
}

export const buildRoutePath = <Path extends string>(
  path: Path,
  params?: RoutePathParams<Path>,
): string => {
  const segments = toTemplateSegments(path)
  if (segments.length === 0) {
    return '/'
  }

  const resolved: string[] = []
  for (const segment of segments) {
    const optionalMatch = /^\[\[([^\]]+)\]\]$/.exec(segment)
    if (optionalMatch) {
      const value = params?.[optionalMatch[1]! as keyof RoutePathParams<Path>]
      if (value === null || value === undefined) {
        continue
      }
      if (Array.isArray(value)) {
        throw new Error(`Optional route parameter "${optionalMatch[1]}" does not accept array values.`)
      }
      resolved.push(encodeRouteSegmentValue(value as RoutePathParamValue))
      continue
    }

    const restMatch = /^\[\.\.\.([^\]]+)\]$/.exec(segment)
    if (restMatch) {
      const value = params?.[restMatch[1]! as keyof RoutePathParams<Path>]
      if (value === null || value === undefined) {
        throw new Error(`Missing route parameter "${restMatch[1]}" for path "${path}".`)
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          throw new Error(`Route parameter "${restMatch[1]}" requires at least one segment.`)
        }
        for (const entry of value) {
          resolved.push(encodeRouteSegmentValue(entry))
        }
      } else {
        resolved.push(encodeRouteSegmentValue(value as RoutePathParamValue))
      }
      continue
    }

    const requiredMatch = /^\[([^\]]+)\]$/.exec(segment)
    if (requiredMatch) {
      const value = params?.[requiredMatch[1]! as keyof RoutePathParams<Path>]
      if (value === null || value === undefined || Array.isArray(value)) {
        throw new Error(`Missing route parameter "${requiredMatch[1]}" for path "${path}".`)
      }
      resolved.push(encodeRouteSegmentValue(value as RoutePathParamValue))
      continue
    }

    resolved.push(segment)
  }

  return `/${resolved.join('/')}`
}

export const createRouteHref = <Path extends string>(target: RouteTarget<Path>): string => {
  const pathname = buildRoutePath(target.to, target.params)
  const searchParams = new URLSearchParams()

  if (target.search) {
    if (target.search instanceof URLSearchParams) {
      for (const [key, value] of target.search.entries()) {
        searchParams.append(key, value)
      }
    } else {
      appendSearchParams(searchParams, target.search)
    }
  }

  const query = searchParams.toString()
  const hash = target.hash ? (target.hash.startsWith('#') ? target.hash : `#${target.hash}`) : ''
  return `${pathname}${query ? `?${query}` : ''}${hash}`
}

export const normalizeNavigateInput = <Path extends string>(
  input: string | RouteTarget<Path>,
  options?: NavigateOptions,
): { href: string; replace: boolean } => {
  if (typeof input === 'string') {
    return {
      href: input,
      replace: options?.replace ?? false,
    }
  }
  return {
    href: createRouteHref(input),
    replace: options?.replace ?? input.replace ?? false,
  }
}
