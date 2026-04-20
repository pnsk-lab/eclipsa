import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from './internal.ts'
import { Link, useLocation, useNavigate } from './router.tsx'
import { primeLocationState, renderClientInsertable, withRuntimeContainer } from './runtime.ts'
import { renderSSR, renderSSRAsync } from './ssr.ts'
class FakeNode {
  childNodes = []
  parentNode = null
  appendChild(child) {
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }
  get textContent() {
    return this.childNodes.map((child) => child.textContent).join('')
  }
}
class FakeText extends FakeNode {
  constructor(data) {
    super()
    this.data = data
  }
  get textContent() {
    return this.data
  }
}
class FakeComment extends FakeNode {
  constructor(data) {
    super()
    this.data = data
  }
  get textContent() {
    return ''
  }
}
class FakeElement extends FakeNode {
  constructor(tagName) {
    super()
    this.tagName = tagName
  }
  attributes = /* @__PURE__ */ new Map()
  className = ''
  setAttribute(name, value) {
    this.attributes.set(name, value)
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }
}
class FakeDocument {
  createComment(data) {
    return new FakeComment(data)
  }
  createElement(tagName) {
    return new FakeElement(tagName)
  }
  createTextNode(data) {
    return new FakeText(data)
  }
}
const withFakeDom = (fn) => {
  const previousDocument = globalThis.document
  const previousNode = globalThis.Node
  Object.assign(globalThis, {
    Node: FakeNode,
    document: new FakeDocument(),
  })
  try {
    fn()
  } finally {
    if (previousDocument === void 0) {
      Reflect.deleteProperty(globalThis, 'document')
    } else {
      Object.assign(globalThis, { document: previousDocument })
    }
    if (previousNode === void 0) {
      Reflect.deleteProperty(globalThis, 'Node')
    } else {
      Object.assign(globalThis, { Node: previousNode })
    }
  }
}
const collectElements = (node) => {
  const result = []
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
        return /* @__PURE__ */ jsxDEV(
          'button',
          { children: navigate.isNavigating ? 'loading' : 'idle' },
          void 0,
          false,
          {
            fileName: 'packages/eclipsa/core/router.test.ts',
            lineNumber: 115,
            columnNumber: 16,
          },
        )
      },
      'component-symbol',
      () => [],
    )
    const { html, payload } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/router.test.ts',
        lineNumber: 121,
        columnNumber: 47,
      }),
    )
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
        return /* @__PURE__ */ jsxDEV(
          'p',
          {
            children: [
              location.pathname,
              '|',
              location.search,
              '|',
              location.hash,
              '|',
              location.href,
            ],
          },
          void 0,
          true,
          {
            fileName: 'packages/eclipsa/core/router.test.ts',
            lineNumber: 135,
            columnNumber: 11,
          },
        )
      },
      'component-symbol',
      () => [],
    )
    const { html, payload } = await renderSSRAsync(
      () =>
        /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
          fileName: 'packages/eclipsa/core/router.test.ts',
          lineNumber: 144,
          columnNumber: 58,
        }),
      {
        prepare(container) {
          primeLocationState(container, 'https://example.com/docs?tab=api#hooks')
        },
      },
    )
    expect(html).toContain('<p>/docs|?tab=api|#hooks|https://example.com/docs?tab=api#hooks</p>')
    expect(payload.signals['$router:url']).toBe('https://example.com/docs?tab=api#hooks')
    expect(payload.subscriptions['$router:url']).toEqual(['c0'])
  })
})
describe('Link', () => {
  it('normalizes prefetch controls onto internal attributes', () => {
    const disabled = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        Link,
        { href: '/actions', prefetch: false, children: 'Actions' },
        void 0,
        false,
        {
          fileName: 'packages/eclipsa/core/router.test.ts',
          lineNumber: 159,
          columnNumber: 7,
        },
      ),
    )
    const enabled = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        Link,
        { href: '/counter', prefetch: 'hover', children: 'Counter' },
        void 0,
        false,
        {
          fileName: 'packages/eclipsa/core/router.test.ts',
          lineNumber: 164,
          columnNumber: 7,
        },
      ),
    )
    expect(disabled.html).toContain('data-e-link-prefetch="none"')
    expect(disabled.html).not.toContain(' prefetch=')
    expect(enabled.html).toContain('data-e-link-prefetch="hover"')
    expect(enabled.html).not.toContain(' prefetch=')
  })
  it('skips internal router attrs when document navigation is requested', () => {
    const rendered = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        Link,
        {
          href: '/playground',
          prefetch: 'hover',
          reloadDocument: true,
          replace: true,
          children: 'Playground',
        },
        void 0,
        false,
        {
          fileName: 'packages/eclipsa/core/router.test.ts',
          lineNumber: 177,
          columnNumber: 7,
        },
      ),
    )
    expect(rendered.html).toContain('href="/playground"')
    expect(rendered.html).not.toContain('data-e-link=')
    expect(rendered.html).not.toContain('data-e-link-prefetch=')
    expect(rendered.html).not.toContain('data-e-link-replace=')
    expect(rendered.html).not.toContain(' reloadDocument=')
    expect(rendered.html).not.toContain(' replace=')
  })
  it('renders jsx children on the client without stringifying them', () => {
    withFakeDom(() => {
      const Icon = () =>
        /* @__PURE__ */ jsxDEV(
          'svg',
          {
            children: /* @__PURE__ */ jsxDEV('path', {}, void 0, false, {
              fileName: 'packages/eclipsa/core/router.test.ts',
              lineNumber: 194,
              columnNumber: 11,
            }),
          },
          void 0,
          false,
          {
            fileName: 'packages/eclipsa/core/router.test.ts',
            lineNumber: 193,
            columnNumber: 9,
          },
        )
      const container = {
        actionStates: /* @__PURE__ */ new Map(),
        actions: /* @__PURE__ */ new Map(),
        asyncSignalSnapshotCache: /* @__PURE__ */ new Map(),
        asyncSignalStates: /* @__PURE__ */ new Map(),
        atoms: /* @__PURE__ */ new WeakMap(),
        components: /* @__PURE__ */ new Map(),
        dirty: /* @__PURE__ */ new Set(),
        doc: document,
        id: 'rt-test',
        imports: /* @__PURE__ */ new Map(),
        loaderStates: /* @__PURE__ */ new Map(),
        loaders: /* @__PURE__ */ new Map(),
        nextAtomId: 0,
        nextComponentId: 0,
        nextElementId: 0,
        nextScopeId: 0,
        nextSignalId: 0,
        pendingSuspensePromises: /* @__PURE__ */ new Set(),
        rootChildCursor: 0,
        rootElement: null,
        router: null,
        scopes: /* @__PURE__ */ new Map(),
        signals: /* @__PURE__ */ new Map(),
        symbols: /* @__PURE__ */ new Map(),
        visibilityCheckQueued: false,
        visibilityListenersCleanup: null,
        visibles: /* @__PURE__ */ new Map(),
        watches: /* @__PURE__ */ new Map(),
      }
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          /* @__PURE__ */ jsxDEV(
            Link,
            {
              href: '/',
              children: [
                /* @__PURE__ */ jsxDEV(Icon, {}, void 0, false, {
                  fileName: 'packages/eclipsa/core/router.test.ts',
                  lineNumber: 231,
                  columnNumber: 13,
                }),
                /* @__PURE__ */ jsxDEV('span', { children: 'eclipsa' }, void 0, false, {
                  fileName: 'packages/eclipsa/core/router.test.ts',
                  lineNumber: 232,
                  columnNumber: 13,
                }),
              ],
            },
            void 0,
            true,
            {
              fileName: 'packages/eclipsa/core/router.test.ts',
              lineNumber: 230,
              columnNumber: 11,
            },
          ),
          container,
        ),
      )
      const anchor = nodes.find((node) => node instanceof FakeElement && node.tagName === 'a')
      expect(anchor).toBeTruthy()
      expect(anchor?.textContent).toBe('eclipsa')
      expect(anchor?.textContent).not.toContain('[object Object]')
      expect(
        collectElements(anchor ?? new FakeElement('missing')).some(
          (node) => node.tagName === 'svg',
        ),
      ).toBe(true)
    })
  })
})
