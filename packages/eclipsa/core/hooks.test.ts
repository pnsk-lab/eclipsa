import { afterEach, describe, expect, it } from 'vitest'

import { getCurrentServerRequestContext, withServerRequestContext } from './hooks.ts'

const restoreBrowserGlobals = () => {
  Reflect.deleteProperty(globalThis, 'document')
  Reflect.deleteProperty(globalThis, 'window')
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
