import { describe, expect, it } from 'vitest'

import { component$ } from './component.ts'
import { __eclipsaComponent } from './internal.ts'
import { Link, useNavigate } from './router.tsx'
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
})
