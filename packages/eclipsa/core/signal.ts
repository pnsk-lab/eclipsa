import {
  createEffect,
  createOnCleanup,
  createOnMount,
  createOnVisible,
  createWatch,
  useRuntimeSignal,
} from './runtime.ts'

export interface Signal<T> {
  value: T
}

interface UseSignal {
  <T>(value: T): Signal<T>
  <T>(value?: T | undefined): Signal<T | undefined>
}

export type WatchDependency<T = unknown> = Signal<T> | (() => T)

export const useSignal: UseSignal = (value) => useRuntimeSignal(value)

export const effect = (fn: () => void) => createEffect(fn)
export const onCleanup = (fn: () => void) => createOnCleanup(fn)
export const onMount = (fn: () => void) => createOnMount(fn)
export const onVisible = (fn: () => void) => createOnVisible(fn)
export const useWatch = (fn: () => void, dependencies?: WatchDependency[]) =>
  createWatch(fn, dependencies)

export const useComputed$ = <T>(fn: () => T) => {
  const result = useSignal<T>()

  effect(() => {
    result.value = fn()
  })

  return result as Signal<T>
}
