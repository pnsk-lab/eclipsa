import { describe, expect, it, vi } from 'vitest'

import { component$ } from './component.ts'
import { __eclipsaComponent } from './internal.ts'
import { onMount } from './signal.ts'
import { renderSSR } from './ssr.ts'

describe('onMount', () => {
  it('does not run during SSR', () => {
    const mounted = vi.fn()
    const App = component$(
      __eclipsaComponent(
        () => {
          onMount(() => {
            mounted()
          })

          return <button>ready</button>
        },
        'component-symbol',
        () => [],
      ),
    )

    const { html } = renderSSR(() => <App />)

    expect(html).toContain('<button>ready</button>')
    expect(mounted).not.toHaveBeenCalled()
  })
})
