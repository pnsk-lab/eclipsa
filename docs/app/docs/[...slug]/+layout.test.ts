import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { primeLocationState } from '../../../../packages/eclipsa/core/runtime.ts'
import { renderSSRAsync } from '../../../../packages/eclipsa/core/ssr.ts'
import DocsLayout from './+layout.tsx'
describe('docs layout', () => {
  it('hides the On this page mobile UI below lg while keeping the desktop sidebar', async () => {
    const result = await renderSSRAsync(
      () =>
        /* @__PURE__ */ jsxDEV(
          DocsLayout,
          {
            children: /* @__PURE__ */ jsxDEV(
              'article',
              { children: 'Routing content' },
              void 0,
              false,
              {
                fileName: 'docs/app/docs/[...slug]/+layout.test.ts',
                lineNumber: 12,
                columnNumber: 11,
              },
            ),
          },
          void 0,
          false,
          {
            fileName: 'docs/app/docs/[...slug]/+layout.test.ts',
            lineNumber: 11,
            columnNumber: 9,
          },
        ),
      {
        context: {
          req: {
            param(name) {
              return name === 'slug' ? 'materials/routing' : ''
            },
          },
        },
        prepare(container) {
          primeLocationState(container, 'https://example.com/docs/materials/routing')
        },
      },
    )
    expect(result.html).toContain('data-testid="docs-mobile-nav-toggle"')
    expect(result.html).toContain('>Menu</span>')
    expect(result.html).toContain('>Routing</div>')
    expect(result.html).toContain('>Action</div>')
    expect(result.html).toContain('id="docs-mobile-drawer-shell"')
    expect(result.html).not.toContain('data-testid="docs-mobile-toc-toggle"')
    expect(result.html).not.toContain('id="docs-mobile-toc-shell"')
    expect(result.html).toContain('transition-opacity lg:hidden pointer-events-none')
    expect(result.html).toContain('hidden lg:sticky lg:top-22 lg:flex lg:w-64')
    expect(result.html).toContain('>On this page</span>')
    expect(result.html).toContain('>Route tree</a>')
    const routingLinks = result.html.match(/<a[^>]*href="\/docs\/materials\/routing"[^>]*>/g) ?? []
    const mobileClosableRoutingLinks = routingLinks.filter((tag) => tag.includes('data-e-onclick='))
    expect(routingLinks).toHaveLength(2)
    expect(mobileClosableRoutingLinks).toHaveLength(1)
  })
})
