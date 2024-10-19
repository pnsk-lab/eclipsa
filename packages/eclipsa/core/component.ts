import type { JSX } from '../jsx/types.ts'

export type Component<T = unknown> = (props: T) => JSX.Element

export const component$ = <T = unknown>(component: Component<T>): Component<T> => {
  return component
}
