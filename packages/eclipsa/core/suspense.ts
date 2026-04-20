import type { JSX } from '../jsx/types.ts'

const PENDING_SIGNAL_ERROR_KEY = Symbol.for('eclipsa.pending-signal-error')
const SUSPENSE_TYPE_KEY = Symbol.for('eclipsa.suspense-type')

export interface SuspenseProps {
  children?: JSX.Element | JSX.Element[] | (() => JSX.Element | JSX.Element[])
  fallback?: JSX.Element | JSX.Element[]
}

export interface PendingSignalError {
  [PENDING_SIGNAL_ERROR_KEY]: true
  promise: Promise<unknown>
}

export const Suspense = ((props: SuspenseProps): JSX.Element =>
  (props.children ?? null) as JSX.Element) as ((props: SuspenseProps) => JSX.Element) & {
  [SUSPENSE_TYPE_KEY]?: true
}

Object.defineProperty(Suspense, SUSPENSE_TYPE_KEY, {
  configurable: true,
  enumerable: false,
  value: true,
  writable: false,
})

export const createPendingSignalError = (promise: Promise<unknown>): PendingSignalError => ({
  [PENDING_SIGNAL_ERROR_KEY]: true,
  promise,
})

export const isPendingSignalError = (value: unknown): value is PendingSignalError =>
  !!value &&
  typeof value === 'object' &&
  (value as PendingSignalError)[PENDING_SIGNAL_ERROR_KEY] === true

export const isSuspenseType = (value: unknown): value is typeof Suspense =>
  !!value && typeof value === 'function' && (value as typeof Suspense)[SUSPENSE_TYPE_KEY] === true
