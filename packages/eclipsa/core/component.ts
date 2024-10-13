export type Component<T> = (props: T) => void

export const component$ = <T>(component: Component<T>): Component<T> => {
  return component
}
