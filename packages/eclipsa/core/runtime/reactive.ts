export type Signal<T = unknown> = { value: T }
export type Effect = () => void
export type Cleanup = () => void
type FixedSignalEffectHandler = <T>(
  signal: Signal<T>,
  fn: (value: T) => void,
  options?: { skipInitialRun?: boolean },
) => boolean

const signalRecords = new WeakMap<object, { effects: Set<Effect>; value: unknown }>()
let currentEffect: Effect | null = null
let currentCleanups: Cleanup[] | null = null
let runtimeCleanupHandler: ((fn: Cleanup) => boolean) | null = null
let runtimeEffectWrapper: ((fn: Effect) => Effect) | null = null
let runtimeFixedSignalEffectHandler: FixedSignalEffectHandler | null = null
let runtimeMountScheduler: ((fn: () => void) => boolean) | null = null
let runtimeVisibleHandler: ((fn: () => void) => boolean) | null = null

export const setRuntimeCleanupHandler = (handler: ((fn: Cleanup) => boolean) | null) => {
  runtimeCleanupHandler = handler
}

export const setRuntimeEffectWrapper = (wrapper: ((fn: Effect) => Effect) | null) => {
  runtimeEffectWrapper = wrapper
}

export const setRuntimeFixedSignalEffectHandler = (handler: FixedSignalEffectHandler | null) => {
  runtimeFixedSignalEffectHandler = handler
}

export const setRuntimeMountScheduler = (scheduler: ((fn: () => void) => boolean) | null) => {
  runtimeMountScheduler = scheduler
}

export const setRuntimeVisibleHandler = (handler: ((fn: () => void) => boolean) | null) => {
  runtimeVisibleHandler = handler
}

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
  let run: Effect
  const baseRun = () => {
    currentEffect = run
    try {
      fn()
    } finally {
      currentEffect = null
    }
  }
  run = runtimeEffectWrapper?.(baseRun) ?? baseRun
  run()
  return run
}

export const onCleanup = (fn: Cleanup) => {
  if (runtimeCleanupHandler?.(fn)) {
    return
  }
  currentCleanups?.push(fn)
}

export const onMount = (fn: () => void) => {
  const cleanups = currentCleanups
  const run = () => {
    const previousCleanups = currentCleanups
    currentCleanups = cleanups
    try {
      fn()
    } finally {
      currentCleanups = previousCleanups
    }
  }
  if (runtimeMountScheduler?.(run)) {
    return
  }
  queueMicrotask(run)
}

export const onVisible = (fn: () => void) => {
  if (runtimeVisibleHandler?.(fn)) {
    return
  }
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
  if (record) {
    const run = runtimeEffectWrapper?.(() => fn(record.value as T)) ?? (() => fn(record.value as T))
    record.effects.add(run)
    currentCleanups?.push(() => record.effects.delete(run))
    if (options?.skipInitialRun !== true) {
      run()
    }
    return true
  }
  if (runtimeFixedSignalEffectHandler?.(signal, fn, options)) {
    return true
  }
  if (options?.skipInitialRun !== true) {
    fn(signal.value)
  }
  return false
}
