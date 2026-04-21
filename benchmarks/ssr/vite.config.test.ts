import { expect, test } from 'bun:test'
import config from './vite.config.ts'

test('build:framework resolves the workspace package from the benchmarks/ssr root', () => {
  expect(config.run?.tasks?.['build:framework']?.cwd).toBe('../../packages/eclipsa')
})
