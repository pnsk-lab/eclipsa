import { describe, expect, it } from 'vitest'
import { ssrAttr, ssrTemplate } from '../jsx/jsx-dev-runtime.ts'
import { renderSSR } from './ssr.ts'

describe('SSR fast path helpers', () => {
  it('renders dynamic attributes and children through ssrTemplate', () => {
    const View = (props: { count: number; title: string }) =>
      ssrTemplate(
        ['<section', '><h1>', '</h1><p>', '</p><input', ' /></section>'],
        ssrAttr('data-title', props.title),
        props.title,
        props.count,
        ssrAttr('disabled', true),
      )

    const { html } = renderSSR(() => <View title={'<hello>'} count={3} />)

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
    const { html } = renderSSR(() => (
      <>
        {ssrTemplate(['<div', '>template</div>'], ssrAttr('key', 'template-key'))}
        <div key="jsx-key">jsx</div>
      </>
    ))

    expect(html).toContain('<div>template</div>')
    expect(html).toContain('<div>jsx</div>')
    expect(html).not.toContain(' key=')
  })
})
