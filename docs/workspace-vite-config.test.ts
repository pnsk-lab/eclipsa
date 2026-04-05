import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const docsDir = new URL('.', import.meta.url)

describe('workspace vite config imports', () => {
  it('loads workspace plugins through relative source paths for Node config loading', async () => {
    const [docsConfigRaw, e2eConfigRaw] = await Promise.all([
      readFile(new URL('./vite.config.ts', docsDir), 'utf8'),
      readFile(new URL('../e2e/vite.config.ts', docsDir), 'utf8'),
    ])

    for (const source of [docsConfigRaw, e2eConfigRaw]) {
      expect(source).toContain('../packages/eclipsa/vite/mod.ts')
      expect(source).toContain('../packages/content/vite.ts')
      expect(source).toContain('../packages/image/vite.ts')
      expect(source).not.toContain('@eclipsa/content/vite')
      expect(source).not.toContain('@eclipsa/image/vite')
      expect(source).not.toContain("from 'eclipsa/vite'")
    }
  })
})
