import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const packageDir = new URL('.', import.meta.url)

describe('docs package config', () => {
  it('declares hono when the docs server entry imports it', async () => {
    const [packageJsonRaw, serverEntryRaw] = await Promise.all([
      readFile(new URL('./package.json', packageDir), 'utf8'),
      readFile(new URL('./app/+server-entry.ts', packageDir), 'utf8'),
    ])

    const packageJson = JSON.parse(packageJsonRaw) as {
      dependencies?: Record<string, string>
    }

    expect(serverEntryRaw).toContain("from 'hono'")
    expect(packageJson.dependencies?.hono).toBe('^4.6.4')
  })

  it('declares optimizer when the playground imports the public browser compiler entry', async () => {
    const [packageJsonRaw, browserCompilerRaw] = await Promise.all([
      readFile(new URL('./package.json', packageDir), 'utf8'),
      readFile(new URL('./app/playground/browser-compiler.ts', packageDir), 'utf8'),
    ])

    const packageJson = JSON.parse(packageJsonRaw) as {
      dependencies?: Record<string, string>
    }

    expect(browserCompilerRaw).toContain("import('@eclipsa/optimizer/browser')")
    expect(browserCompilerRaw).not.toContain(
      '../../../packages/eclipsa/compiler/native/generated/eclipsa.wasi-browser.js',
    )
    expect(packageJson.dependencies?.['@eclipsa/optimizer']).toBe('workspace:*')
  })
})
