import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
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
  childNodes: FakeNode[] = []
  innerHTML = ''

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
    components: new Map(),
    dirty: new Set(),
    doc: new FakeDocument() as unknown as Document,
    imports: new Map(),
    loaderStates: new Map(),
    loaders: new Map(),
    id: 'rt-test',
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
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

function withFakeNodeGlobal<T>(fn: () => T): T {
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
      const element = nodes[0] as unknown as FakeElement

      expect(element.innerHTML).toBe('<span>raw</span>')
      expect(element.attributes.has('dangerouslySetInnerHTML')).toBe(false)
      expect(element.childNodes).toHaveLength(0)
    })
  })
})
