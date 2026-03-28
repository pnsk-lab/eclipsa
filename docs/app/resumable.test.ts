import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { analyzeModule } from '../../packages/eclipsa/compiler/mod.ts'

const readAppFile = (filePath: string) => readFile(path.join(process.cwd(), filePath), 'utf8')

describe('docs app resumable compilation', () => {
  it('keeps the landing page mount callback client-only while still compiling the rain scene setup', async () => {
    const source = await readAppFile('app/+page.tsx')
    const analyzed = await analyzeModule(source, '/app/+page.tsx')

    expect(
      [...analyzed.symbols.values()].some(
        (symbol) =>
          symbol.filePath === '/app/+page.tsx' &&
          (symbol.kind === 'lazy' || symbol.kind === 'watch'),
      ),
    ).toBe(false)
    expect(analyzed.code).toContain('setupLandingScene')
    expect(analyzed.code).toContain('onMount(() => {')
  })

  it('compiles docs layout lifecycle callbacks without mutable capture errors', async () => {
    const source = await readAppFile('app/+layout.tsx')

    await expect(analyzeModule(source, '/app/+layout.tsx')).resolves.toBeTruthy()
  })

  it('compiles the search dialog visible callback without mutable capture errors', async () => {
    const source = await readAppFile('app/docs/SearchDialog.tsx')

    await expect(analyzeModule(source, '/app/docs/SearchDialog.tsx')).resolves.toBeTruthy()
  })
})
