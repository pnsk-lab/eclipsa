import { describe, expect, it } from 'vitest'
import { component$ } from './component.ts'
import { __eclipsaComponent } from './internal.ts'
import { renderSSR } from './ssr.ts'

const Projected = component$(
  __eclipsaComponent(
    (props: { label: string }) => <span>{props.label}</span>,
    'projected-symbol',
    () => [],
  ),
)

const Probe = component$(
  __eclipsaComponent(
    (props: { aa?: unknown; children?: unknown }) => (
      <section>
        <div>{props.aa}</div>
        <div>{props.children}</div>
      </section>
    ),
    'probe-symbol',
    () => [],
  ),
)

describe('render props resume payload', () => {
  it('serializes component-valued props and children into the resume payload', () => {
    const { html, payload } = renderSSR(() => (
      <Probe aa={<Projected label="prop content" />}>
        <Projected label="children content" />
      </Probe>
    ))

    expect(html).toContain('prop content')
    expect(html).toContain('children content')
    expect(JSON.stringify(payload.components['c0']?.props)).toContain(`"kind":"render"`)
  })
})
