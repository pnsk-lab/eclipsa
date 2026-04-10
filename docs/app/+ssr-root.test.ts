import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from '../../packages/eclipsa/core/internal.ts'
import { renderSSR } from '../../packages/eclipsa/core/ssr.ts'
import Root from './+ssr-root.tsx'
const TestRoot = __eclipsaComponent(
  () =>
    /* @__PURE__ */ jsxDEV(
      Root,
      {
        head: null,
        children: /* @__PURE__ */ jsxDEV('main', { children: 'content' }, void 0, false, {
          fileName: 'docs/app/+ssr-root.test.ts',
          lineNumber: 9,
          columnNumber: 7,
        }),
      },
      void 0,
      false,
      {
        fileName: 'docs/app/+ssr-root.test.ts',
        lineNumber: 8,
        columnNumber: 5,
      },
    ),
  'docs-ssr-root-test',
  () => [],
)
describe('docs ssr root', () => {
  it('renders inline bootstrap scripts without escaping their JavaScript source', () => {
    const result = renderSSR(
      () =>
        /* @__PURE__ */ jsxDEV(TestRoot, {}, void 0, false, {
          fileName: 'docs/app/+ssr-root.test.ts',
          lineNumber: 18,
          columnNumber: 36,
        }),
      {
        symbols: {},
      },
    )
    expect(result.html).toContain('<script>(() => {')
    expect(result.html).not.toContain('&gt;')
    expect(result.html).toContain('root.dataset.docsTheme = resolved;')
  })
})
