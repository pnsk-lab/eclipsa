import {
  createStandaloneRuntimeSignal,
  createEffect,
  createOnCleanup,
  createOnMount,
  createOnVisible,
  createWatch,
  getRuntimeContainer,
  getRuntimeSignalId,
  readAsyncSignalSnapshot,
  useRuntimeSignal,
  writeAsyncSignalSnapshot,
} from './runtime.ts'
import { createPendingSignalError, isPendingSignalError } from './suspense.ts'

export interface Signal<T> {
  value: T
}

interface SignalFactory {
  <T>(value: T): Signal<T>
  <T>(value?: T | undefined): Signal<T | undefined>
  computed<T>(value: () => T | Promise<T>): Signal<T>
}

interface ComputedSnapshot<T> {
  __e_async_computed: true
  error?: unknown
  promise?: Promise<T>
  status: 'pending' | 'rejected' | 'resolved'
  value?: T
}

export type WatchDependency<T = unknown> = Signal<T> | (() => T)

const isPromiseLike = <T>(value: unknown): value is Promise<T> =>
  !!value && typeof value === 'object' && 'then' in value && typeof value.then === 'function'

const isComputedSnapshot = <T>(value: unknown): value is ComputedSnapshot<T> =>
  !!value && typeof value === 'object' && (value as ComputedSnapshot<T>).__e_async_computed === true

const createComputedSnapshot = <T>(
  snapshot: Omit<ComputedSnapshot<T>, '__e_async_computed'>,
): ComputedSnapshot<T> => ({
  __e_async_computed: true,
  ...snapshot,
})

const createComputedSignalFactory =
  (createBaseSignal: <T>(value: T) => Signal<T>): SignalFactory['computed'] =>
  <T>(fn: () => T | Promise<T>) => {
    const state = createBaseSignal<ComputedSnapshot<T>>(
      createComputedSnapshot({
        status: 'pending',
      }),
    )
    const runtimeContainer = getRuntimeContainer()
    const signalId = getRuntimeSignalId(state)
    const seededSnapshot =
      signalId !== null
        ? (readAsyncSignalSnapshot(signalId, runtimeContainer) as ComputedSnapshot<T> | undefined)
        : undefined
    let useSeededSnapshot = !!seededSnapshot && seededSnapshot.status !== 'pending'
    let version = 0

    effect(() => {
      if (useSeededSnapshot && seededSnapshot) {
        useSeededSnapshot = false
        state.value = seededSnapshot
        if (signalId !== null) {
          writeAsyncSignalSnapshot(signalId, seededSnapshot, runtimeContainer)
        }
        return
      }

      const currentVersion = ++version
      try {
        const nextValue = fn()
        if (isPromiseLike<T>(nextValue)) {
          const pending = createComputedSnapshot<T>({
            promise: nextValue,
            status: 'pending',
          })
          state.value = pending
          if (signalId !== null) {
            writeAsyncSignalSnapshot(signalId, pending, runtimeContainer)
          }
          nextValue.then(
            (resolved) => {
              if (currentVersion !== version) {
                return
              }
              const completed = createComputedSnapshot<T>({
                status: 'resolved',
                value: resolved,
              })
              state.value = completed
              if (signalId !== null) {
                writeAsyncSignalSnapshot(signalId, completed, runtimeContainer)
              }
            },
            (error) => {
              if (currentVersion !== version) {
                return
              }
              const failed = createComputedSnapshot<T>({
                error,
                status: 'rejected',
              })
              state.value = failed
              if (signalId !== null) {
                writeAsyncSignalSnapshot(signalId, failed, runtimeContainer)
              }
            },
          )
          return
        }

        const resolved = createComputedSnapshot<T>({
          status: 'resolved',
          value: nextValue,
        })
        state.value = resolved
        if (signalId !== null) {
          writeAsyncSignalSnapshot(signalId, resolved, runtimeContainer)
        }
      } catch (error) {
        if (isPendingSignalError(error)) {
          const pending = createComputedSnapshot<T>({
            promise: error.promise as Promise<T>,
            status: 'pending',
          })
          state.value = pending
          if (signalId !== null) {
            writeAsyncSignalSnapshot(signalId, pending, runtimeContainer)
          }
          return
        }
        const failed = createComputedSnapshot<T>({
          error,
          status: 'rejected',
        })
        state.value = failed
        if (signalId !== null) {
          writeAsyncSignalSnapshot(signalId, failed, runtimeContainer)
        }
      }
    })

    const handle = {} as Signal<T>
    Object.defineProperty(handle, 'value', {
      configurable: true,
      enumerable: true,
      get() {
        const snapshot = state.value
        if (!isComputedSnapshot<T>(snapshot)) {
          return snapshot as T
        }
        if (snapshot.status === 'pending') {
          throw createPendingSignalError(snapshot.promise ?? Promise.resolve(undefined))
        }
        if (snapshot.status === 'rejected') {
          throw snapshot.error
        }
        return snapshot.value as T
      },
    })
    return handle
  }

export const signal = ((value) => createStandaloneRuntimeSignal(value)) as SignalFactory

export const useSignal = ((value) => useRuntimeSignal(value)) as SignalFactory

signal.computed = createComputedSignalFactory((value) => createStandaloneRuntimeSignal(value))
useSignal.computed = createComputedSignalFactory((value) => useRuntimeSignal(value))

export const effect = (fn: () => void) => createEffect(fn)
export const onCleanup = (fn: () => void) => createOnCleanup(fn)
export const onMount = (fn: () => void) => createOnMount(fn)
export const onVisible = (fn: () => void) => createOnVisible(fn)
export const useWatch = (fn: () => void, dependencies?: WatchDependency[]) =>
  createWatch(fn, dependencies)

export const useComputed$ = <T>(fn: () => T | Promise<T>) => useSignal.computed(fn)
