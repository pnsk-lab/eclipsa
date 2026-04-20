import { getContextProviderMeta } from './context.ts'

export type NativeKey = number | string | symbol
export type NativePrimitive = bigint | boolean | null | number | string | undefined

export const Fragment = Symbol.for('eclipsa.native.fragment')
export const NativeComponentType = Symbol.for('eclipsa.native.component-type')

export interface NativeComponentDescriptor<P = object> {
  [NativeComponentType]: NativeElementType<P>
}

export interface NativeElement<P = object> {
  key?: NativeKey
  props: P & {
    children?: NativeChild
  }
  type: NativeElementType<P>
}

export type NativeComponent<P = object> = (props: P) => NativeChild

export type NativeElementType<P = object> =
  | NativeComponent<P>
  | NativeComponentDescriptor<P>
  | typeof Fragment
  | string

export type NativeChild = NativeElement | NativePrimitive | readonly NativeChild[]

const normalizeChildren = (value: readonly NativeChild[]): NativeChild => {
  if (value.length === 0) {
    return undefined
  }
  if (value.length === 1) {
    return value[0]
  }
  return value
}

export const createElement = <P extends object>(
  type: NativeElementType<P>,
  props?: (P & { children?: NativeChild; key?: NativeKey }) | null,
  ...children: NativeChild[]
): NativeElement<P> => {
  const key = props?.key
  const nextProps = {
    ...props,
    ...(children.length > 0 ? { children: normalizeChildren(children) } : {}),
  } as P & {
    children?: NativeChild
    key?: NativeKey
  }
  if ('key' in nextProps) {
    delete nextProps.key
  }
  return {
    ...(key === undefined ? {} : { key }),
    props: nextProps,
    type,
  }
}

export const h = createElement

export const isNativeElement = (value: unknown): value is NativeElement =>
  !!value &&
  typeof value === 'object' &&
  'props' in value &&
  'type' in value &&
  typeof (value as { props?: unknown }).props === 'object'

export const isNativeComponentType = (value: unknown): value is NativeComponent =>
  typeof value === 'function' && !getContextProviderMeta(value)

export const createNativeComponentDescriptor = <P extends object>(
  type: NativeElementType<P>,
): NativeComponentDescriptor<P> =>
  Object.freeze({
    [NativeComponentType]: type,
  }) as NativeComponentDescriptor<P>

export const isNativeComponentDescriptor = (value: unknown): value is NativeComponentDescriptor =>
  !!value &&
  (typeof value === 'object' || typeof value === 'function') &&
  NativeComponentType in (value as Record<PropertyKey, unknown>)

export const resolveNativeComponentDescriptor = <P extends object>(
  value: NativeComponentDescriptor<P>,
) => value[NativeComponentType]

export const toChildArray = (value: NativeChild): NativeChild[] => {
  const result: NativeChild[] = []
  const append = (candidate: NativeChild) => {
    if (candidate === null || candidate === undefined || typeof candidate === 'boolean') {
      return
    }
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        append(entry)
      }
      return
    }
    result.push(candidate)
  }
  append(value)
  return result
}
