import type { JSX } from '../jsx/types.ts'

export type Component<T = unknown> = (props: T) => JSX.Element
export type EURL<T> = T
