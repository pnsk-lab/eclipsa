type SupportedDelegatedEventName = 'change' | 'click' | 'input' | 'submit'

type DelegatedEventMap = {
  change: Event
  click: MouseEvent
  input: InputEvent
  submit: SubmitEvent
}

type AttributeValue = string | number | boolean | null | undefined
type StyleValue = string | number | null | undefined
export type BindTarget<T> = {
  value: T
}

type RefProp<TElement extends globalThis.Element> = {
  value: TElement | undefined
}

type DataAttributeProps = {
  [TName in `data-${string}`]?: AttributeValue
}

type AriaAttributeProps = {
  [TName in `aria-${string}`]?: AttributeValue
}

type NamespacedAttributeProps = {
  [TName in `${string}:${string}`]?: AttributeValue
}

type HyphenatedAttributeProps = {
  [TName in `${string}-${string}`]?: AttributeValue
}

export type DelegatedEvent<
  TCurrentTarget extends globalThis.Element = globalThis.Element,
  TEvent extends Event = Event,
> = Omit<TEvent, 'currentTarget'> & {
  readonly currentTarget: TCurrentTarget
}

export type EventHandler<
  TCurrentTarget extends globalThis.Element = globalThis.Element,
  TEvent extends Event = Event,
> = (event: DelegatedEvent<TCurrentTarget, TEvent>) => unknown

type DelegatedEventProps<TElement extends globalThis.Element> = {
  [TName in SupportedDelegatedEventName as `on${Capitalize<TName>}`]?: EventHandler<
    TElement,
    DelegatedEventMap[TName]
  >
}

interface BaseIntrinsicElementProps<TElement extends globalThis.Element>
  extends AriaAttributeProps, DataAttributeProps, DelegatedEventProps<TElement> {
  children?: unknown
  class?: string | undefined
  dangerouslySetInnerHTML?: string | null | undefined
  id?: string | undefined
  ref?: RefProp<TElement> | RefProp<globalThis.Element> | undefined
  role?: string | undefined
  slot?: string | undefined
  style?: string | Record<string, StyleValue> | undefined
  tabIndex?: number | undefined
  title?: string | undefined
}

interface HTMLIntrinsicElementProps<
  TElement extends HTMLElement,
> extends BaseIntrinsicElementProps<TElement> {
  accessKey?: string | undefined
  autoCapitalize?: string | undefined
  autoFocus?: boolean | undefined
  contentEditable?: boolean | 'inherit' | 'plaintext-only' | undefined
  dir?: 'auto' | 'ltr' | 'rtl' | undefined
  draggable?: boolean | undefined
  enterKeyHint?: 'done' | 'enter' | 'go' | 'next' | 'previous' | 'search' | 'send' | undefined
  hidden?: boolean | undefined
  inert?: boolean | undefined
  inputMode?:
    | 'decimal'
    | 'email'
    | 'none'
    | 'numeric'
    | 'search'
    | 'tel'
    | 'text'
    | 'url'
    | undefined
  lang?: string | undefined
  spellCheck?: boolean | undefined
  translate?: 'no' | 'yes' | undefined
}

interface SVGIntrinsicElementProps<TElement extends SVGElement>
  extends BaseIntrinsicElementProps<TElement>, HyphenatedAttributeProps, NamespacedAttributeProps {
  color?: string | undefined
  cx?: number | string | undefined
  cy?: number | string | undefined
  d?: string | undefined
  fill?: string | undefined
  gradientTransform?: string | undefined
  gradientUnits?: string | undefined
  height?: number | string | undefined
  offset?: number | string | undefined
  opacity?: number | string | undefined
  points?: string | undefined
  preserveAspectRatio?: string | undefined
  r?: number | string | undefined
  rx?: number | string | undefined
  ry?: number | string | undefined
  stroke?: string | undefined
  transform?: string | undefined
  version?: number | string | undefined
  viewBox?: string | undefined
  width?: number | string | undefined
  x?: number | string | undefined
  x1?: number | string | undefined
  x2?: number | string | undefined
  y?: number | string | undefined
  y1?: number | string | undefined
  y2?: number | string | undefined
  xmlns?: string | undefined
}

type ButtonType = 'button' | 'reset' | 'submit'
type CrossOrigin = 'anonymous' | 'use-credentials'
type FormEncType = 'application/x-www-form-urlencoded' | 'multipart/form-data' | 'text/plain'
type FormMethod = 'dialog' | 'get' | 'post'
type HTMLInputType =
  | 'button'
  | 'checkbox'
  | 'color'
  | 'date'
  | 'datetime-local'
  | 'email'
  | 'file'
  | 'hidden'
  | 'image'
  | 'month'
  | 'number'
  | 'password'
  | 'radio'
  | 'range'
  | 'reset'
  | 'search'
  | 'submit'
  | 'tel'
  | 'text'
  | 'time'
  | 'url'
  | 'week'
type Loading = 'eager' | 'lazy'
type ReferrerPolicy =
  | ''
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url'

interface AnchorHTMLAttributes<
  TElement extends HTMLAnchorElement,
> extends HTMLIntrinsicElementProps<TElement> {
  download?: boolean | string | undefined
  href?: string | undefined
  hreflang?: string | undefined
  ping?: string | undefined
  referrerPolicy?: ReferrerPolicy | undefined
  rel?: string | undefined
  target?: string | undefined
  type?: string | undefined
}

interface ButtonHTMLAttributes<
  TElement extends HTMLButtonElement,
> extends HTMLIntrinsicElementProps<TElement> {
  disabled?: boolean | undefined
  form?: string | undefined
  name?: string | undefined
  type?: ButtonType | undefined
  value?: number | string | undefined
}

interface FormHTMLAttributes<
  TElement extends HTMLFormElement,
> extends HTMLIntrinsicElementProps<TElement> {
  action?: string | undefined
  autoComplete?: string | undefined
  encType?: FormEncType | undefined
  method?: FormMethod | undefined
  name?: string | undefined
  noValidate?: boolean | undefined
  target?: string | undefined
}

interface ImgHTMLAttributes<
  TElement extends HTMLImageElement,
> extends HTMLIntrinsicElementProps<TElement> {
  alt?: string | undefined
  crossOrigin?: CrossOrigin | undefined
  decoding?: 'async' | 'auto' | 'sync' | undefined
  height?: number | string | undefined
  loading?: Loading | undefined
  referrerPolicy?: ReferrerPolicy | undefined
  sizes?: string | undefined
  src?: string | undefined
  srcSet?: string | undefined
  width?: number | string | undefined
}

interface InputHTMLAttributes<
  TElement extends HTMLInputElement,
> extends HTMLIntrinsicElementProps<TElement> {
  'bind:checked'?: BindTarget<boolean | undefined> | undefined
  'bind:value'?: BindTarget<number | readonly string[] | string | undefined> | undefined
  accept?: string | undefined
  alt?: string | undefined
  autoComplete?: string | undefined
  capture?: boolean | 'environment' | 'user' | undefined
  checked?: boolean | undefined
  disabled?: boolean | undefined
  form?: string | undefined
  list?: string | undefined
  max?: number | string | undefined
  maxLength?: number | undefined
  min?: number | string | undefined
  minLength?: number | undefined
  multiple?: boolean | undefined
  name?: string | undefined
  pattern?: string | undefined
  placeholder?: string | undefined
  readOnly?: boolean | undefined
  required?: boolean | undefined
  size?: number | undefined
  src?: string | undefined
  step?: number | string | undefined
  type?: HTMLInputType | undefined
  value?: number | readonly string[] | string | undefined
}

interface LabelHTMLAttributes<
  TElement extends HTMLLabelElement,
> extends HTMLIntrinsicElementProps<TElement> {
  for?: string | undefined
}

interface LinkHTMLAttributes<
  TElement extends HTMLLinkElement,
> extends HTMLIntrinsicElementProps<TElement> {
  as?: string | undefined
  crossOrigin?: CrossOrigin | undefined
  fetchPriority?: 'auto' | 'high' | 'low' | undefined
  href?: string | undefined
  hrefLang?: string | undefined
  integrity?: string | undefined
  media?: string | undefined
  referrerPolicy?: ReferrerPolicy | undefined
  rel?: string | undefined
  sizes?: string | undefined
  type?: string | undefined
}

interface MetaHTMLAttributes<
  TElement extends HTMLMetaElement,
> extends HTMLIntrinsicElementProps<TElement> {
  charset?: string | undefined
  content?: string | undefined
  httpEquiv?: string | undefined
  name?: string | undefined
}

interface OptionHTMLAttributes<
  TElement extends HTMLOptionElement,
> extends HTMLIntrinsicElementProps<TElement> {
  disabled?: boolean | undefined
  label?: string | undefined
  selected?: boolean | undefined
  value?: number | string | undefined
}

interface ScriptHTMLAttributes<
  TElement extends HTMLScriptElement,
> extends HTMLIntrinsicElementProps<TElement> {
  async?: boolean | undefined
  crossOrigin?: CrossOrigin | undefined
  defer?: boolean | undefined
  integrity?: string | undefined
  nonce?: string | undefined
  referrerPolicy?: ReferrerPolicy | undefined
  src?: string | undefined
  type?: string | undefined
}

interface SelectHTMLAttributes<
  TElement extends HTMLSelectElement,
> extends HTMLIntrinsicElementProps<TElement> {
  'bind:value'?: BindTarget<number | readonly string[] | string | undefined> | undefined
  autoComplete?: string | undefined
  disabled?: boolean | undefined
  form?: string | undefined
  multiple?: boolean | undefined
  name?: string | undefined
  required?: boolean | undefined
  size?: number | undefined
  value?: number | readonly string[] | string | undefined
}

interface StyleHTMLAttributes<
  TElement extends HTMLStyleElement,
> extends HTMLIntrinsicElementProps<TElement> {
  media?: string | undefined
  nonce?: string | undefined
}

interface TextareaHTMLAttributes<
  TElement extends HTMLTextAreaElement,
> extends HTMLIntrinsicElementProps<TElement> {
  'bind:value'?: BindTarget<number | readonly string[] | string | undefined> | undefined
  autoComplete?: string | undefined
  cols?: number | undefined
  disabled?: boolean | undefined
  form?: string | undefined
  maxLength?: number | undefined
  minLength?: number | undefined
  name?: string | undefined
  placeholder?: string | undefined
  readOnly?: boolean | undefined
  required?: boolean | undefined
  rows?: number | undefined
  value?: number | readonly string[] | string | undefined
  wrap?: 'hard' | 'off' | 'soft' | undefined
}

type HTMLElementIntrinsicElements = Omit<
  {
    [TTag in keyof HTMLElementTagNameMap]: HTMLIntrinsicElementProps<HTMLElementTagNameMap[TTag]>
  },
  | 'a'
  | 'button'
  | 'form'
  | 'img'
  | 'input'
  | 'label'
  | 'link'
  | 'meta'
  | 'option'
  | 'script'
  | 'select'
  | 'style'
  | 'textarea'
> & {
  a: AnchorHTMLAttributes<HTMLAnchorElement>
  button: ButtonHTMLAttributes<HTMLButtonElement>
  form: FormHTMLAttributes<HTMLFormElement>
  img: ImgHTMLAttributes<HTMLImageElement>
  input: InputHTMLAttributes<HTMLInputElement>
  label: LabelHTMLAttributes<HTMLLabelElement>
  link: LinkHTMLAttributes<HTMLLinkElement>
  meta: MetaHTMLAttributes<HTMLMetaElement>
  option: OptionHTMLAttributes<HTMLOptionElement>
  script: ScriptHTMLAttributes<HTMLScriptElement>
  select: SelectHTMLAttributes<HTMLSelectElement>
  style: StyleHTMLAttributes<HTMLStyleElement>
  textarea: TextareaHTMLAttributes<HTMLTextAreaElement>
}

type SVGElementIntrinsicElements = {
  [TTag in keyof SVGElementTagNameMap]: SVGIntrinsicElementProps<SVGElementTagNameMap[TTag]>
}

type NamespacedIntrinsicElementProps = {
  [name: string]: AttributeValue | undefined
}

// deno-lint-ignore no-namespace
export namespace JSX {
  export interface SSRTemplate {
    __e_ssr_template: true
    strings: readonly string[]
    values: readonly unknown[]
  }

  export type Type = string | ((props: unknown) => Element)
  export type Childable = Element | Element[]
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
    key?: string | number | symbol | null | undefined
  }

  export type IntrinsicElements = HTMLElementIntrinsicElements &
    SVGElementIntrinsicElements & {
      [name: `${string}-${string}`]: HTMLIntrinsicElementProps<HTMLElement>
      [name: `${string}:${string}`]: NamespacedIntrinsicElementProps
    }

  export interface ElementChildrenAttribute {
    children?: unknown
  }
}
