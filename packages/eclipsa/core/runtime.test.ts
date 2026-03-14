import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { component$ } from './component.ts'
import { __eclipsaComponent, __eclipsaWatch } from './internal.ts'
import { useSignal, useWatch } from './signal.ts'
import { renderClientInsertable, type RuntimeContainer, withRuntimeContainer } from './runtime.ts'

class FakeNode {}

class FakeText extends FakeNode {
  constructor(readonly data: string) {
    super()
  }
}

class FakeComment extends FakeNode {
  constructor(readonly data: string) {
    super()
  }
}

class FakeElement extends FakeNode {
  attributes = new Map<string, string>()
  childNodes: FakeNode[] = []

  constructor(readonly tagName: string) {
    super()
  }

  appendChild(node: FakeNode) {
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

const withFakeNodeGlobal = <T>(fn: () => T) => {
  const OriginalNode = globalThis.Node
  globalThis.Node = FakeNode as unknown as typeof Node
  try {
    return fn()
  } finally {
    globalThis.Node = OriginalNode
  }
}

describe('renderClientInsertable', () => {
  it('keeps nodes returned from function arrays during client rerenders', () => {
    withFakeNodeGlobal(() => {
      const node = new FakeNode() as unknown as Node
      expect(renderClientInsertable(() => [node], createContainer())).toEqual([node])
    })
  })

  it('resets local signal ids and watch state when a component slot changes symbol', () => {
    withFakeNodeGlobal(() => {
      const First = component$(
        __eclipsaComponent(
          () => {
            const value = useSignal('first')
            useWatch(
              __eclipsaWatch(
                'watch-first',
                () => {
                  value.value
                },
                () => [value],
              ),
            )
            return value.value
          },
          'component-first',
          () => [],
        ),
      )

      const Second = component$(
        __eclipsaComponent(
          () => {
            const count = useSignal(0)
            return count.value
          },
          'component-second',
          () => [],
        ),
      )

      const container = createContainer()

      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(First, {}, null, false, {}), container)
      })

      expect(container.components.get('c0')?.signalIds).toEqual(['s0'])
      expect(container.watches.has('c0:w0')).toBe(true)
      expect(container.signals.get('s0')?.value).toBe('first')

      container.rootChildCursor = 0

      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(Second, {}, null, false, {}), container)
      })

      expect(container.components.get('c0')?.symbol).toBe('component-second')
      expect(container.components.get('c0')?.signalIds).toEqual(['s1'])
      expect(container.components.get('c0')?.watchCount).toBe(0)
      expect(container.watches.has('c0:w0')).toBe(false)
      expect(container.signals.get('s1')?.value).toBe(0)
    })
  })

  it('resolves resumed route slots from the page route cache entry during client rerenders', () => {
    withFakeNodeGlobal(() => {
      const container = createContainer()
      const page = () => jsxDEV('p', { children: 'page content' }, null, false, {})
      container.router = {
        currentPath: { value: '/' },
        currentRoute: null,
        isNavigating: { value: false },
        loadedRoutes: new Map([
          [
            '/::page',
            {
              entry: {} as any,
              layouts: [],
              page: { renderer: page },
              params: {},
              pathname: '/',
              render: () => jsxDEV(page, {}, null, false, {}),
            },
          ],
        ]),
        manifest: [],
        navigate: (async () => {}) as any,
        sequence: 0,
      } as unknown as RuntimeContainer['router']

      const [node] = renderClientInsertable(
        {
          __eclipsa_type: 'route-slot',
          pathname: '/',
          startLayoutIndex: 0,
        },
        container,
      )

      const element = node as unknown as FakeElement
      expect(element).toBeInstanceOf(FakeElement)
      expect(element.tagName).toBe('p')
      expect(element.childNodes).toHaveLength(1)
      expect(element.childNodes[0]).toBeInstanceOf(FakeText)
      expect((element.childNodes[0] as FakeText).data).toBe('page content')
    })
  })
})
