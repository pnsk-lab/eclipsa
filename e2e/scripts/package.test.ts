import { expect, test } from 'vitest'
import packageJson from '../package.json' with { type: 'json' }

const expectedPrefix = 'bun run --cwd ../packages/optimizer build:native:dev && '

test('e2e scripts build the optimizer native artifacts before Playwright', () => {
  expect(packageJson.scripts.e2e).toBe(`${expectedPrefix}bun ./scripts/run-playwright.ts`)
  expect(packageJson.scripts['e2e:headed']).toBe(
    `${expectedPrefix}bun ./scripts/run-playwright.ts --headed`,
  )
  expect(packageJson.scripts['e2e:ui']).toBe(
    `${expectedPrefix}bun ./scripts/run-playwright.ts --ui`,
  )
})
