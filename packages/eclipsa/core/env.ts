export const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined'

export const IS_SSR = !IS_BROWSER
