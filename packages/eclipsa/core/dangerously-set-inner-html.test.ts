import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
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
  childNodes = []
  innerHTML = ''
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
  atoms: /* @__PURE__ */ new WeakMap(),
  components: /* @__PURE__ */ new Map(),
  dirty: /* @__PURE__ */ new Set(),
  doc: new FakeDocument(),
  imports: /* @__PURE__ */ new Map(),
  loaderStates: /* @__PURE__ */ new Map(),
  loaders: /* @__PURE__ */ new Map(),
  id: 'rt-test',
  nextAtomId: 0,
  nextComponentId: 0,
  nextElementId: 0,
  nextScopeId: 0,
  nextSignalId: 0,
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
function withFakeNodeGlobal(fn) {
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
describe('dangerouslySetInnerHTML', () => {
  it('renders raw HTML during SSR without outputting the prop name', () => {
    const { html } = renderSSR(() =>
      jsxDEV(
        'div',
        {
          children: 'fallback',
          dangerouslySetInnerHTML: '<span>raw</span>',
        },
        null,
        false,
        {},
      ),
    )
    expect(html).toBe('<div><span>raw</span></div>')
    expect(html).not.toContain('dangerouslySetInnerHTML')
    expect(html).not.toContain('fallback')
  })
  it('sets innerHTML on client-rendered elements and skips JSX children', () => {
    withFakeNodeGlobal(() => {
      const container = createContainer()
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          jsxDEV(
            'div',
            {
              children: ['fallback'],
              dangerouslySetInnerHTML: '<span>raw</span>',
            },
            null,
            false,
            {},
          ),
          container,
        ),
      )
      const element = nodes[0]
      expect(element.innerHTML).toBe('<span>raw</span>')
      expect(element.attributes.has('dangerouslySetInnerHTML')).toBe(false)
      expect(element.childNodes).toHaveLength(0)
    })
  })
})
