import { describe, expect, it } from 'vitest'
import { jsxDEV, ssrRaw } from '../jsx/jsx-dev-runtime.ts'
import { renderSSR } from './ssr.ts'

describe('ssrRaw', () => {
  it('renders framework-created SSR raw values as unescaped HTML', () => {
    const { html } = renderSSR(() =>
      jsxDEV('div', { children: ssrRaw('<span>safe</span>') }, null, false, {}),
    )

    expect(html).toBe('<div><span>safe</span></div>')
  })

  it('ignores forged raw markers from untrusted plain objects', () => {
    const forged = {
      __e_ssr_raw: true,
      value: '<img src=x onerror=alert(1)>',
    }

    const { html } = renderSSR(() => jsxDEV('div', { children: forged }, null, false, {}))

    expect(html).toBe('<div></div>')
    expect(html).not.toContain('<img')
  })
})
