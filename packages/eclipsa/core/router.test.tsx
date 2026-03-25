import { describe, expect, it } from 'vitest'

import { __eclipsaComponent } from './internal.ts'
import { Link, useLocation, useNavigate } from './router.tsx'
import { primeLocationState, renderClientInsertable, withRuntimeContainer } from './runtime.ts'
import { renderSSR, renderSSRAsync } from './ssr.ts'

class FakeNode {
  childNodes: FakeNode[] = []
  parentNode: FakeNode | null = null

  appendChild(child: FakeNode) {
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('')
  }
}

class FakeText extends FakeNode {
  constructor(readonly data: string) {
    super()
  }

  override get textContent() {
    return this.data
  }
}

class FakeComment extends FakeNode {
  constructor(readonly data: string) {
    super()
  }

  override get textContent() {
    return ''
  }
}

class FakeElement extends FakeNode {
  attributes = new Map<string, string>()
  className = ''

  constructor(readonly tagName: string) {
    super()
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }
}

class FakeDocument {
  createComment(data: string) {
    return new FakeComment(data)
  }

  createElement(tagName: string) {
    return new FakeElement(tagName)
  }

  createTextNode(data: string) {
    return new FakeText(data)
  }
}

const withFakeDom = (fn: () => void) => {
  const previousDocument = globalThis.document
  const previousNode = globalThis.Node

  Object.assign(globalThis, {
    Node: FakeNode,
    document: new FakeDocument(),
  })

  try {
    fn()
  } finally {
    if (previousDocument === undefined) {
      delete (globalThis as typeof globalThis & { document?: Document }).document
    } else {
      Object.assign(globalThis, { document: previousDocument })
    }
    if (previousNode === undefined) {
      delete (globalThis as typeof globalThis & { Node?: typeof Node }).Node
    } else {
      Object.assign(globalThis, { Node: previousNode })
    }
  }
}

const collectElements = (node: FakeNode): FakeElement[] => {
  const result: FakeElement[] = []
  for (const child of node.childNodes) {
    if (child instanceof FakeElement) {
      result.push(child)
    }
    result.push(...collectElements(child))
  }
  return result
}

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

  it('renders jsx children on the client without stringifying them', () => {
    withFakeDom(() => {
      const Icon = () => (
        <svg>
          <path />
        </svg>
      )
      const container = {
        actionStates: new Map(),
        actions: new Map(),
        asyncSignalSnapshotCache: new Map(),
        asyncSignalStates: new Map(),
        components: new Map(),
        dirty: new Set(),
        doc: document as unknown as Document,
        id: 'rt-test',
        imports: new Map(),
        loaderStates: new Map(),
        loaders: new Map(),
        nextComponentId: 0,
        nextElementId: 0,
        nextScopeId: 0,
        nextSignalId: 0,
        pendingSuspensePromises: new Set(),
        rootChildCursor: 0,
        rootElement: null,
        router: null,
        scopes: new Map(),
        signals: new Map(),
        symbols: new Map(),
        visibilityCheckQueued: false,
        visibilityListenersCleanup: null,
        visibles: new Map(),
        watches: new Map(),
      }

      const nodes = withRuntimeContainer(container as never, () =>
        renderClientInsertable(
          <Link href="/">
            <Icon />
            <span>eclipsa</span>
          </Link>,
          container as never,
        ),
      )
      const anchor = nodes.find((node) => node instanceof FakeElement && node.tagName === 'a') as
        | FakeElement
        | undefined

      expect(anchor).toBeTruthy()
      expect(anchor?.textContent).toBe('eclipsa')
      expect(anchor?.textContent).not.toContain('[object Object]')
      expect(collectElements(anchor ?? new FakeElement('missing')).some((node) => node.tagName === 'svg')).toBe(true)
    })
  })
})
