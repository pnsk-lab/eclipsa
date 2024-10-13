import type { JSX } from '../jsx/types.ts'

export type Component<T> = (props: T) => JSX.Element

export const component$ = <T>(component: Component<T>): Component<T> => {
  return component
}
