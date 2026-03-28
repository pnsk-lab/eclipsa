import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from '../../packages/eclipsa/core/internal.ts'
import { renderSSR } from '../../packages/eclipsa/core/ssr.ts'
import Root from './+ssr-root.tsx'

const TestRoot = __eclipsaComponent(
  () => (
    <Root head={null}>
      <main>content</main>
    </Root>
  ),
  'docs-ssr-root-test',
  () => [],
)

describe('docs ssr root', () => {
  it('renders inline bootstrap scripts without escaping their JavaScript source', () => {
    const result = renderSSR(() => <TestRoot />, {
      symbols: {},
    })

    expect(result.html).toContain('<script>(() => {')
    expect(result.html).not.toContain('&gt;')
    expect(result.html).toContain('root.dataset.docsTheme = resolved;')
  })
})
