import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeModule } from '../../../packages/eclipsa/compiler/analyze/mod.ts'
import { __eclipsaComponent } from '../../../packages/eclipsa/core/internal.ts'
import { renderSSRAsync } from '../../../packages/eclipsa/core/ssr.ts'
import { DocsSearchDialog } from './SearchDialog.tsx'
const TestSearchDialog = __eclipsaComponent(
  () =>
    /* @__PURE__ */ jsxDEV(DocsSearchDialog, {}, void 0, false, {
      fileName: 'docs/app/docs/SearchDialog.test.ts',
      lineNumber: 9,
      columnNumber: 9,
    }),
  'docs-search-dialog-test',
  () => [],
)
describe('docs search dialog', () => {
  it('renders the docs search trigger and dialog shell', async () => {
    const result = await renderSSRAsync(() =>
      /* @__PURE__ */ jsxDEV(TestSearchDialog, {}, void 0, false, {
        fileName: 'docs/app/docs/SearchDialog.test.ts',
        lineNumber: 16,
        columnNumber: 47,
      }),
    )
    expect(result.html).toContain('data-testid="docs-search-trigger"')
    expect(result.html).toContain('data-testid="docs-search-overlay"')
    expect(result.html).toContain('data-testid="docs-search-input"')
    expect(result.html).toContain('placeholder="Search docs"')
    expect(result.html).toContain('>K</kbd>')
  })
  it('renders the search overlay as a top-layer dialog host', () => {
    const source = readFileSync(new URL('./SearchDialog.tsx', import.meta.url), 'utf8')
    expect(source).toContain('const dialogRef = useSignal<HTMLDialogElement | undefined>()')
    expect(source).toContain('!dialog.isConnected')
    expect(source).toContain("if (typeof requestAnimationFrame === 'function') {")
    expect(source).toContain('dialog.showModal()')
    expect(source).toContain('focusInputWhenReady(dialogRef, inputRef, token)')
    expect(source).toContain('input.focus({ preventScroll: true })')
    expect(source).toContain('autoFocus')
    expect(source).toContain('<dialog')
  })
  it('does not emit self-referential resumable captures for dialog opening', async () => {
    const source = readFileSync(new URL('./SearchDialog.tsx', import.meta.url), 'utf8')
    const analyzed = await analyzeModule(source, 'docs/app/docs/SearchDialog.tsx')
    expect(
      [...analyzed.symbols.values()].some((symbol) => symbol.captures.includes('syncDialogOpen')),
    ).toBe(false)
    expect(
      [...analyzed.symbols.values()].some((symbol) => symbol.captures.includes('disposed')),
    ).toBe(false)
    expect(
      [...analyzed.symbols.values()].some((symbol) =>
        symbol.captures.includes('triggerAttachCancelled'),
      ),
    ).toBe(false)
    expect(source).toContain(
      'const dialogRef = useSignal<HTMLDialogElement | undefined>() as DialogRefTarget',
    )
    expect(source).toContain('dialogRef.__openToken = (dialogRef.__openToken ?? 0) + 1')
    expect(source).toContain('const openDialog = () => {')
    expect(source).toContain('open.value = true')
    expect(source).toContain('const retryOpen = () => {')
    expect(source).toContain('retryOpen()')
    expect(source).toContain('onClick={openDialog}')
  })
  it('uses delegated result row handlers without inline index captures', () => {
    const source = readFileSync(new URL('./SearchDialog.tsx', import.meta.url), 'utf8')
    expect(source).toContain('data-result-index={String(index)}')
    expect(source).toContain('onClick={handleRowClick}')
    expect(source).toContain('onClick={handleOverlayClick}')
  })
  it('shows loading immediately while debouncing and retries pending queries after search runtime loads', () => {
    const source = readFileSync(new URL('./SearchDialog.tsx', import.meta.url), 'utf8')
    expect(source).toContain('if (query.value !== nextQuery) {')
    expect(source).toContain('query.value = nextQuery')
    expect(source).toContain('results.value = []')
    expect(source).toContain('loading.value = true')
    expect(source.indexOf('loading.value = true')).toBeLessThan(
      source.indexOf('searchTimeout.value = setTimeout'),
    )
    expect(source).toContain("if (query.value.trim() !== '') {")
    expect(source).toContain('scheduleSearch(query.value)')
  })
  it('renders search results inline and uses delegated input handlers', () => {
    const source = readFileSync(new URL('./SearchDialog.tsx', import.meta.url), 'utf8')
    expect(source).toContain('const inputRef = useSignal<HTMLInputElement | undefined>()')
    expect(source).toContain('const isComposing = useSignal(false)')
    expect(source).toContain('value={query.value}')
    expect(source).toContain('{SearchResultsBody({')
    expect(source).toContain('const handleInput = (event: Event) => {')
    expect(source).toContain('const handleInputKeyDown = (event: KeyboardEvent) => {')
    expect(source).toContain('const handleCompositionStart = () => {')
    expect(source).toContain('const handleCompositionEnd = (event: CompositionEvent) => {')
    expect(source).toContain('onInput={handleInput}')
    expect(source).toContain('onKeyDown={handleInputKeyDown}')
    expect(source).toContain('onCompositionStart={handleCompositionStart}')
    expect(source).toContain('onCompositionEnd={handleCompositionEnd}')
  })
})
