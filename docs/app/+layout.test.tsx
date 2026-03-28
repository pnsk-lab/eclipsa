import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from '../../packages/eclipsa/core/internal.ts'
import { primeLocationState } from '../../packages/eclipsa/core/runtime.ts'
import { renderSSR, renderSSRAsync } from '../../packages/eclipsa/core/ssr.ts'
import AppLayout from './+layout.tsx'

const TestApp = __eclipsaComponent(
  () => (
    <AppLayout>
      <main>content</main>
    </AppLayout>
  ),
  'docs-app-layout-test',
  () => [],
)

describe('app layout', () => {
  it('renders Discord and GitHub links in the site navigation', () => {
    const result = renderSSR(() => <TestApp />, {
      symbols: {},
    })

    expect(result.html).toContain('aria-label="Discord"')
    expect(result.html).toContain('href="https://discord.gg/cKbScerjFK"')
    expect(result.html).toContain('aria-label="GitHub"')
    expect(result.html).toContain('href="https://github.com/pnsk-lab/eclipsa"')
  })

  it('forces a document reload for the playground navigation link', () => {
    const result = renderSSR(() => <TestApp />, {
      symbols: {},
    })

    const docsLink = result.html.match(/<a[^>]*>Docs<\/a>/)?.[0]
    const playgroundLink = result.html.match(/<a[^>]*>Playground<\/a>/)?.[0]

    expect(docsLink).toContain('data-e-link=""')
    expect(playgroundLink).toBeTruthy()
    expect(playgroundLink).not.toContain('data-e-link')
  })

  it('renders a docs theme toggle on docs routes', async () => {
    const result = await renderSSRAsync(() => <TestApp />, {
      prepare(container) {
        primeLocationState(container, 'https://example.com/docs/getting-started/overview')
      },
    })

    expect(result.html).toContain('data-testid="docs-theme-toggle"')
    expect(result.html).toContain('aria-label="Switch to dark mode"')
    expect(result.html).toContain('title="Current theme: light"')
    expect(result.html).toContain('i-tabler-moon-stars')
  })

  it('renders the docs search trigger in the header on docs routes', async () => {
    const result = await renderSSRAsync(() => <TestApp />, {
      prepare(container) {
        primeLocationState(container, 'https://example.com/docs/getting-started/overview')
      },
    })

    expect(result.html).toContain('data-testid="docs-search-trigger"')
    expect(result.html).toContain('>Search docs</span>')
    expect(result.html).toContain('>K</kbd>')
  })
})
