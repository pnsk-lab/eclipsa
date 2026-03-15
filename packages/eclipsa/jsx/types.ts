// deno-lint-ignore no-namespace
export namespace JSX {
  export interface SSRTemplate {
    __e_ssr_template: true
    strings: readonly string[]
    values: readonly unknown[]
  }

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
    | SSRTemplate
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
