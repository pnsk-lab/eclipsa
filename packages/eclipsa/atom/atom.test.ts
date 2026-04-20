import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { __eclipsaComponent } from '../core/internal.ts'
import { renderClientInsertable, withRuntimeContainer } from '../core/runtime.ts'
import { renderSSRStream } from '../core/ssr.ts'
import { atom, useAtom } from './mod.ts'
class FakeNode {}
class FakeText extends FakeNode {
  constructor(data) {
    super()
    this.data = data
  }
}
class FakeComment extends FakeNode {
  constructor(data) {
    super()
    this.data = data
  }
}
class FakeElement extends FakeNode {
  constructor(tagName) {
    super()
    this.tagName = tagName
  }
  attributes = /* @__PURE__ */ new Map()
  childNodes = []
  appendChild(node) {
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
  actionStates: /* @__PURE__ */ new Map(),
  actions: /* @__PURE__ */ new Map(),
  asyncSignalSnapshotCache: /* @__PURE__ */ new Map(),
  asyncSignalStates: /* @__PURE__ */ new Map(),
  atoms: /* @__PURE__ */ new WeakMap(),
  components: /* @__PURE__ */ new Map(),
  dirty: /* @__PURE__ */ new Set(),
  doc: new FakeDocument(),
  id: 'rt-atom-test',
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
describe('atom', () => {
  it('shares atom state across components in the same container', () => {
    withFakeNodeGlobal(() => {
      const countAtom = atom(0)
      let first
      let second
      const First = __eclipsaComponent(
        () => {
          first = useAtom(countAtom)
          return 'first'
        },
        'component-atom-first',
        () => [],
      )
      const Second = __eclipsaComponent(
        () => {
          second = useAtom(countAtom)
          return 'second'
        },
        'component-atom-second',
        () => [],
      )
      const container = createContainer()
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(First, {}, null, false, {}), container)
        renderClientInsertable(jsxDEV(Second, {}, null, false, {}), container)
      })
      first.value = 1
      expect(second.value).toBe(1)
      expect(container.components.get('c0')?.signalIds).toEqual(['a0'])
      expect(container.components.get('c1')?.signalIds).toEqual(['a0'])
    })
  })
  it('isolates atom state between runtime containers', () => {
    withFakeNodeGlobal(() => {
      const countAtom = atom(0)
      let first
      let second
      const First = __eclipsaComponent(
        () => {
          first = useAtom(countAtom)
          return 'first'
        },
        'component-atom-first-isolated',
        () => [],
      )
      const Second = __eclipsaComponent(
        () => {
          second = useAtom(countAtom)
          return 'second'
        },
        'component-atom-second-isolated',
        () => [],
      )
      const firstContainer = createContainer()
      const secondContainer = createContainer()
      withRuntimeContainer(firstContainer, () => {
        renderClientInsertable(jsxDEV(First, {}, null, false, {}), firstContainer)
      })
      withRuntimeContainer(secondContainer, () => {
        renderClientInsertable(jsxDEV(Second, {}, null, false, {}), secondContainer)
      })
      first.value = 1
      expect(second.value).toBe(0)
      expect(firstContainer.components.get('c0')?.signalIds).toEqual(['a0'])
      expect(secondContainer.components.get('c0')?.signalIds).toEqual(['a0'])
    })
  })
  it('throws when useAtom is called outside a component render', () => {
    expect(() => useAtom(atom(0))).toThrowError(
      'useAtom() can only be used while rendering a component.',
    )
  })
  it('includes atom-backed signals in streaming SSR resume payloads', async () => {
    const countAtom = atom(0)
    const App = __eclipsaComponent(
      () => {
        const count = useAtom(countAtom)
        return jsxDEV(
          'div',
          {
            children: count.value,
          },
          null,
          false,
          {},
        )
      },
      'component-atom-stream',
      () => [],
    )
    const { payload } = await renderSSRStream(() => jsxDEV(App, {}, null, false, {}))
    expect(payload.signals).toEqual({ a0: 0 })
    expect(
      Object.values(payload.components).some((component) => component.signalIds.includes('a0')),
    ).toBe(true)
  })
})
