import { describe, expect, it } from 'vitest'
import config from './vite.config.ts'

describe('@eclipsa/content vite pack config', () => {
  it('builds every published entrypoint with declarations', () => {
    expect(config.pack).toMatchObject({
      clean: true,
      copy: ['virtual-runtime.d.ts'],
      dts: true,
      entry: ['mod.ts', 'vite.ts', 'internal.ts'],
      format: ['esm'],
      sourcemap: true,
    })
  })
})
