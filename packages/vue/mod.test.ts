import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { getExternalComponentMeta } from 'eclipsa/internal'
import { eclipsifyVue } from './mod.ts'

class FakeNode {
  parentNode: FakeElement | null = null

  remove() {
    this.parentNode?.removeChild(this)
  }
}

class FakeElement extends FakeNode {
  attributes = new Map<string, string>()
  childNodes: FakeNode[] = []

  constructor(
    private readonly slotHosts: Map<string, FakeElement> = new Map(),
  ) {
    super()
  }

  appendChild(node: FakeNode) {
    node.remove()
    this.childNodes.push(node)
    node.parentNode = this
    return node
  }

  removeChild(node: FakeNode) {
    const index = this.childNodes.indexOf(node)
    if (index >= 0) {
      this.childNodes.splice(index, 1)
      node.parentNode = null
    }
    return node
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  querySelector(selector: string) {
    const matched = selector.match(/data-e-slot="([^"]+)"/)
    return matched ? this.slotHosts.get(matched[1]) ?? null : null
  }

  querySelectorAll(selector: string) {
    const matched = selector.match(/data-e-slot="([^"]+)"/)
    const slotHost = matched ? this.slotHosts.get(matched[1]) ?? null : null
    return slotHost ? [slotHost] : []
  }
}

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
      slotDom: new Map<string, Node[]>(),
      slotNames: ['children'],
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

  it('restores projected slot DOM during updates', async () => {
    const Island = eclipsifyVue(
      defineComponent({
        setup(_, { slots }) {
          return () => h('section', null, slots.default ? slots.default() : [])
        },
      }),
    )
    const meta = getExternalComponentMeta(Island)!
    const projectedNode = new FakeNode()
    const slotHost = new FakeElement()
    const host = new FakeElement(new Map([['children', slotHost]]))
    const instance = {
      app: {
        unmount() {},
      },
      slotDom: new Map([['children', [projectedNode]]]),
      slotNames: ['children'],
      state: {
        props: {},
      },
    }

    const resolved = await meta.update(instance as any, host as unknown as HTMLElement, {})

    expect(resolved).toBe(instance)
    expect(slotHost.childNodes).toEqual([projectedNode])
    expect(instance.slotDom.get('children')).toEqual([projectedNode])
  })
})
