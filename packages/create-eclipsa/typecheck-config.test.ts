import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const packageDir = new URL('.', import.meta.url)

describe('create-eclipsa typecheck config', () => {
  it('typechecks the package with a local tsconfig that excludes templates', async () => {
    const [packageJsonRaw, tsconfigRaw] = await Promise.all([
      readFile(new URL('./package.json', packageDir), 'utf8'),
      readFile(new URL('./tsconfig.json', packageDir), 'utf8'),
    ])

    const packageJson = JSON.parse(packageJsonRaw) as {
      scripts?: Record<string, string>
    }
    const tsconfig = JSON.parse(tsconfigRaw) as {
      exclude?: string[]
      include?: string[]
    }

    expect(packageJson.scripts?.typecheck).toBe('bun x tsc -p ./tsconfig.json --noEmit')
    expect(tsconfig.exclude).toContain('./template/**')
    expect(tsconfig.include).toEqual(
      expect.arrayContaining(['./mod.ts', './vite.config.ts', './*.test.ts']),
    )
  })
})
