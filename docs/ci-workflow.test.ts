import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const docsDir = new URL('.', import.meta.url)

describe('CI workflow', () => {
  it('installs Playwright browsers with the e2e package version', async () => {
    const [workflowRaw, e2ePackageRaw] = await Promise.all([
      readFile(new URL('../.github/workflows/ci.yml', docsDir), 'utf8'),
      readFile(new URL('../e2e/package.json', docsDir), 'utf8'),
    ])

    const e2ePackage = JSON.parse(e2ePackageRaw) as {
      scripts?: Record<string, string>
    }

    expect(e2ePackage.scripts?.['playwright:install']).toBe('playwright install')
    expect(workflowRaw).toContain('run: bun run --cwd e2e playwright:install --with-deps chromium')
    expect(workflowRaw).not.toContain('run: bunx playwright install --with-deps chromium')
  })
})
