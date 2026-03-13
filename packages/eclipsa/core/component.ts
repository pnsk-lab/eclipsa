import type { JSX } from '../jsx/types.ts'

export type Component<T = unknown> = (props: T) => JSX.Element
export type EURL<T> = T

export const component$ = <T = unknown>(component: Component<T>): Component<T> => {
  Object.defineProperty(component, '__eclipsa_component', {
    configurable: true,
    enumerable: false,
    value: true,
  })
  return component
}

export const $ = <T>(value: T): EURL<T> => value
