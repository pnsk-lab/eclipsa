import { describe, expect, it } from 'vitest'
import config from './vite.config.ts'

describe('@eclipsa/image vite pack config', () => {
  it('builds every published entrypoint with declarations', () => {
    expect(config.pack).toMatchObject({
      clean: true,
      copy: ['client.d.ts'],
      dts: true,
      entry: ['mod.ts', 'client.ts', 'vite.ts'],
      format: ['esm'],
      sourcemap: true,
    })
  })
})
