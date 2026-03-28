import { describe, expect, it } from 'vitest'

import { createContext, useContext } from './context.ts'
import { __eclipsaComponent } from './internal.ts'
import { renderClientInsertable, type RuntimeContainer, withRuntimeContainer } from './runtime.ts'
import { renderSSR } from './ssr.ts'

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
    id: 'rt-context-test',
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
  const OriginalElement = globalThis.Element
  const OriginalHTMLElement = globalThis.HTMLElement
  const OriginalNode = globalThis.Node
  globalThis.Element = FakeElement as unknown as typeof Element
  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement
  globalThis.Node = FakeNode as unknown as typeof Node
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(() => {
        globalThis.Element = OriginalElement
        globalThis.HTMLElement = OriginalHTMLElement
        globalThis.Node = OriginalNode
      }) as T
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

const collectText = (nodes: FakeNode[]) => {
  let result = ''
  const visit = (node: FakeNode) => {
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
    const ThemeContext = createContext<string>()
    const ReadTheme = __eclipsaComponent(
      () => <p>{useContext(ThemeContext)}</p>,
      'context-read-ssr',
      () => [],
    )
    const App = __eclipsaComponent(
      () => (
        <ThemeContext.Provider value="dark">
          <ReadTheme />
        </ThemeContext.Provider>
      ),
      'context-app-ssr',
      () => [],
    )

    const { html } = renderSSR(() => <App />)

    expect(html).toContain('<p>dark</p>')
  })

  it('reads provided values during client rendering', () =>
    withFakeNodeGlobal(() => {
      const ThemeContext = createContext<string>()
      const ReadTheme = __eclipsaComponent(
        () => <p>{useContext(ThemeContext)}</p>,
        'context-read-client',
        () => [],
      )
      const App = __eclipsaComponent(
        () => (
          <ThemeContext.Provider value="dark">
            <ReadTheme />
          </ThemeContext.Provider>
        ),
        'context-app-client',
        () => [],
      )

      const container = createContainer()
      const nodes = withRuntimeContainer(container, () => renderClientInsertable(<App />, container))

      expect(collectText(nodes as unknown as FakeNode[])).toBe('dark')
    }))

  it('uses the nearest provider value for nested providers', () => {
    const ThemeContext = createContext<string>()
    const ReadTheme = __eclipsaComponent(
      (props: { label: string }) => (
        <span>
          {props.label}:{useContext(ThemeContext)}
        </span>
      ),
      'context-read-nested',
      () => [],
    )
    const App = __eclipsaComponent(
      () => (
        <ThemeContext.Provider value="outer">
          <ReadTheme label="outer" />
          <ThemeContext.Provider value="inner">
            <ReadTheme label="inner" />
          </ThemeContext.Provider>
        </ThemeContext.Provider>
      ),
      'context-app-nested',
      () => [],
    )

    const { html } = renderSSR(() => <App />)

    expect(html).toContain('<span>outer:outer</span>')
    expect(html).toContain('<span>inner:inner</span>')
  })

  it('does not leak provider values across sibling branches', () => {
    const ThemeContext = createContext<string>()
    const ReadTheme = __eclipsaComponent(
      () => <span>{useContext(ThemeContext)}</span>,
      'context-read-sibling',
      () => [],
    )
    const App = __eclipsaComponent(
      () => (
        <>
          <ThemeContext.Provider value="left">
            <ReadTheme />
          </ThemeContext.Provider>
          <ThemeContext.Provider value="right">
            <ReadTheme />
          </ThemeContext.Provider>
        </>
      ),
      'context-app-sibling',
      () => [],
    )

    const { html } = renderSSR(() => <App />)

    expect(html).toContain('<span>left</span>')
    expect(html).toContain('<span>right</span>')
  })

  it('returns the default value when no provider exists', () => {
    const ThemeContext = createContext('light')
    const ReadTheme = __eclipsaComponent(
      () => <p>{useContext(ThemeContext)}</p>,
      'context-read-default',
      () => [],
    )

    const { html } = renderSSR(() => <ReadTheme />)

    expect(html).toContain('<p>light</p>')
  })

  it('throws when no matching provider exists', () => {
    const ThemeContext = createContext<string>()
    const ReadTheme = __eclipsaComponent(
      () => <p>{useContext(ThemeContext)}</p>,
      'context-read-missing',
      () => [],
    )

    expect(() => renderSSR(() => <ReadTheme />)).toThrowError(
      'useContext() could not find a matching context provider.',
    )
  })

  it('throws when called outside a component render', () => {
    const ThemeContext = createContext<string>()

    expect(() => useContext(ThemeContext)).toThrowError(
      'useContext() can only be used while rendering a component.',
    )
  })
})
