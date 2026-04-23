import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from './internal.ts'
import { renderClientInsertable, withRuntimeContainer } from './runtime.ts'
import { renderSSR } from './ssr.ts'
import { useStyleScoped } from './style.ts'
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
  const OriginalNode = globalThis.Node
  globalThis.Node = FakeNode
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(() => {
        globalThis.Node = OriginalNode
      })
    }
    globalThis.Node = OriginalNode
    return result
  } catch (error) {
    globalThis.Node = OriginalNode
    throw error
  }
}
describe('useStyleScoped', () => {
  it('scopes tagged template styles during SSR', () => {
    const App = __eclipsaComponent(
      () => {
        void useStyleScoped`h1 { color: red; }`
        return /* @__PURE__ */ jsxDEV(
          'div',
          {
            children: /* @__PURE__ */ jsxDEV('h1', { children: 'hello' }, void 0, false, {
              fileName: 'packages/eclipsa/core/style.test.ts',
              lineNumber: 118,
              columnNumber: 13,
            }),
          },
          void 0,
          false,
          {
            fileName: 'packages/eclipsa/core/style.test.ts',
            lineNumber: 117,
            columnNumber: 11,
          },
        )
      },
      'component-symbol',
      () => [],
    )
    const { html, payload } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/style.test.ts',
        lineNumber: 126,
        columnNumber: 47,
      }),
    )
    const scopeId = payload.components.c0?.scope
    expect(scopeId).toBeTruthy()
    expect(html).toContain(`@scope ([data-e-scope="${scopeId}"]) {
h1 { color: red; }
}`)
    expect(html).toContain(`data-e-scope="${scopeId}"`)
  })
  it('accepts string and style element inputs during SSR', () => {
    const StringStyle = __eclipsaComponent(
      () => {
        useStyleScoped('button { color: blue; }')
        return /* @__PURE__ */ jsxDEV('button', { children: 'save' }, void 0, false, {
          fileName: 'packages/eclipsa/core/style.test.ts',
          lineNumber: 138,
          columnNumber: 16,
        })
      },
      'string-style-symbol',
      () => [],
    )
    const ElementStyle = __eclipsaComponent(
      () => {
        useStyleScoped(
          /* @__PURE__ */ jsxDEV(
            'style',
            { media: 'screen', children: 'p { color: green; }' },
            void 0,
            false,
            {
              fileName: 'packages/eclipsa/core/style.test.ts',
              lineNumber: 146,
              columnNumber: 24,
            },
          ),
        )
        return /* @__PURE__ */ jsxDEV('p', { children: 'done' }, void 0, false, {
          fileName: 'packages/eclipsa/core/style.test.ts',
          lineNumber: 147,
          columnNumber: 16,
        })
      },
      'element-style-symbol',
      () => [],
    )
    const stringRender = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(StringStyle, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/style.test.ts',
        lineNumber: 153,
        columnNumber: 42,
      }),
    )
    const elementRender = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(ElementStyle, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/style.test.ts',
        lineNumber: 154,
        columnNumber: 43,
      }),
    )
    expect(stringRender.html).toContain('button { color: blue; }')
    expect(elementRender.html).toContain('<style media="screen">')
    expect(elementRender.html).toContain('p { color: green; }')
  })
  it('treats empty styles as a no-op', () => {
    const App = __eclipsaComponent(
      () => {
        useStyleScoped('')
        return /* @__PURE__ */ jsxDEV('div', { children: 'plain' }, void 0, false, {
          fileName: 'packages/eclipsa/core/style.test.ts',
          lineNumber: 165,
          columnNumber: 16,
        })
      },
      'empty-style-symbol',
      () => [],
    )
    const { html } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/style.test.ts',
        lineNumber: 171,
        columnNumber: 38,
      }),
    )
    expect(html).toContain('<div>plain</div>')
    expect(html).not.toContain('@scope (')
  })
  it('materializes an empty component scope when serializing resumable payloads', () => {
    const App = __eclipsaComponent(
      () =>
        /* @__PURE__ */ jsxDEV('div', { children: 'plain' }, void 0, false, {
          fileName: 'packages/eclipsa/core/style.test.ts',
          lineNumber: 178,
          columnNumber: 14,
        }),
      'plain-symbol',
      () => [],
    )
    const { payload } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: 'packages/eclipsa/core/style.test.ts',
        lineNumber: 186,
        columnNumber: 40,
      }),
    )
    const scopeId = payload.components.c0?.scope
    expect(scopeId).toBeTruthy()
    expect(payload.scopes[scopeId!]).toEqual([])
  })
  it('renders scoped style nodes during client rendering', () =>
    withFakeNodeGlobal(() => {
      const App = __eclipsaComponent(
        () => {
          useStyleScoped(
            /* @__PURE__ */ jsxDEV(
              'style',
              { media: 'screen', children: 'p { color: green; }' },
              void 0,
              false,
              {
                fileName: 'packages/eclipsa/core/style.test.ts',
                lineNumber: 181,
                columnNumber: 26,
              },
            ),
          )
          return /* @__PURE__ */ jsxDEV(
            'section',
            {
              children: /* @__PURE__ */ jsxDEV('p', { children: 'client' }, void 0, false, {
                fileName: 'packages/eclipsa/core/style.test.ts',
                lineNumber: 184,
                columnNumber: 15,
              }),
            },
            void 0,
            false,
            {
              fileName: 'packages/eclipsa/core/style.test.ts',
              lineNumber: 183,
              columnNumber: 13,
            },
          )
        },
        'client-style-symbol',
        () => [],
      )
      const container = createContainer()
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
            fileName: 'packages/eclipsa/core/style.test.ts',
            lineNumber: 194,
            columnNumber: 32,
          }),
          container,
        ),
      )
      const scopeId = container.components.get('c0')?.scopeId
      const styleNode = nodes[1]
      const sectionNode = nodes[2]
      const paragraphNode = sectionNode.childNodes[0]
      expect(scopeId).toBeTruthy()
      expect(styleNode.tagName).toBe('style')
      expect(styleNode.attributes.get('media')).toBe('screen')
      expect(styleNode.childNodes[0].data).toContain(`@scope ([data-e-scope="${scopeId}"])`)
      expect(sectionNode.attributes.get('data-e-scope')).toBe(scopeId)
      expect(paragraphNode.attributes.get('data-e-scope')).toBe(scopeId)
    }))
})
