import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from './internal.ts'
import { renderSSR } from './ssr.ts'

const Projected = __eclipsaComponent(
  (props: { label: string }) => <span>{props.label}</span>,
  'projected-symbol',
  () => [],
  { label: 1 },
)

const Probe = __eclipsaComponent(
  (props: { aa?: unknown; children?: unknown }) => (
    <section>
      <div>{props.aa}</div>
      <div>{props.children}</div>
    </section>
  ),
  'probe-symbol',
  () => [],
  { aa: 1, children: 1 },
)

describe('render props resume payload', () => {
  it('serializes projection slot props and children into the resume payload', () => {
    const { html, payload } = renderSSR(() => (
      <Probe aa={<Projected label="prop content" />}>
        <Projected label="children content" />
      </Probe>
    ))

    expect(html).toContain('prop content')
    expect(html).toContain('children content')
    expect(html).toContain('ec:s:c0:aa:0:start')
    expect(html).toContain('ec:s:c0:children:0:start')
    expect(payload.components['c0']?.projectionSlots).toEqual({
      aa: 1,
      children: 1,
    })
    const props = payload.components['c0']?.props as
      | {
          __eclipsa_type: string
          entries: Array<[string, { kind?: string; token?: string }]>
        }
      | undefined
    expect(props?.__eclipsa_type).toBe('object')
    expect(props?.entries).toEqual(
      expect.arrayContaining([
        ['aa', expect.objectContaining({ kind: 'render', token: 'jsx' })],
        ['children', expect.objectContaining({ kind: 'render', token: 'jsx' })],
      ]),
    )
  })
})
