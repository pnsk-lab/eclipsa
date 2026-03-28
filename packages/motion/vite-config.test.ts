import { describe, expect, it } from 'vitest'
import config from './vite.config.ts'

describe('@eclipsa/motion vite pack config', () => {
  it('builds the package entry with declarations', () => {
    expect(config.pack).toMatchObject({
      clean: true,
      dts: true,
      entry: ['mod.ts'],
      format: ['esm'],
      sourcemap: true,
    })
  })
})
