const noSerializeValues = new WeakSet<object>()

const canNoSerialize = (value: unknown): value is object | Function =>
  (typeof value === 'object' && value !== null) || typeof value === 'function'

export type NoSerialize<T> = T & {
  readonly __eclipsa_no_serialize__?: true
}

export const noSerialize = <T extends object | Function | undefined>(value: T): T => {
  if (canNoSerialize(value)) {
    noSerializeValues.add(value as object)
  }
  return value
}

export const isNoSerialize = (value: unknown): boolean =>
  canNoSerialize(value) && noSerializeValues.has(value as object)
