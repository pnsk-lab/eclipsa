export type Signal<T = unknown> = { value: T }
export type Effect = () => void
export type Cleanup = () => void

const signalRecords = new WeakMap<object, { effects: Set<Effect>; value: unknown }>()
let currentEffect: Effect | null = null
let currentCleanups: Cleanup[] | null = null

export const isSignal = (value: unknown): value is Signal =>
  !!value && (typeof value === 'object' || typeof value === 'function') && signalRecords.has(value)

const createSignal = <T>(initialValue: T): Signal<T> => {
  const record = {
    effects: new Set<Effect>(),
    value: initialValue as unknown,
  }
  const handle = {} as Signal<T>
  signalRecords.set(handle, record)
  Object.defineProperty(handle, 'value', {
    configurable: true,
    enumerable: true,
    get() {
      if (currentEffect) {
        record.effects.add(currentEffect)
      }
      return record.value as T
    },
    set(nextValue: T) {
      if (Object.is(record.value, nextValue)) {
        return
      }
      record.value = nextValue
      const effects = Array.from(record.effects)
      for (const effect of effects) {
        effect()
      }
    },
  })
  return handle
}

export const useSignal = createSignal
export const signal = createSignal

export const effect = (fn: () => void) => {
  const run = () => {
    currentEffect = run
    try {
      fn()
    } finally {
      currentEffect = null
    }
  }
  run()
  return run
}

export const onCleanup = (fn: Cleanup) => {
  currentCleanups?.push(fn)
}

export const onMount = (fn: () => void) => {
  fn()
}

export const onVisible = (fn: () => void) => {
  fn()
}

export const useWatch = (fn: () => void) => effect(fn)

export const useComputed = <T>(fn: () => T): Signal<T> => {
  const computed = createSignal(fn())
  effect(() => {
    computed.value = fn()
  })
  return computed
}

export const useComputed$ = useComputed

export const pushCleanupScope = (cleanups: Cleanup[]) => {
  const previousCleanups = currentCleanups
  currentCleanups = cleanups
  return previousCleanups
}

export const popCleanupScope = (previousCleanups: Cleanup[] | null) => {
  currentCleanups = previousCleanups
}

export const createFixedSignalEffect = <T>(
  signal: Signal<T>,
  fn: (value: T) => void,
  options?: { skipInitialRun?: boolean },
) => {
  const record = signalRecords.get(signal)
  if (!record) {
    return false
  }
  const run = () => fn(record.value as T)
  record.effects.add(run)
  currentCleanups?.push(() => record.effects.delete(run))
  if (options?.skipInitialRun !== true) {
    run()
  }
  return true
}
