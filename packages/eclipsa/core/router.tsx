import type { JSX } from '../jsx/types.ts'
import { component$ } from './component.ts'
import { ROUTE_LINK_ATTR, ROUTE_REPLACE_ATTR, type Navigate } from './router-shared.ts'
import { useRuntimeNavigate } from './runtime.ts'

export interface LinkProps extends Record<string, unknown> {
  children?: JSX.Element | JSX.Element[]
  href: string
  replace?: boolean
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

  if (props.replace) {
    anchor.setAttribute(ROUTE_REPLACE_ATTR, 'true')
  }

  for (const [name, value] of Object.entries(props)) {
    if (
      name === 'children' ||
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

  const nextProps: Record<string, unknown> = {
    ...props,
    [ROUTE_LINK_ATTR]: '',
  }

  if (props.replace) {
    nextProps[ROUTE_REPLACE_ATTR] = 'true'
  }
  delete nextProps.replace

  return {
    isStatic: true,
    props: nextProps,
    type: 'a',
  } satisfies JSX.Element
})

export const useNavigate = (): Navigate => useRuntimeNavigate()
