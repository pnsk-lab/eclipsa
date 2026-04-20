import { FRAGMENT } from './shared.ts'
import type { JSX } from './types.ts'

export interface SSRAttrValue {
  __e_ssr_attr: true
  name: string
  value: unknown
}

export interface SSRRawValue {
  __e_ssr_raw: true
  value: string
}

const SSR_RAW_VALUES = new WeakSet<SSRRawValue>()

export const jsxDEV = (
  type: JSX.Type,
  props: Record<string, unknown>,
  key: string | number | symbol | null | undefined,
  isStatic: boolean,
  metadata: JSX.Metadata,
): JSX.Element => ({
  type,
  props,
  key,
  isStatic,
  metadata,
})

export const ssrAttr = (name: string, value: unknown): SSRAttrValue => ({
  __e_ssr_attr: true,
  name,
  value,
})

export const isSSRAttrValue = (value: unknown): value is SSRAttrValue =>
  !!value && typeof value === 'object' && (value as SSRAttrValue).__e_ssr_attr === true

export const ssrRaw = (value: string): JSX.SSRRaw => {
  const rawValue: SSRRawValue = {
    __e_ssr_raw: true,
    value,
  }
  SSR_RAW_VALUES.add(rawValue)
  return rawValue
}

export const isSSRRawValue = (value: unknown): value is SSRRawValue =>
  !!value && typeof value === 'object' && SSR_RAW_VALUES.has(value as SSRRawValue)

export const ssrTemplate = (strings: readonly string[], ...values: unknown[]): JSX.SSRTemplate => ({
  __e_ssr_template: true,
  strings,
  values,
})

export const isSSRTemplate = (value: unknown): value is JSX.SSRTemplate =>
  !!value && typeof value === 'object' && (value as JSX.SSRTemplate).__e_ssr_template === true

export const Fragment = FRAGMENT
