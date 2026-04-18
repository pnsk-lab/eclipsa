import { createElement, Fragment } from '@eclipsa/native-core'
import type { NativeChild, NativeElementType } from '@eclipsa/native-core'
import { resolveNativeElementType } from './runtime.ts'

export type { JSX } from './jsx-types.ts'

const withKey = (props: Record<string, unknown> | null | undefined, key: unknown) =>
  key === undefined ? props : { ...props, key }

export const jsx = (
  type: NativeElementType<object>,
  props: Record<string, unknown> | null,
  key?: unknown,
): NativeChild => createElement(resolveNativeElementType(type), withKey(props, key))

export const jsxs = jsx

export { Fragment }
