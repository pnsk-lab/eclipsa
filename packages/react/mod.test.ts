import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { getExternalComponentMeta } from 'eclipsa/internal'
import { eclipsifyReact } from './mod.ts'
import { hydrateRoot } from 'react-dom/client'

vi.mock('react-dom/client', () => ({
  hydrateRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}))

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
}

const flushExternalDomCommit = async () => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('eclipsifyReact()', () => {
  it('attaches react external metadata and renders slot hosts on the server', async () => {
    const Island = eclipsifyReact((props: { title: string; children?: unknown }) =>
      createElement(
        'section',
        null,
        createElement('h1', { key: 'title' }, props.title),
        props.children as any,
      ),
    )

    const meta = getExternalComponentMeta(Island)
    expect(meta?.kind).toBe('react')
    expect(meta?.slots).toEqual(['children'])

    const html = await meta!.renderToString({ title: 'React island' })
    expect(html).toContain('<h1>React island</h1>')
    expect(html).toContain('<e-slot-host data-e-slot="children"></e-slot-host>')
  })

  it('updates through the retained root without remounting the adapter contract', async () => {
    const Island = eclipsifyReact((props: { title: string }) =>
      createElement('h1', null, props.title),
    )
    const meta = getExternalComponentMeta(Island)!
    const root = {
      render: vi.fn(),
    }

    const instance = await meta.update(root, {} as HTMLElement, { title: 'Updated' })

    expect(instance).toBe(root)
    expect(root.render).toHaveBeenCalledTimes(1)
    expect(root.render.mock.calls[0]?.[0]).toMatchObject({
      props: {
        title: 'Updated',
      },
    })
  })

  it('restores projected slot DOM after observed React-managed mutations', async () => {
    const observed: Array<() => void> = []
    class FakeMutationObserver {
      constructor(private readonly callback: () => void) {}

      disconnect() {}

      observe() {
        observed.push(this.callback)
      }
    }

    const previousObserver = globalThis.MutationObserver
    globalThis.MutationObserver = FakeMutationObserver as unknown as typeof MutationObserver

    try {
      const Island = eclipsifyReact((props: { children?: unknown }) =>
        createElement('section', null, props.children as any),
      )
      const meta = getExternalComponentMeta(Island)!
      const projectedNode = new FakeNode()
      const slotHost = new FakeElement()
      slotHost.appendChild(projectedNode)
      const host = new FakeElement(new Map([['children', slotHost]]))

      const instance = (await meta.hydrate(host as unknown as HTMLElement, {})) as {
        slotDom: Map<string, Node[]>
      }

      expect(hydrateRoot).toHaveBeenCalledTimes(1)
      expect(observed).toHaveLength(1)
      await flushExternalDomCommit()

      slotHost.removeChild(projectedNode)
      observed[0]!()
      await flushExternalDomCommit()

      expect(slotHost.childNodes).toEqual([projectedNode])
      expect(instance.slotDom.get('children')).toEqual([projectedNode])
    } finally {
      globalThis.MutationObserver = previousObserver
    }
  })

  it('keeps the latest projected slot DOM during deferred restore even without an observed mutation', async () => {
    vi.useFakeTimers()

    try {
      const Island = eclipsifyReact((props: { children?: unknown }) =>
        createElement('section', null, props.children as any),
      )
      const meta = getExternalComponentMeta(Island)!
      const ssrNode = new FakeNode()
      const liveNode = new FakeNode()
      const slotHost = new FakeElement()
      slotHost.appendChild(ssrNode)
      const host = new FakeElement(new Map([['children', slotHost]]))

      const hydrating = meta.hydrate(host as unknown as HTMLElement, {})
      await vi.runAllTimersAsync()
      const instance = (await hydrating) as {
        slotDom: Map<string, Node[]>
      }

      const updating = meta.update(instance as any, host as unknown as HTMLElement, {})
      slotHost.removeChild(ssrNode)
      slotHost.appendChild(liveNode)
      await vi.runAllTimersAsync()
      await updating

      expect(slotHost.childNodes).toEqual([liveNode])
      expect(instance.slotDom.get('children')).toEqual([liveNode])
    } finally {
      vi.useRealTimers()
    }
  })
})
