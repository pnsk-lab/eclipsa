import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { getExternalComponentMeta } from 'eclipsa/internal'
import { eclipsifyReact } from './mod.ts'

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
})
