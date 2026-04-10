import { isSSRAttrValue, isSSRRawValue, isSSRTemplate } from '../../jsx/jsx-dev-runtime.ts'
import type { JSX } from '../../jsx/types.ts'

interface SSRRendererDependencies {
  getCurrentContainer: () => unknown
  isProjectionSlot: (value: unknown) => boolean
  isRouteSlot: (value: unknown) => boolean
  renderProjectionSlotToString: (value: unknown) => string
  renderStringNode: (value: JSX.Element) => string
  resolveRouteSlot: (container: unknown, slot: unknown) => unknown
}

const EVENT_PROP_REGEX = /^on([A-Z].+)$/
const DANGEROUSLY_SET_INNER_HTML_PROP = 'dangerouslySetInnerHTML'
const TEXT_ESCAPE_REGEX = /[&<>]/
const ATTR_ESCAPE_REGEX = /[&<>'"]/

const escapeString = (value: string, mode: 'text' | 'attr') => {
  const escapePattern = mode === 'attr' ? ATTR_ESCAPE_REGEX : TEXT_ESCAPE_REGEX
  const firstMatch = value.search(escapePattern)
  if (firstMatch < 0) {
    return value
  }

  let output = ''
  let lastIndex = 0
  for (let index = firstMatch; index < value.length; index += 1) {
    let escaped: string | null = null
    switch (value.charCodeAt(index)) {
      case 34:
        escaped = mode === 'attr' ? '&quot;' : null
        break
      case 38:
        escaped = '&amp;'
        break
      case 39:
        escaped = mode === 'attr' ? '&#39;' : null
        break
      case 60:
        escaped = '&lt;'
        break
      case 62:
        escaped = '&gt;'
        break
    }
    if (!escaped) {
      continue
    }
    output += value.slice(lastIndex, index)
    output += escaped
    lastIndex = index + 1
  }
  return output + value.slice(lastIndex)
}

export const escapeText = (value: string) => escapeString(value, 'text')
export const escapeAttr = (value: string) => escapeString(value, 'attr')

export const resolveDangerouslySetInnerHTML = (value: unknown) =>
  value === false || value === undefined || value === null ? null : String(value)

export const toEventName = (propName: string) => {
  const matched = propName.match(EVENT_PROP_REGEX)
  if (!matched) {
    return null
  }
  const [first, ...rest] = matched[1]
  return `${first.toLowerCase()}${rest.join('')}`
}

export const isDangerouslySetInnerHTMLProp = (propName: string) =>
  propName === DANGEROUSLY_SET_INNER_HTML_PROP

export const createSSRRenderer = ({
  getCurrentContainer,
  isProjectionSlot,
  isRouteSlot,
  renderProjectionSlotToString,
  renderStringNode,
  resolveRouteSlot,
}: SSRRendererDependencies) => {
  const renderSSRAttr = (name: string, value: unknown) => {
    if (name === 'key') {
      return ''
    }
    if (value === false || value === undefined || value === null) {
      return ''
    }
    if (value === true) {
      return ` ${name}`
    }
    return ` ${name}="${escapeAttr(String(value))}"`
  }

  const renderSSRTemplateNode = (template: JSX.SSRTemplate) => {
    let output = template.strings[0] ?? ''
    for (let index = 0; index < template.values.length; index += 1) {
      const value = template.values[index]
      output += isSSRAttrValue(value)
        ? renderSSRAttr(value.name, value.value)
        : renderSSRValue(value)
      output += template.strings[index + 1] ?? ''
    }
    return output
  }

  const renderStringArray = (values: readonly (JSX.Element | JSX.Element[])[]) => {
    let output = ''
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index]
      if (Array.isArray(value)) {
        output += renderStringArray(value)
        continue
      }
      if (value === false || value === null || value === undefined) {
        continue
      }
      if (typeof value === 'string') {
        output += escapeText(value)
        continue
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        output += escapeText(String(value))
        continue
      }
      if (isSSRRawValue(value)) {
        output += value.value
        continue
      }
      if (isSSRTemplate(value)) {
        output += renderSSRTemplateNode(value)
        continue
      }
      if (isProjectionSlot(value)) {
        output += renderProjectionSlotToString(value)
        continue
      }
      if (isRouteSlot(value)) {
        const routeElement = resolveRouteSlot(getCurrentContainer(), value)
        if (routeElement) {
          output += renderStringNode(routeElement as JSX.Element)
        }
        continue
      }
      output += renderStringNode(value as JSX.Element)
    }
    return output
  }

  const renderSSRValue = (value: unknown): string => {
    if (value === false || value === null || value === undefined) {
      return ''
    }
    if (Array.isArray(value)) {
      return renderStringArray(value as readonly (JSX.Element | JSX.Element[])[])
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return escapeText(String(value))
    }
    if (isSSRRawValue(value)) {
      return value.value
    }
    if (isSSRTemplate(value)) {
      return renderSSRTemplateNode(value)
    }
    if (isProjectionSlot(value)) {
      return renderProjectionSlotToString(value)
    }
    if (isRouteSlot(value)) {
      const routeElement = resolveRouteSlot(getCurrentContainer(), value)
      return routeElement ? renderStringNode(routeElement as JSX.Element) : ''
    }
    return renderStringNode(value as JSX.Element)
  }

  const renderSSRMap = <T>(
    value:
      | readonly T[]
      | {
          map: (callback: (item: T, index: number) => string) => {
            join: (separator: string) => string
          }
        },
    renderItem: (item: T, index: number) => string,
  ): string => {
    if (Array.isArray(value)) {
      let output = ''
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          continue
        }
        output += renderItem(value[index] as T, index)
      }
      return output
    }
    return value.map(renderItem).join('')
  }

  return {
    renderSSRAttr,
    renderSSRValue,
    renderSSRMap,
  }
}
