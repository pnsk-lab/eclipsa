import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it, vi } from 'vitest'
import { __eclipsaComponent } from './internal.ts'
import { onMount } from './signal.ts'
import { renderSSR } from './ssr.ts'
describe('onMount', () => {
  it('does not run during SSR', () => {
    const mounted = vi.fn()
    const App = __eclipsaComponent(
      () => {
        onMount(() => {
          mounted()
        })
        return /* @__PURE__ */ jsxDEV('button', { children: 'ready' }, void 0, false, {
          fileName: 'packages/eclipsa/core/on-mount.test.ts',
          lineNumber: 16,
          columnNumber: 16,
        })
      },
      'component-symbol',
      () => [],
    )
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/on-mount.test.ts',
        lineNumber: 22,
        columnNumber: 38,
      }),
    )
    expect(html).toContain('<button>ready</button>')
    expect(mounted).not.toHaveBeenCalled()
  })
})
