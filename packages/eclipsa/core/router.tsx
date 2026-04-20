import type { JSX } from '../jsx/types.ts'
import {
  ROUTE_LINK_ATTR,
  ROUTE_PREFETCH_ATTR,
  ROUTE_REPLACE_ATTR,
  createRouteHref,
  type LinkPrefetchMode,
  type Navigate,
  type RouteLocation,
  type RouteTarget,
  type RouteParams,
} from './router-shared.ts'
import {
  notFound as throwRouteNotFound,
  useRuntimeLocation,
  useRuntimeRouteError,
  useRuntimeNavigate,
  useRuntimeRouteParams,
} from './runtime.ts'

interface LinkBaseProps extends Record<string, unknown> {
  children?: JSX.Element | JSX.Element[]
  prefetch?: LinkPrefetchMode | boolean
  reloadDocument?: boolean
  replace?: boolean
}

interface LinkHrefProps {
  href: string
  hash?: never
  params?: never
  search?: never
  to?: never
}

type LinkRouteTargetProps<Path extends string = string> = Omit<RouteTarget<Path>, 'replace'> & {
  href?: never
}

export type LinkProps<Path extends string = string> = LinkBaseProps &
  (LinkHrefProps | LinkRouteTargetProps<Path>)

const normalizeLinkPrefetchMode = (
  prefetch: LinkProps['prefetch'],
): LinkPrefetchMode | undefined => {
  if (prefetch === undefined) {
    return undefined
  }
  if (prefetch === true) {
    return 'intent'
  }
  if (prefetch === false) {
    return 'none'
  }
  return prefetch
}

const resolveLinkHref = (props: LinkProps): string => {
  if ('href' in props && typeof props.href === 'string') {
    return props.href
  }
  if ('to' in props && typeof props.to === 'string') {
    const target: RouteTarget = {
      to: props.to,
      params: props.params,
      search: props.search,
      hash: props.hash,
    }
    return createRouteHref(target)
  }
  throw new Error('Link requires either "href" or "to".')
}

export const Link = (props: LinkProps) => {
  const reloadDocument = props.reloadDocument === true
  const prefetchMode = normalizeLinkPrefetchMode(props.prefetch)
  const nextProps: Record<string, unknown> = {
    ...props,
    href: resolveLinkHref(props),
  }

  if (!reloadDocument) {
    nextProps[ROUTE_LINK_ATTR] = ''
    if (prefetchMode) {
      nextProps[ROUTE_PREFETCH_ATTR] = prefetchMode
    }
    if (props.replace) {
      nextProps[ROUTE_REPLACE_ATTR] = 'true'
    }
  }
  delete nextProps.prefetch
  delete nextProps.reloadDocument
  delete nextProps.replace
  delete nextProps.to
  delete nextProps.params
  delete nextProps.search
  delete nextProps.hash

  return {
    isStatic: true,
    props: nextProps,
    type: 'a',
  } satisfies JSX.Element
}

export const useNavigate = (): Navigate => useRuntimeNavigate()

export const useLocation = (): RouteLocation => useRuntimeLocation()

export const useRouteParams = (): RouteParams => useRuntimeRouteParams()

export const useRouteError = <T = unknown>(): T | undefined =>
  useRuntimeRouteError() as T | undefined

export const notFound = (): never => throwRouteNotFound()
