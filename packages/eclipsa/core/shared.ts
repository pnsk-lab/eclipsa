export const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined'

export const IS_SSR = !IS_BROWSER

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
