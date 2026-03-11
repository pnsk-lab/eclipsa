interface SignalReader {
  read(): unknown
}

interface SnapshotState {
  readers: SignalReader[]
  cursor: number
  values: unknown[] | null
}

const SNAPSHOT_STATE_KEY = Symbol.for('eclipsa.snapshot-state')

const getCurrentSnapshotState = (): SnapshotState | null => {
  return ((globalThis as unknown) as Record<PropertyKey, SnapshotState | null>)[SNAPSHOT_STATE_KEY] ?? null
}

const setCurrentSnapshotState = (state: SnapshotState | null) => {
  ;((globalThis as unknown) as Record<PropertyKey, SnapshotState | null>)[SNAPSHOT_STATE_KEY] = state
}

export const withSignalSnapshot = <T>(
  values: unknown[] | null,
  fn: () => T,
): {
  result: T
  values: unknown[]
} => {
  const previous = getCurrentSnapshotState()
  const state: SnapshotState = {
    readers: [],
    cursor: 0,
    values,
  }
  setCurrentSnapshotState(state)

  try {
    const result = fn()
    return {
      result,
      values: values ?? state.readers.map((reader) => reader.read()),
    }
  } finally {
    setCurrentSnapshotState(previous)
  }
}

export const consumeSnapshotValue = <T>(fallback: T): T => {
  const state = getCurrentSnapshotState()
  if (!state) {
    return fallback
  }

  const index = state.cursor++
  if (state.values && index < state.values.length) {
    return state.values[index] as T
  }

  return fallback
}

export const registerSnapshotSignal = (reader: SignalReader) => {
  getCurrentSnapshotState()?.readers.push(reader)
}
