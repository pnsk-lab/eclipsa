import type { JSX } from '../../jsx/jsx-runtime.ts'

type Key = string | number | symbol
type ShowBranch<T> = JSX.Element | ((value: T) => JSX.Element)

interface ForValue<T> {
  __e_for: true
  arr: readonly T[]
  directRowUpdates?: boolean
  domOnlyRows?: boolean
  fallback?: JSX.Element
  fn: (e: T, i: number) => JSX.Element
  key?: (e: T, i: number) => Key
  keyMember?: string
  reactiveIndex?: boolean
  reactiveRows?: boolean
}

interface ShowValue<T> {
  __e_show: true
  children: ShowBranch<T>
  fallback?: ShowBranch<T>
  when: T
}

export const For = <T>(props: {
  arr: readonly T[]
  directRowUpdates?: boolean
  fallback?: JSX.Element
  fn: (e: T, i: number) => JSX.Element
  key?: (e: T, i: number) => Key
  domOnlyRows?: boolean
  reactiveIndex?: boolean
  reactiveRows?: boolean
}) =>
  ({
    __e_for: true,
    arr: props.arr,
    directRowUpdates: props.directRowUpdates,
    domOnlyRows: props.domOnlyRows,
    fallback: props.fallback,
    fn: props.fn,
    key: props.key,
    keyMember: (props as typeof props & { keyMember?: string }).keyMember,
    reactiveIndex: props.reactiveIndex,
    reactiveRows: props.reactiveRows,
  }) as ForValue<T> as unknown as JSX.Element

export const Show = <T>(props: { children: ShowBranch<T>; fallback?: ShowBranch<T>; when: T }) =>
  ({
    __e_show: true,
    children: props.children,
    fallback: props.fallback,
    when: props.when,
  }) as ShowValue<T> as unknown as JSX.Element
