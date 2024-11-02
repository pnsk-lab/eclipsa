import type { JSX } from '../../jsx/jsx-runtime.ts'
import { effect, useSignal } from '../signal.ts'

export const For = <T>(props: {
  arr: T[]
  fn: (e: T, i: number) => JSX.Element
}) => {
  let map = new Map<string | number | symbol, {
    item: unknown
    lastRendered: JSX.Element
  }>()

  const result = useSignal<JSX.Element[]>([])
  effect(() => {
    const newResult: JSX.Element[] = []
    const arr = props.arr
    const fn = props.fn
    const newMap: typeof map = new Map()
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i]
      const elem = fn(item, i)
      if (
        (typeof elem === 'function' || typeof elem === 'object') &&
        (elem !== null) && ('key' in elem) && elem.key !== undefined &&
        elem.key !== null
      ) {
        const got = map.get(elem.key)
        if (got) {
          if (got.item === item) {
            newResult.push(got.lastRendered)
            continue
          }
        }
        const thisElem = typeof elem === 'function' ? elem() : elem
        newResult.push(thisElem)
        newMap.set(elem.key, {
          item,
          lastRendered: thisElem,
        })
      } else {
        throw new Error('Key is expected.')
      }
    }
    map = newMap
    result.value = newResult
  })

  return (() => result.value) as unknown as JSX.Element
}
