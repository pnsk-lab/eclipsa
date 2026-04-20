import type { Signal } from '../core/signal.ts'
import { useRuntimeAtom } from '../core/runtime.ts'

const ATOM_META_KEY = Symbol.for('eclipsa.atom-meta')

interface AtomMeta<T> {
  initialValue: T
}

export interface Atom<T> {
  readonly [ATOM_META_KEY]?: AtomMeta<T>
}

const getAtomMeta = <T>(value: Atom<T>): AtomMeta<T> | null =>
  ((value as Record<PropertyKey, unknown>)[ATOM_META_KEY] as AtomMeta<T> | undefined) ?? null

export const atom = <T>(initialValue: T): Atom<T> => {
  const state = {} as Atom<T>
  Object.defineProperty(state, ATOM_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      initialValue,
    } satisfies AtomMeta<T>,
    writable: false,
  })
  return state
}

export const useAtom = <T>(state: Atom<T>): Signal<T> => {
  const meta = getAtomMeta(state)
  if (!meta) {
    throw new TypeError('useAtom() expects an atom created by atom().')
  }
  return useRuntimeAtom(state as object, meta.initialValue)
}
