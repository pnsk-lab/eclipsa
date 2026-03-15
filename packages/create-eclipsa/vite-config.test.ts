import { describe, expect, it } from 'vitest'
import config from './vite.config.ts'

describe('create-eclipsa vite pack config', () => {
  it('builds the CLI with declarations and ships the template directory', () => {
    expect(config.pack).toMatchObject({
      clean: true,
      copy: ['template'],
      dts: true,
      entry: ['mod.ts'],
      format: ['esm'],
      sourcemap: true,
    })
  })
})
