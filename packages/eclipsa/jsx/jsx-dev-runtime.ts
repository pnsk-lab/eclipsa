import { FRAGMENT } from './shared.ts'
import type { JSX } from './types.ts'

export interface SSRAttrValue {
  __e_ssr_attr: true
  name: string
  value: unknown
}

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

export const ssrTemplate = (strings: readonly string[], ...values: unknown[]): JSX.SSRTemplate => ({
  __e_ssr_template: true,
  strings: [...strings],
  values,
})

export const isSSRTemplate = (value: unknown): value is JSX.SSRTemplate =>
  !!value && typeof value === 'object' && (value as JSX.SSRTemplate).__e_ssr_template === true

export const Fragment = FRAGMENT
