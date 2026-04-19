import { Fragment, jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { ssrAttr, ssrRaw, ssrTemplate } from '../jsx/jsx-dev-runtime.ts'
import { renderSSR } from './ssr.ts'

describe('SSR fast path helpers', () => {
  it('renders dynamic attributes and children through ssrTemplate', () => {
    const View = (props) =>
      ssrTemplate(
        ['<section', '><h1>', '</h1><p>', '</p><input', ' /></section>'],
        ssrAttr('data-title', props.title),
        props.title,
        props.count,
        ssrAttr('disabled', true),
      )
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(View, { title: '<hello>', count: 3 }, void 0, false, {
        fileName: 'packages/eclipsa/core/ssr-fast-path.test.ts',
        lineNumber: 16,
        columnNumber: 38,
      }),
    )
    expect(html).toBe(
      '<section data-title="&lt;hello&gt;"><h1>&lt;hello&gt;</h1><p>3</p><input disabled /></section>',
    )
  })
  it('omits nullable attributes in ssrTemplate', () => {
    const { html } = renderSSR(() =>
      ssrTemplate(['<div', '>ready</div>'], ssrAttr('data-state', null)),
    )
    expect(html).toBe('<div>ready</div>')
  })
  it('never renders key attributes in SSR output', () => {
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        Fragment,
        {
          children: [
            ssrTemplate(['<div', '>template</div>'], ssrAttr('key', 'template-key')),
            /* @__PURE__ */ jsxDEV('div', { children: 'jsx' }, 'jsx-key', false, {
              fileName: 'packages/eclipsa/core/ssr-fast-path.test.ts',
              lineNumber: 35,
              columnNumber: 9,
            }),
          ],
        },
        void 0,
        true,
        {
          fileName: 'packages/eclipsa/core/ssr-fast-path.test.ts',
          lineNumber: 33,
          columnNumber: 7,
        },
      ),
    )
    expect(html).toContain('<div>template</div>')
    expect(html).toContain('<div>jsx</div>')
    expect(html).not.toContain(' key=')
  })

  it('renders only helper-created ssrRaw values as trusted HTML', () => {
    const trusted = ssrRaw('<span>trusted</span>')
    const forged = { ...trusted, value: '<img src=x onerror="alert(1)" />' }

    const { html } = renderSSR(() => ssrTemplate(['<div>', '', '</div>'], trusted, forged))

    expect(html).toBe('<div><span>trusted</span></div>')
    expect(html).not.toContain('onerror')
  })
})
