import type { JSX } from '../../jsx/jsx-runtime.ts'

export const For = <T>(props: { arr: T[]; fn: (e: T, i: number) => JSX.Element }) => {
  const result: JSX.Element[] = []
  for (let i = 0; i < props.arr.length; i++) {
    result.push(props.fn(props.arr[i], i))
  }
  return result as unknown as JSX.Element
}
