import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from '../../../packages/eclipsa/core/internal.ts'
import { renderSSRAsync } from '../../../packages/eclipsa/core/ssr.ts'
import { DocsSearchDialog } from './SearchDialog.tsx'

const TestSearchDialog = __eclipsaComponent(
  () => <DocsSearchDialog />,
  'docs-search-dialog-test',
  () => [],
)

describe('docs search dialog', () => {
  it('renders the docs search trigger and dialog shell', async () => {
    const result = await renderSSRAsync(() => <TestSearchDialog />)

    expect(result.html).toContain('data-testid="docs-search-trigger"')
    expect(result.html).toContain('data-testid="docs-search-overlay"')
    expect(result.html).toContain('data-testid="docs-search-input"')
    expect(result.html).toContain('placeholder="Search docs"')
    expect(result.html).toContain('>K</kbd>')
  })

  it('uses delegated result row handlers without inline index captures', () => {
    const source = readFileSync(new URL('./SearchDialog.tsx', import.meta.url), 'utf8')

    expect(source).toContain('data-result-index={String(index)}')
    expect(source).toContain('onClick={handleRowClick}')
    expect(source).toContain('onClick={handleOverlayClick}')
  })

  it('shows loading immediately while debouncing and retries pending queries after search runtime loads', () => {
    const source = readFileSync(new URL('./SearchDialog.tsx', import.meta.url), 'utf8')

    expect(source).toContain('results.value = []')
    expect(source).toContain('loading.value = true')
    expect(source.indexOf('loading.value = true')).toBeLessThan(
      source.indexOf('searchTimeout.value = setTimeout'),
    )
    expect(source).toContain("if (query.value.trim() !== '') {")
    expect(source).toContain('scheduleSearch(query.value)')
  })

  it('binds search input value through framework bindings and schedules searches from a native input listener', () => {
    const source = readFileSync(new URL('./SearchDialog.tsx', import.meta.url), 'utf8')

    expect(source).toContain('bind:value={query}')
    expect(source).toContain("inputRef.value?.addEventListener('input', handleInput)")
    expect(source).toContain("inputRef.value?.removeEventListener('input', handleInput)")
  })
})
