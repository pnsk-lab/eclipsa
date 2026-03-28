import { describe, expect, it } from 'vitest'

import { __eclipsaComponent } from './internal.ts'
import { renderClientInsertable, type RuntimeContainer, withRuntimeContainer } from './runtime.ts'
import { renderSSR } from './ssr.ts'
import { useStyleScoped } from './style.ts'

class FakeNode {
  childNodes: FakeNode[] = []
  nodeType = 0
  parentNode: FakeNode | null = null
}

class FakeText extends FakeNode {
  constructor(readonly data: string) {
    super()
    this.nodeType = 3
  }
}

class FakeComment extends FakeNode {
  constructor(readonly data: string) {
    super()
    this.nodeType = 8
  }
}

class FakeElement extends FakeNode {
  attributes = new Map<string, string>()

  constructor(readonly tagName: string) {
    super()
    this.nodeType = 1
  }

  appendChild(node: FakeNode) {
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
}

class FakeDocument {
  createComment(data: string) {
    return new FakeComment(data) as unknown as Comment
  }

  createElement(tagName: string) {
    return new FakeElement(tagName) as unknown as HTMLElement
  }

  createTextNode(data: string) {
    return new FakeText(data) as unknown as Text
  }
}

const createContainer = () =>
  ({
    actions: new Map(),
    actionStates: new Map(),
    asyncSignalStates: new Map(),
    asyncSignalSnapshotCache: new Map(),
    atoms: new WeakMap(),
    components: new Map(),
    dirty: new Set(),
    doc: new FakeDocument() as unknown as Document,
    id: 'rt-test',
    imports: new Map(),
    loaderStates: new Map(),
    loaders: new Map(),
    nextAtomId: 0,
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
    pendingSuspensePromises: new Set(),
    rootChildCursor: 0,
    rootElement: undefined,
    router: null,
    scopes: new Map(),
    signals: new Map(),
    symbols: new Map(),
    visibilityCheckQueued: false,
    visibilityListenersCleanup: null,
    visibles: new Map(),
    watches: new Map(),
  }) as RuntimeContainer

const withFakeNodeGlobal = <T,>(fn: () => T) => {
  const OriginalNode = globalThis.Node
  globalThis.Node = FakeNode as unknown as typeof Node
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(() => {
        globalThis.Node = OriginalNode
      }) as T
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
        useStyleScoped`h1 { color: red; }`
        return (
          <div>
            <h1>hello</h1>
          </div>
        )
      },
      'component-symbol',
      () => [],
    )

    const { html, payload } = renderSSR(() => <App />)
    const scopeId = payload.components.c0?.scope

    expect(scopeId).toBeTruthy()
    expect(html).toContain(`@scope ([data-e-scope="${scopeId}"]) {\nh1 { color: red; }\n}`)
    expect(html).toContain(`data-e-scope="${scopeId}"`)
  })

  it('accepts string and style element inputs during SSR', () => {
    const StringStyle = __eclipsaComponent(
      () => {
        useStyleScoped('button { color: blue; }')
        return <button>save</button>
      },
      'string-style-symbol',
      () => [],
    )

    const ElementStyle = __eclipsaComponent(
      () => {
        useStyleScoped(<style media="screen">{'p { color: green; }'}</style>)
        return <p>done</p>
      },
      'element-style-symbol',
      () => [],
    )

    const stringRender = renderSSR(() => <StringStyle />)
    const elementRender = renderSSR(() => <ElementStyle />)

    expect(stringRender.html).toContain('button { color: blue; }')
    expect(elementRender.html).toContain('<style media="screen">')
    expect(elementRender.html).toContain('p { color: green; }')
  })

  it('treats empty styles as a no-op', () => {
    const App = __eclipsaComponent(
      () => {
        useStyleScoped('')
        return <div>plain</div>
      },
      'empty-style-symbol',
      () => [],
    )

    const { html } = renderSSR(() => <App />)

    expect(html).toContain('<div>plain</div>')
    expect(html).not.toContain('@scope (')
  })

  it('renders scoped style nodes during client rendering', () =>
    withFakeNodeGlobal(() => {
      const App = __eclipsaComponent(
        () => {
          useStyleScoped(<style media="screen">{'p { color: green; }'}</style>)
          return (
            <section>
              <p>client</p>
            </section>
          )
        },
        'client-style-symbol',
        () => [],
      )

      const container = createContainer()
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(<App />, container),
      )
      const scopeId = container.components.get('c0')?.scopeId
      const styleNode = nodes[1] as unknown as FakeElement
      const sectionNode = nodes[2] as unknown as FakeElement
      const paragraphNode = sectionNode.childNodes[0] as FakeElement

      expect(scopeId).toBeTruthy()
      expect(styleNode.tagName).toBe('style')
      expect(styleNode.attributes.get('media')).toBe('screen')
      expect((styleNode.childNodes[0] as FakeText).data).toContain(
        `@scope ([data-e-scope="${scopeId}"])`,
      )
      expect(sectionNode.attributes.get('data-e-scope')).toBe(scopeId)
      expect(paragraphNode.attributes.get('data-e-scope')).toBe(scopeId)
    }))
})
