import { describe, expect, it } from 'vitest'

import { __eclipsaComponent } from './internal.ts'
import { Link, useLocation, useNavigate } from './router.tsx'
import { primeLocationState } from './runtime.ts'
import { renderSSR, renderSSRAsync } from './ssr.ts'

describe('useNavigate', () => {
  it('tracks the internal navigating signal when isNavigating is read during render', () => {
    const App = __eclipsaComponent(
      () => {
        const navigate = useNavigate()
        return <button>{navigate.isNavigating ? 'loading' : 'idle'}</button>
      },
      'component-symbol',
      () => [],
    )

    const { html, payload } = renderSSR(() => <App />)

    expect(html).toContain('<button>idle</button>')
    expect(payload.signals['$router:isNavigating']).toBe(false)
    expect(payload.subscriptions['$router:isNavigating']).toEqual(['c0'])
  })
})

describe('useLocation', () => {
  it('tracks the current route location during render', async () => {
    const App = __eclipsaComponent(
      () => {
        const location = useLocation()
        return (
          <p>
            {location.pathname}|{location.search}|{location.hash}|{location.href}
          </p>
        )
      },
      'component-symbol',
      () => [],
    )

    const { html, payload } = await renderSSRAsync(() => <App />, {
      prepare(container) {
        primeLocationState(container, 'https://example.com/docs?tab=api#hooks')
      },
    })

    expect(html).toContain(
      '<p>/docs|?tab=api|#hooks|https://example.com/docs?tab=api#hooks</p>',
    )
    expect(payload.signals['$router:url']).toBe('https://example.com/docs?tab=api#hooks')
    expect(payload.subscriptions['$router:url']).toEqual(['c0'])
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
})
