import type { JSX } from '../jsx/types.ts'
import { component$ } from './component.ts'
import {
  ROUTE_LINK_ATTR,
  ROUTE_PREFETCH_ATTR,
  ROUTE_REPLACE_ATTR,
  type LinkPrefetchMode,
  type Navigate,
  type RouteParams,
} from './router-shared.ts'
import {
  notFound as throwRouteNotFound,
  useRuntimeNavigate,
  useRuntimeRouteParams,
} from './runtime.ts'

export interface LinkProps extends Record<string, unknown> {
  children?: JSX.Element | JSX.Element[]
  href: string
  prefetch?: LinkPrefetchMode | boolean
  replace?: boolean
}

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

const appendClientChildren = (parent: Element, value: unknown) => {
  let resolved = value
  while (typeof resolved === 'function') {
    resolved = resolved()
  }

  if (Array.isArray(resolved)) {
    for (const entry of resolved) {
      appendClientChildren(parent, entry)
    }
    return
  }
  if (resolved === null || resolved === undefined || resolved === false) {
    return
  }
  if (resolved instanceof Node) {
    parent.appendChild(resolved)
    return
  }

  parent.appendChild(document.createTextNode(String(resolved)))
}

const createClientLinkNode = (props: LinkProps) => {
  const anchor = document.createElement('a')
  anchor.setAttribute(ROUTE_LINK_ATTR, '')
  const prefetchMode = normalizeLinkPrefetchMode(props.prefetch)

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

  appendClientChildren(anchor, props.children)
  return anchor
}

export const Link = component$((props: LinkProps) => {
  if (typeof document !== 'undefined') {
    return createClientLinkNode(props) as unknown as JSX.Element
  }

  const prefetchMode = normalizeLinkPrefetchMode(props.prefetch)
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
})

export const useNavigate = (): Navigate => useRuntimeNavigate()

export const useRouteParams = (): RouteParams => useRuntimeRouteParams()

export const notFound = (): never => throwRouteNotFound()
