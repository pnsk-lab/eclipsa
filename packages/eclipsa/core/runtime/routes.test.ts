import { describe, expect, it } from 'vitest'
import type { RouteManifest } from '../router-shared.ts'
import { findSpecialManifestEntry, matchRouteManifest } from './routes.ts'

describe('runtime route manifest helpers', () => {
  it('decodes url-encoded segments before matching manifest entries', () => {
    const manifest: RouteManifest = [
      {
        error: null,
        hasMiddleware: false,
        layouts: [],
        loading: null,
        notFound: null,
        page: '/entries/route__hello_world___slug____page.js',
        routePath: '/hello world/[slug]',
        segments: [
          { kind: 'static', value: 'hello world' },
          { kind: 'required', value: 'slug' },
        ],
        server: null,
      },
    ]

    expect(matchRouteManifest(manifest, '/hello%20world/ada%20lovelace')).toMatchObject({
      params: { slug: 'ada lovelace' },
    })
  })

  it('keeps nearest dynamic params when resolving special manifest fallbacks', () => {
    const manifest: RouteManifest = [
      {
        error: null,
        hasMiddleware: false,
        layouts: [],
        loading: null,
        notFound: '/entries/special__blog___slug____not_found.js',
        page: '/entries/route__blog___slug____page.js',
        routePath: '/blog/[slug]',
        segments: [
          { kind: 'static', value: 'blog' },
          { kind: 'required', value: 'slug' },
        ],
        server: null,
      },
    ]

    expect(findSpecialManifestEntry(manifest, '/blog/hello/missing', 'notFound')).toMatchObject({
      params: { slug: 'hello' },
    })
  })
})
