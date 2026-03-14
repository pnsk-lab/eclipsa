import { describe, expect, it } from 'vitest'
import { applyHotUpdate, createHotRegistry, defineHotComponent } from './hot.ts'
import { component$ } from '../component.ts'
import { __eclipsaComponent, getComponentMeta } from '../internal.ts'

const makeComponent = (value: string) => ((_: unknown) => value) as any

describe('core/dev-client hot', () => {
  it('updates wrapped components even when function source is unchanged', () => {
    const registry = createHotRegistry()
    const wrapped = defineHotComponent(makeComponent('before'), {
      registry,
      name: 'default',
    })

    expect(wrapped({})).toBe('before')

    const newRegistry = createHotRegistry()
    defineHotComponent(makeComponent('after'), {
      registry: newRegistry,
      name: 'default',
    })

    expect(applyHotUpdate(registry, newRegistry)).toBe('updated')
    expect(wrapped({})).toBe('after')
  })

  it('requests reload when the component graph changes', () => {
    const registry = createHotRegistry()
    defineHotComponent(makeComponent('before'), {
      registry,
      name: 'default',
    })

    const newRegistry = createHotRegistry()
    defineHotComponent(makeComponent('after'), {
      registry: newRegistry,
      name: 'default',
    })
    defineHotComponent(makeComponent('extra'), {
      registry: newRegistry,
      name: 'extra',
    })

    expect(applyHotUpdate(registry, newRegistry)).toBe('reload')
  })

  it('preserves component metadata on wrapped hot components', () => {
    const registry = createHotRegistry()
    const Component = component$(
      __eclipsaComponent(
        () => 'value',
        'page-symbol',
        () => [],
      ),
    )

    const wrapped = defineHotComponent(Component, {
      registry,
      name: 'default',
    })

    expect(getComponentMeta(wrapped)?.symbol).toBe('page-symbol')
    expect(getComponentMeta(wrapped)?.projectionSlots).toBeUndefined()
  })
})
