import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const indexHtml = readFileSync(resolve(import.meta.dir, 'index.html'), 'utf8')

test('benchmark template exposes the standard js-framework-benchmark controls', () => {
  for (const id of ['run', 'runlots', 'add', 'update', 'clear', 'swaprows', 'tbody']) {
    expect(indexHtml).toContain(`id="${id}"`)
  }
})

test('benchmark template loads the built client entry', () => {
  expect(indexHtml).toContain('<script src="dist/main.js"></script>')
})
