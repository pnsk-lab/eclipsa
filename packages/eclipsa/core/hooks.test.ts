import { afterEach, describe, expect, it } from 'vitest'

import { getCurrentServerRequestContext, withServerRequestContext } from './hooks.ts'

const restoreBrowserGlobals = () => {
  delete (globalThis as typeof globalThis & { document?: Document }).document
  delete (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window
}

describe('server request context', () => {
  afterEach(() => {
    restoreBrowserGlobals()
  })

  it('skips AsyncLocalStorage state when running in a browser-like runtime', () => {
    Object.assign(globalThis, {
      document: {} as Document,
      window: {} as Window & typeof globalThis,
    })

    const value = withServerRequestContext({} as never, {}, () => 'ok')

    expect(value).toBe('ok')
    expect(getCurrentServerRequestContext()).toBeNull()
  })
})
