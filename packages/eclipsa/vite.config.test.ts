import { describe, expect, it } from 'vitest'
import config from './vite.config.ts'

describe('eclipsa vite pack config', () => {
  it('runs tests without file-level parallelism because several suites patch process globals', () => {
    expect(config.test).toMatchObject({
      fileParallelism: false,
    })
  })

  it('keeps vite and typescript external in the published vite entry', () => {
    expect(config.pack).toMatchObject({
      deps: {
        neverBundle: ['typescript', 'vite'],
      },
    })
  })
})
