import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { getExternalComponentMeta } from 'eclipsa/internal'
import { eclipsifyVue } from './mod.ts'

describe('eclipsifyVue()', () => {
  it('attaches vue external metadata and renders slot hosts on the server', async () => {
    const Island = eclipsifyVue(
      defineComponent({
        props: {
          title: String,
        },
        setup(props, { slots }) {
          return () =>
            h('section', null, [h('h1', null, props.title), slots.default ? slots.default() : null])
        },
      }),
    )

    const meta = getExternalComponentMeta(Island)
    expect(meta?.kind).toBe('vue')
    expect(meta?.slots).toEqual(['children'])

    const html = await meta!.renderToString({ title: 'Vue island' })
    expect(html).toContain('<h1>Vue island</h1>')
    expect(html).toContain(
      '<e-slot-host data-allow-mismatch="children" data-e-slot="children"></e-slot-host>',
    )
  })

  it('updates the retained reactive props object in place', async () => {
    const Island = eclipsifyVue(
      defineComponent({
        props: {
          title: String,
        },
        setup(props) {
          return () => h('h1', null, props.title)
        },
      }),
    )
    const meta = getExternalComponentMeta(Island)!
    const instance = {
      app: {
        unmount() {},
      },
      state: {
        props: {
          stale: true,
          title: 'Before',
        },
      },
    }

    const resolved = await meta.update(instance, {} as HTMLElement, { title: 'After' })

    expect(resolved).toBe(instance)
    expect(instance.state.props).toEqual({
      title: 'After',
    })
  })
})
