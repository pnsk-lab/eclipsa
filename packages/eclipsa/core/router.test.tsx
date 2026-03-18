import { describe, expect, it } from 'vitest'

import { component$ } from './component.ts'
import { __eclipsaComponent } from './internal.ts'
import { Link, useNavigate } from './router.tsx'
import { buildRoutePath, createRouteHref } from './router-shared.ts'
import { renderSSR } from './ssr.ts'

describe('useNavigate', () => {
  it('tracks the internal navigating signal when isNavigating is read during render', () => {
    const App = component$(
      __eclipsaComponent(
        () => {
          const navigate = useNavigate()
          return <button>{navigate.isNavigating ? 'loading' : 'idle'}</button>
        },
        'component-symbol',
        () => [],
      ),
    )

    const { html, payload } = renderSSR(() => <App />)

    expect(html).toContain('<button>idle</button>')
    expect(payload.signals['$router:isNavigating']).toBe(false)
    expect(payload.subscriptions['$router:isNavigating']).toEqual(['c0'])
  })
})

describe('Link', () => {
  it('normalizes prefetch controls onto internal attributes', () => {
    const disabled = renderSSR(() => (
      <Link href="/actions" prefetch={false}>
        Actions
      </Link>
    ))
    const enabled = renderSSR(() => (
      <Link href="/counter" prefetch="hover">
        Counter
      </Link>
    ))

    expect(disabled.html).toContain('data-e-link-prefetch="none"')
    expect(disabled.html).not.toContain(' prefetch=')
    expect(enabled.html).toContain('data-e-link-prefetch="hover"')
    expect(enabled.html).not.toContain(' prefetch=')
  })

  it('accepts route targets and resolves them into href', () => {
    const rendered = renderSSR(() => (
      <Link
        to="/posts/[id]/[[tab]]"
        params={{
          id: 12,
          tab: 'comments',
        }}
      >
        Post
      </Link>
    ))

    expect(rendered.html).toContain('href="/posts/12/comments"')
  })
})

describe('typed route helpers', () => {
  it('builds route paths with required optional and rest params', () => {
    expect(
      buildRoutePath('/blog/[slug]/[[tab]]/[...rest]', {
        slug: 'hello world',
        tab: 'meta',
        rest: ['a', 'b'],
      }),
    ).toBe('/blog/hello%20world/meta/a/b')

    expect(
      buildRoutePath('/blog/[slug]/[[tab]]', {
        slug: 'hello',
      }),
    ).toBe('/blog/hello')
  })

  it('builds href values with query and hash', () => {
    expect(
      createRouteHref({
        to: '/blog/[slug]',
        params: { slug: 'typed-routing' },
        search: {
          draft: true,
          tag: ['framework', 'router'],
        },
        hash: 'intro',
      }),
    ).toBe('/blog/typed-routing?draft=true&tag=framework&tag=router#intro')
  })

  it('throws for missing required params', () => {
    expect(() => buildRoutePath('/blog/[slug]', {} as never)).toThrow(
      'Missing route parameter "slug"',
    )
  })
})
