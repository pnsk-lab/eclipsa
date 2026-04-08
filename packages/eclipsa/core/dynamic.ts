import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import type { JSX } from '../jsx/types.ts'
import type { Component } from './component.ts'

export type DynamicRenderable = keyof JSX.IntrinsicElements | Component<any>

type DynamicRenderableProps<TRenderable extends DynamicRenderable> = TRenderable extends keyof JSX.IntrinsicElements
  ? JSX.IntrinsicElements[TRenderable]
  : TRenderable extends Component<infer TProps>
    ? TProps
    : never

export type DynamicProps<TRenderable extends DynamicRenderable> = {
  component: TRenderable | null | undefined
} & DynamicRenderableProps<TRenderable>

type DynamicIntrinsicProps = {
  [TRenderable in keyof JSX.IntrinsicElements]: DynamicProps<TRenderable>
}[keyof JSX.IntrinsicElements]

interface DynamicComponentFn {
  (props: DynamicIntrinsicProps): JSX.Element
  <TRenderable extends Component<any>>(props: DynamicProps<TRenderable>): JSX.Element
}

const omitComponentProp = <TRenderable extends DynamicRenderable>(
  props: DynamicProps<TRenderable>,
): DynamicRenderableProps<TRenderable> => {
  const descriptors = Object.getOwnPropertyDescriptors(props)
  delete descriptors.component

  const nextProps = {}
  Object.defineProperties(nextProps, descriptors)
  return nextProps as DynamicRenderableProps<TRenderable>
}

export const Dynamic = ((props: {
  component: JSX.Type | null | undefined
} & Record<string, unknown>): JSX.Element => {
  const component = props.component
  if (component === null || component === undefined) {
    return null
  }

  return jsxDEV(
    component as JSX.Type,
    omitComponentProp(props) as Record<string, unknown>,
    null,
    false,
    {},
  )
}) as DynamicComponentFn
