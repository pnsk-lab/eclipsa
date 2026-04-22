import { Fragment, jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { createContext, useContext } from './context.ts'
import { __eclipsaComponent } from './internal.ts'
import { renderClientInsertable, withRuntimeContainer } from './runtime.ts'
import { renderSSR } from './ssr.ts'
class FakeNode {
  childNodes = []
  nodeType = 0
  parentNode = null
}
class FakeText extends FakeNode {
  constructor(data) {
    super()
    this.data = data
    this.nodeType = 3
  }
}
class FakeComment extends FakeNode {
  constructor(data) {
    super()
    this.data = data
    this.nodeType = 8
  }
}
class FakeElement extends FakeNode {
  constructor(tagName) {
    super()
    this.tagName = tagName
    this.nodeType = 1
  }
  attributes = /* @__PURE__ */ new Map()
  appendChild(node) {
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }
  setAttribute(name, value) {
    this.attributes.set(name, value)
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
const createContainer = () => ({
  actions: /* @__PURE__ */ new Map(),
  actionStates: /* @__PURE__ */ new Map(),
  asyncSignalStates: /* @__PURE__ */ new Map(),
  asyncSignalSnapshotCache: /* @__PURE__ */ new Map(),
  atoms: /* @__PURE__ */ new WeakMap(),
  components: /* @__PURE__ */ new Map(),
  dirty: /* @__PURE__ */ new Set(),
  doc: new FakeDocument(),
  id: 'rt-context-test',
  imports: /* @__PURE__ */ new Map(),
  loaderStates: /* @__PURE__ */ new Map(),
  loaders: /* @__PURE__ */ new Map(),
  nextAtomId: 0,
  nextComponentId: 0,
  nextElementId: 0,
  nextScopeId: 0,
  nextSignalId: 0,
  pendingSuspensePromises: /* @__PURE__ */ new Set(),
  rootChildComponentIds: /* @__PURE__ */ new Set(),
  rootChildCursor: 0,
  rootElement: void 0,
  router: null,
  scopes: /* @__PURE__ */ new Map(),
  signals: /* @__PURE__ */ new Map(),
  symbols: /* @__PURE__ */ new Map(),
  visibilityCheckQueued: false,
  visibilityListenersCleanup: null,
  visibles: /* @__PURE__ */ new Map(),
  watches: /* @__PURE__ */ new Map(),
})
const withFakeNodeGlobal = (fn) => {
  const OriginalElement = globalThis.Element
  const OriginalHTMLElement = globalThis.HTMLElement
  const OriginalNode = globalThis.Node
  globalThis.Element = FakeElement
  globalThis.HTMLElement = FakeElement
  globalThis.Node = FakeNode
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(() => {
        globalThis.Element = OriginalElement
        globalThis.HTMLElement = OriginalHTMLElement
        globalThis.Node = OriginalNode
      })
    }
    globalThis.Element = OriginalElement
    globalThis.HTMLElement = OriginalHTMLElement
    globalThis.Node = OriginalNode
    return result
  } catch (error) {
    globalThis.Element = OriginalElement
    globalThis.HTMLElement = OriginalHTMLElement
    globalThis.Node = OriginalNode
    throw error
  }
}
const collectText = (nodes) => {
  let result = ''
  const visit = (node) => {
    if (node instanceof FakeText) {
      result += node.data
    }
    for (const child of node.childNodes) {
      visit(child)
    }
  }
  for (const node of nodes) {
    visit(node)
  }
  return result
}
describe('createContext', () => {
  it('reads provided values during SSR', () => {
    const ThemeContext = createContext()
    const ReadTheme = __eclipsaComponent(
      () =>
        /* @__PURE__ */ jsxDEV('p', { children: useContext(ThemeContext) }, void 0, false, {
          fileName: 'packages/eclipsa/core/context.test.ts',
          lineNumber: 141,
          columnNumber: 13,
        }),
      'context-read-ssr',
      () => [],
    )
    const App = __eclipsaComponent(
      () =>
        /* @__PURE__ */ jsxDEV(
          ThemeContext.Provider,
          {
            value: 'dark',
            children: /* @__PURE__ */ jsxDEV(ReadTheme, {}, void 0, false, {
              fileName: 'packages/eclipsa/core/context.test.ts',
              lineNumber: 148,
              columnNumber: 11,
            }),
          },
          void 0,
          false,
          {
            fileName: 'packages/eclipsa/core/context.test.ts',
            lineNumber: 147,
            columnNumber: 9,
          },
        ),
      'context-app-ssr',
      () => [],
    )
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/context.test.ts',
        lineNumber: 155,
        columnNumber: 38,
      }),
    )
    expect(html).toContain('<p>dark</p>')
  })
  it('reads provided values during client rendering', () =>
    withFakeNodeGlobal(() => {
      const ThemeContext = createContext()
      const ReadTheme = __eclipsaComponent(
        () =>
          /* @__PURE__ */ jsxDEV('p', { children: useContext(ThemeContext) }, void 0, false, {
            fileName: 'packages/eclipsa/core/context.test.ts',
            lineNumber: 164,
            columnNumber: 15,
          }),
        'context-read-client',
        () => [],
      )
      const App = __eclipsaComponent(
        () =>
          /* @__PURE__ */ jsxDEV(
            ThemeContext.Provider,
            {
              value: 'dark',
              children: /* @__PURE__ */ jsxDEV(ReadTheme, {}, void 0, false, {
                fileName: 'packages/eclipsa/core/context.test.ts',
                lineNumber: 171,
                columnNumber: 13,
              }),
            },
            void 0,
            false,
            {
              fileName: 'packages/eclipsa/core/context.test.ts',
              lineNumber: 170,
              columnNumber: 11,
            },
          ),
        'context-app-client',
        () => [],
      )
      const container = createContainer()
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
            fileName: 'packages/eclipsa/core/context.test.ts',
            lineNumber: 180,
            columnNumber: 32,
          }),
          container,
        ),
      )
      expect(collectText(nodes)).toBe('dark')
    }))
  it('uses the nearest provider value for nested providers', () => {
    const ThemeContext = createContext()
    const ReadTheme = __eclipsaComponent(
      (props) =>
        /* @__PURE__ */ jsxDEV(
          'span',
          { children: [props.label, ':', useContext(ThemeContext)] },
          void 0,
          true,
          {
            fileName: 'packages/eclipsa/core/context.test.ts',
            lineNumber: 190,
            columnNumber: 9,
          },
        ),
      'context-read-nested',
      () => [],
    )
    const App = __eclipsaComponent(
      () =>
        /* @__PURE__ */ jsxDEV(
          ThemeContext.Provider,
          {
            value: 'outer',
            children: [
              /* @__PURE__ */ jsxDEV(ReadTheme, { label: 'outer' }, void 0, false, {
                fileName: 'packages/eclipsa/core/context.test.ts',
                lineNumber: 200,
                columnNumber: 11,
              }),
              /* @__PURE__ */ jsxDEV(
                ThemeContext.Provider,
                {
                  value: 'inner',
                  children: /* @__PURE__ */ jsxDEV(ReadTheme, { label: 'inner' }, void 0, false, {
                    fileName: 'packages/eclipsa/core/context.test.ts',
                    lineNumber: 202,
                    columnNumber: 13,
                  }),
                },
                void 0,
                false,
                {
                  fileName: 'packages/eclipsa/core/context.test.ts',
                  lineNumber: 201,
                  columnNumber: 11,
                },
              ),
            ],
          },
          void 0,
          true,
          {
            fileName: 'packages/eclipsa/core/context.test.ts',
            lineNumber: 199,
            columnNumber: 9,
          },
        ),
      'context-app-nested',
      () => [],
    )
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/context.test.ts',
        lineNumber: 210,
        columnNumber: 38,
      }),
    )
    expect(html).toContain('<span>outer:outer</span>')
    expect(html).toContain('<span>inner:inner</span>')
  })
  it('does not leak provider values across sibling branches', () => {
    const ThemeContext = createContext()
    const ReadTheme = __eclipsaComponent(
      () =>
        /* @__PURE__ */ jsxDEV('span', { children: useContext(ThemeContext) }, void 0, false, {
          fileName: 'packages/eclipsa/core/context.test.ts',
          lineNumber: 219,
          columnNumber: 13,
        }),
      'context-read-sibling',
      () => [],
    )
    const App = __eclipsaComponent(
      () =>
        /* @__PURE__ */ jsxDEV(
          Fragment,
          {
            children: [
              /* @__PURE__ */ jsxDEV(
                ThemeContext.Provider,
                {
                  value: 'left',
                  children: /* @__PURE__ */ jsxDEV(ReadTheme, {}, void 0, false, {
                    fileName: 'packages/eclipsa/core/context.test.ts',
                    lineNumber: 227,
                    columnNumber: 13,
                  }),
                },
                void 0,
                false,
                {
                  fileName: 'packages/eclipsa/core/context.test.ts',
                  lineNumber: 226,
                  columnNumber: 11,
                },
              ),
              /* @__PURE__ */ jsxDEV(
                ThemeContext.Provider,
                {
                  value: 'right',
                  children: /* @__PURE__ */ jsxDEV(ReadTheme, {}, void 0, false, {
                    fileName: 'packages/eclipsa/core/context.test.ts',
                    lineNumber: 230,
                    columnNumber: 13,
                  }),
                },
                void 0,
                false,
                {
                  fileName: 'packages/eclipsa/core/context.test.ts',
                  lineNumber: 229,
                  columnNumber: 11,
                },
              ),
            ],
          },
          void 0,
          true,
          {
            fileName: 'packages/eclipsa/core/context.test.ts',
            lineNumber: 225,
            columnNumber: 9,
          },
        ),
      'context-app-sibling',
      () => [],
    )
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/context.test.ts',
        lineNumber: 238,
        columnNumber: 38,
      }),
    )
    expect(html).toContain('<span>left</span>')
    expect(html).toContain('<span>right</span>')
  })
  it('returns the default value when no provider exists', () => {
    const ThemeContext = createContext('light')
    const ReadTheme = __eclipsaComponent(
      () =>
        /* @__PURE__ */ jsxDEV('p', { children: useContext(ThemeContext) }, void 0, false, {
          fileName: 'packages/eclipsa/core/context.test.ts',
          lineNumber: 247,
          columnNumber: 13,
        }),
      'context-read-default',
      () => [],
    )
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(ReadTheme, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/context.test.ts',
        lineNumber: 252,
        columnNumber: 38,
      }),
    )
    expect(html).toContain('<p>light</p>')
  })
  it('throws when no matching provider exists', () => {
    const ThemeContext = createContext()
    const ReadTheme = __eclipsaComponent(
      () =>
        /* @__PURE__ */ jsxDEV('p', { children: useContext(ThemeContext) }, void 0, false, {
          fileName: 'packages/eclipsa/core/context.test.ts',
          lineNumber: 260,
          columnNumber: 13,
        }),
      'context-read-missing',
      () => [],
    )
    expect(() =>
      renderSSR(() =>
        /* @__PURE__ */ jsxDEV(ReadTheme, {}, void 0, false, {
          fileName: 'packages/eclipsa/core/context.test.ts',
          lineNumber: 265,
          columnNumber: 34,
        }),
      ),
    ).toThrowError('useContext() could not find a matching context provider.')
  })
  it('throws when called outside a component render', () => {
    const ThemeContext = createContext()
    expect(() => useContext(ThemeContext)).toThrowError(
      'useContext() can only be used while rendering a component.',
    )
  })
})
