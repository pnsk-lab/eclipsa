import { signal, effect as alienEffect } from 'alien-signals'

interface Signal<T> {
  value: T
}
interface UseSignal {
  <T>(v: T): Signal<T>
  <T>(v?: T | undefined): Signal<T | undefined>
}
export const useSignal: UseSignal = (value) => {
  const sig = signal(value)
  return {
    get value() {
      return sig.get()
    },
    set value(value) {
      sig.set(value)
    },
  }
}
export const effect = (fn: () => void) => alienEffect(fn)

export const useComputed = <T>(fn: () => T) => {
  const result = useSignal<T>()

  effect(() => {
    result.value = fn()
  })

  return result as Signal<T>
}
