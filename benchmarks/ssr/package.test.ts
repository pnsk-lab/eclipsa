import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'bun:test'

const packageJson = JSON.parse(readFileSync(resolve(import.meta.dir, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>
}

test('build script uses the installed vite-plus cli alias', () => {
  expect(packageJson.scripts?.build).toBe('vp run build:all')
})
