// deno-lint-ignore no-namespace
export namespace JSX {
  export type Type = string | ((props: unknown) => Element)
  export type Childable = Element
  export type Element =
    | {
        type: Type
        props: Record<string, unknown>
        key?: string | number | symbol | null
        isStatic: boolean
        metadata?: Metadata
      }
    | string
    | number
    | undefined
    | null
    | boolean
    | ((() => Element) & { key?: string | number | symbol })
  export interface Metadata {
    componentID?: number
    fileid?: string
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
