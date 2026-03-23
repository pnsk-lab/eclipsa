import type { JSX } from '../jsx/types.ts'
import { registerRuntimeScopedStyle } from './runtime.ts'

const DANGEROUSLY_SET_INNER_HTML_PROP = 'dangerouslySetInnerHTML'

interface StyleElement {
  props: Record<string, unknown>
  type: 'style'
}

const isTemplateStringsArray = (value: unknown): value is TemplateStringsArray =>
  Array.isArray(value) && Array.isArray((value as unknown as TemplateStringsArray).raw)

const isStyleElement = (value: unknown): value is StyleElement =>
  !!value &&
  typeof value === 'object' &&
  'type' in value &&
  'props' in value &&
  (value as StyleElement).type === 'style'

const flattenStyleText = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((entry) => flattenStyleText(entry)).join('')
  }
  if (value === null || value === undefined || value === false) {
    return ''
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  throw new TypeError('useStyleScoped() only accepts text children inside <style>.')
}

const resolveTaggedTemplateCss = (strings: TemplateStringsArray, values: unknown[]) =>
  strings.reduce(
    (result, segment, index) => result + segment + (index < values.length ? String(values[index]) : ''),
    '',
  )

const resolveStyleInput = (
  value: JSX.Element | string,
): {
  attributes: Record<string, unknown>
  cssText: string
} => {
  if (typeof value === 'string') {
    return {
      attributes: {},
      cssText: value,
    }
  }

  if (!isStyleElement(value)) {
    throw new TypeError(
      'useStyleScoped() expects a CSS string, a tagged template literal, or a <style> element.',
    )
  }

  const attributes = { ...value.props }
  const innerHTML = attributes[DANGEROUSLY_SET_INNER_HTML_PROP]
  delete attributes.children
  delete attributes[DANGEROUSLY_SET_INNER_HTML_PROP]

  return {
    attributes,
    cssText:
      innerHTML !== undefined ? flattenStyleText(innerHTML) : flattenStyleText(value.props.children),
  }
}

export function useStyleScoped(strings: TemplateStringsArray, ...values: unknown[]): void
export function useStyleScoped(value: JSX.Element | string): void
export function useStyleScoped(
  input: JSX.Element | string | TemplateStringsArray,
  ...values: unknown[]
): void {
  const resolved = isTemplateStringsArray(input)
    ? {
        attributes: {},
        cssText: resolveTaggedTemplateCss(input, values),
      }
    : resolveStyleInput(input)

  registerRuntimeScopedStyle(resolved.cssText, resolved.attributes)
}
