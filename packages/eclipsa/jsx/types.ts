// deno-lint-ignore no-namespace
export namespace JSX {
  export type Type = string | ((props: unknown) => Element)
  export type Childable = Element | string | number | null | undefined | boolean
  export type Element = {
    type: Type
    props: Record<string, unknown>
    children: Childable[] | Childable
    key: string | number | symbol
    isStatic: boolean
  }

  export interface IntrinsicAttributes {
    key?: any
  }

  export interface IntrinsicElements {
    [name: string]: any
  }

  export interface ElementChildrenAttribute {
    children?: any
  }
}
