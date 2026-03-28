import type { JSX } from '../jsx/types.ts'
import {
  ROUTE_LINK_ATTR,
  ROUTE_PREFETCH_ATTR,
  ROUTE_REPLACE_ATTR,
  type LinkPrefetchMode,
  type Navigate,
  type RouteLocation,
  type RouteParams,
} from './router-shared.ts'
import {
  notFound as throwRouteNotFound,
  useRuntimeLocation,
  useRuntimeRouteError,
  useRuntimeNavigate,
  useRuntimeRouteParams,
} from './runtime.ts'

export interface LinkProps extends Record<string, unknown> {
  children?: JSX.Element | JSX.Element[]
  href: string
  prefetch?: LinkPrefetchMode | boolean
  reloadDocument?: boolean
  replace?: boolean
}

export const Link = (props: LinkProps) => {
  const reloadDocument = props.reloadDocument === true
  const prefetchMode =
    props.prefetch === undefined
      ? undefined
      : props.prefetch === true
        ? 'intent'
        : props.prefetch === false
          ? 'none'
          : props.prefetch

  const nextProps: Record<string, unknown> = {
    ...props,
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
