import { signal, effect } from './reactive/mod.ts'

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

export { effect }
