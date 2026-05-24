import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('keeps compiled event helpers independent from the resume runtime entry', () => {
  const source = readFileSync(fileURLToPath(new URL('./event.ts', import.meta.url)), 'utf8')

  expect(source).not.toMatch(/from\s+['"]\.\.\/runtime\.ts['"]/)
})
