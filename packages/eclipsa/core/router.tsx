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
  replace?: boolean
}

export const Link = (props: LinkProps) => {
  const prefetchMode =
    props.prefetch === undefined
      ? undefined
      : props.prefetch === true
        ? 'intent'
        : props.prefetch === false
          ? 'none'
          : props.prefetch

  if (typeof document !== 'undefined') {
    const anchor = document.createElement('a')
    anchor.setAttribute(ROUTE_LINK_ATTR, '')

    if (props.replace) {
      anchor.setAttribute(ROUTE_REPLACE_ATTR, 'true')
    }
    if (prefetchMode) {
      anchor.setAttribute(ROUTE_PREFETCH_ATTR, prefetchMode)
    }

    for (const [name, value] of Object.entries(props)) {
      if (
        name === 'children' ||
        name === 'prefetch' ||
        name === 'replace' ||
        value === false ||
        value === undefined ||
        value === null
      ) {
        continue
      }
      if (name === 'class') {
        anchor.className = String(value)
        continue
      }
      if (name === 'style' && value && typeof value === 'object') {
        anchor.setAttribute(
          'style',
          Object.entries(value as Record<string, unknown>)
            .map(([styleName, styleValue]) => `${styleName}: ${styleValue}`)
            .join('; '),
        )
        continue
      }
      if (value === true) {
        anchor.setAttribute(name, '')
        continue
      }
      anchor.setAttribute(name, String(value))
    }

    const pendingChildren = [props.children]
    while (pendingChildren.length > 0) {
      let resolved = pendingChildren.pop()
      while (typeof resolved === 'function') {
        resolved = resolved()
      }

      if (Array.isArray(resolved)) {
        for (let index = resolved.length - 1; index >= 0; index -= 1) {
          pendingChildren.push(resolved[index])
        }
        continue
      }
      if (resolved === null || resolved === undefined || resolved === false) {
        continue
      }
      if (resolved instanceof Node) {
        anchor.appendChild(resolved)
        continue
      }

      anchor.appendChild(document.createTextNode(String(resolved)))
    }

    return anchor as unknown as JSX.Element
  }

  const nextProps: Record<string, unknown> = {
    ...props,
    [ROUTE_LINK_ATTR]: '',
  }

  if (prefetchMode) {
    nextProps[ROUTE_PREFETCH_ATTR] = prefetchMode
  }
  if (props.replace) {
    nextProps[ROUTE_REPLACE_ATTR] = 'true'
  }
  delete nextProps.prefetch
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

export const useRouteError = <T = unknown>(): T | undefined => useRuntimeRouteError() as T | undefined

export const notFound = (): never => throwRouteNotFound()
