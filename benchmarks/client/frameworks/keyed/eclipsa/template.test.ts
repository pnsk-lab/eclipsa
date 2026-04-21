import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const templateRoot = import.meta.dir
const indexHtml = readFileSync(resolve(import.meta.dir, 'index.html'), 'utf8')

test('benchmark template loads the built client entry', () => {
  expect(indexHtml).toContain('<script type="module" src="dist/assets/main.js"></script>')
})

test('benchmark template exposes a dedicated mount root for the generated app', () => {
  expect(indexHtml).toContain('<div id="main"></div>')
})

test('benchmark template stays source-driven and does not rely on legacy generated files', () => {
  expect(existsSync(resolve(templateRoot, 'vite.config.ts'))).toBe(true)
  expect(existsSync(resolve(templateRoot, 'tsconfig.json'))).toBe(true)
  expect(existsSync(resolve(templateRoot, 'build.js'))).toBe(false)
  expect(existsSync(resolve(templateRoot, 'workspace-paths.js'))).toBe(false)
  expect(existsSync(resolve(templateRoot, 'src/main.js'))).toBe(false)
})
