import { describe, expect, it } from 'vitest'

import { IS_BROWSER, IS_SSR } from './mod.ts'

describe('env flags', () => {
  it('exports complementary browser and ssr flags', () => {
    expect(IS_BROWSER).toBe(false)
    expect(IS_SSR).toBe(true)
    expect(IS_BROWSER).toBe(!IS_SSR)
  })
})
