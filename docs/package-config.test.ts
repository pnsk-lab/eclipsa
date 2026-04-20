import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const packageDir = new URL('.', import.meta.url)
const parseJsonc = <T>(source: string) =>
  JSON.parse(
    source
      .replaceAll(/\/\*[\s\S]*?\*\//g, '')
      .replaceAll(/^\s*\/\/.*$/gm, '')
      .replaceAll(/,\s*([}\]])/g, '$1'),
  ) as T

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

  it('deploys the docs worker through workers.dev with preview URLs enabled', async () => {
    const wranglerConfigRaw = await readFile(new URL('./wrangler.jsonc', packageDir), 'utf8')
    const wranglerConfig = parseJsonc<{
      name?: string
      account_id?: string
      workers_dev?: boolean
      preview_urls?: boolean
      assets?: {
        directory?: string
      }
    }>(wranglerConfigRaw)

    expect(wranglerConfig.name).toBe('eclipsa')
    expect(wranglerConfig.account_id).toBeUndefined()
    expect(wranglerConfig.workers_dev).toBe(true)
    expect(wranglerConfig.preview_urls).toBe(true)
    expect(wranglerConfig.assets?.directory).toBe('./dist/client')
  })

  it('keeps website deployments on PR previews and main production', async () => {
    const workflowRaw = await readFile(
      new URL('../.github/workflows/website.yml', packageDir),
      'utf8',
    )

    expect(workflowRaw).toContain('name: Website')
    expect(workflowRaw).toContain('pull_request:')
    expect(workflowRaw).toContain('push:')
    expect(workflowRaw).toContain('- main')
    expect(workflowRaw).toContain('bun run --filter @eclipsa/optimizer build:native:dev')
    expect(workflowRaw).toContain('bun run --cwd docs build')
    expect(workflowRaw).toContain('uses: cloudflare/wrangler-action@v3')
    expect(workflowRaw).toContain('accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}')
    expect(workflowRaw).toContain('workingDirectory: docs')
    expect(workflowRaw).toContain('command: versions upload --preview-alias')
    expect(workflowRaw).toContain('command: deploy')
    expect(workflowRaw).toContain('Could not find preview URL in Wrangler output')
    expect(workflowRaw).toContain('<!-- eclipsa-website-preview -->')
  })
})
