import { describe, expect, it } from 'vitest'
import { createEclipsaNitroConfig, createEclipsaNitroEntry, hasNitroPlugin } from './nitro.ts'

describe('vite nitro integration', () => {
  it('detects nitro plugins from nested vite plugin arrays', () => {
    expect(
      hasNitroPlugin([
        { name: 'vite-plugin-eclipsa' },
        [{ name: 'nitro:main' }, { name: 'something-else' }],
      ]),
    ).toBe(true)
    expect(hasNitroPlugin([{ name: 'vite-plugin-eclipsa' }])).toBe(false)
  })

  it('creates a virtual Nitro entry for the built Eclipsa app', () => {
    const entry = createEclipsaNitroEntry('/tmp/project/dist/ssr/eclipsa_app.mjs')

    expect(entry).toContain('defineHandler')
    expect(entry).toContain('app.fetch(event.req)')
    expect(entry).toContain('file:///tmp/project/dist/ssr/eclipsa_app.mjs')
  })

  it('merges Nitro config while overriding the Nitro entrypoint', () => {
    const config = createEclipsaNitroConfig('/tmp/project', {
      publicAssets: [
        {
          baseURL: '/docs',
          dir: '/tmp/project/public/docs',
        },
      ],
      virtual: {
        '#custom': 'export default 42',
      },
    })

    expect(config.entry).toBe('#eclipsa/nitro-entry')
    expect(config.publicAssets).toEqual([
      {
        baseURL: '/docs',
        dir: '/tmp/project/public/docs',
      },
      {
        baseURL: '/',
        dir: '/tmp/project/dist/client',
      },
    ])
    expect(config.virtual).toMatchObject({
      '#custom': 'export default 42',
      '#eclipsa/nitro-entry': expect.stringContaining('eclipsa_app.mjs'),
    })
  })
})
