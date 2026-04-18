import type { NativeChild, NativeElementType } from '@eclipsa/native-core'

export namespace JSX {
  export type Element = NativeChild
  export type ElementType = NativeElementType<object>

  export interface ElementChildrenAttribute {
    children: unknown
  }

  export interface IntrinsicAttributes {
    key?: number | string | symbol
  }

  export interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>
  }
}
