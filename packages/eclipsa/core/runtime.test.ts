import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { component$ } from './component.ts'
import { __eclipsaComponent, __eclipsaWatch } from './internal.ts'
import { onCleanup, onMount, useSignal, useWatch } from './signal.ts'
import { renderClientInsertable, type RuntimeContainer, withRuntimeContainer } from './runtime.ts'

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

const withFakeNodeGlobal = <T>(fn: () => T) => {
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

const collectComments = (nodes: FakeNode[]): string[] => {
  const result: string[] = []
  const visit = (node: FakeNode) => {
    if (node instanceof FakeComment) {
      result.push(node.data)
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

const flushAsync = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('renderClientInsertable', () => {
  it('keeps nodes returned from function arrays during client rerenders', () => {
    withFakeNodeGlobal(() => {
      const node = new FakeNode() as unknown as Node
      expect(renderClientInsertable(() => [node], createContainer())).toEqual([node])
    })
  })

  it('assigns signal refs to rendered elements', () => {
    withFakeNodeGlobal(() => {
      let ref!: { value: HTMLElement | undefined }

      const App = component$(
        __eclipsaComponent(
          () => {
            ref = useSignal<HTMLElement | undefined>()
            return jsxDEV('div', { ref }, null, false, {})
          },
          'component-ref',
          () => [],
        ),
      )

      const container = createContainer()
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container),
      )
      const element = nodes.find((node) => node instanceof FakeElement) as FakeElement | undefined

      expect(element).toBeInstanceOf(FakeElement)
      expect(ref.value).toBe(element as unknown as HTMLElement)
      expect(element?.tagName).toBe('div')
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

  it('runs onMount cleanup when a component slot changes symbol', async () => {
    await withFakeNodeGlobal(async () => {
      const events: string[] = []
      const First = component$(
        __eclipsaComponent(
          () => {
            onMount(() => {
              events.push('mount')
              onCleanup(() => {
                events.push('cleanup')
              })
            })
            return 'first'
          },
          'component-mount-first',
          () => [],
        ),
      )

      const Second = component$(
        __eclipsaComponent(
          () => 'second',
          'component-mount-second',
          () => [],
        ),
      )

      const container = createContainer()

      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(First, {}, null, false, {}), container)
      })

      await flushAsync()
      expect(events).toEqual(['mount'])

      container.rootChildCursor = 0
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(Second, {}, null, false, {}), container)
      })

      expect(events).toEqual(['mount', 'cleanup'])
    })
  })

  it('runs watch cleanup when a resumable watch is torn down', () => {
    withFakeNodeGlobal(() => {
      let count!: { value: number }
      const events: string[] = []

      const First = component$(
        __eclipsaComponent(
          () => {
            count = useSignal(0)
            useWatch(
              __eclipsaWatch(
                'watch-cleanup',
                () => {
                  const snapshot = count.value
                  events.push(`run:${snapshot}`)
                  onCleanup(() => {
                    events.push(`cleanup:${snapshot}`)
                  })
                },
                () => [count],
              ),
            )
            return count.value
          },
          'component-watch-first',
          () => [],
        ),
      )

      const Second = component$(
        __eclipsaComponent(
          () => 'done',
          'component-watch-second',
          () => [],
        ),
      )

      const container = createContainer()

      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(First, {}, null, false, {}), container)
      })

      count.value = 1
      expect(events).toEqual(['run:0', 'cleanup:0', 'run:1'])

      container.rootChildCursor = 0
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(Second, {}, null, false, {}), container)
      })

      expect(events).toEqual(['run:0', 'cleanup:0', 'run:1', 'cleanup:1'])
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

  it('wraps projection slot insertions in stable marker comments during client renders', () => {
    withFakeNodeGlobal(() => {
      const Probe = component$(
        __eclipsaComponent(
          (props: { aa?: unknown; children?: unknown }) =>
            jsxDEV(
              'section',
              {
                children: [
                  jsxDEV('div', { children: props.aa }, null, false, {}),
                  jsxDEV('div', { children: props.children }, null, false, {}),
                  jsxDEV('div', { children: props.aa }, null, false, {}),
                ],
              },
              null,
              false,
              {},
            ),
          'probe-symbol',
          () => [],
          { aa: 2, children: 1 },
        ),
      )

      const container = createContainer()
      const nodes = withRuntimeContainer(container, () =>
        renderClientInsertable(
          jsxDEV(
            Probe as any,
            {
              aa: 'prop content',
              children: 'children content',
            },
            null,
            false,
            {},
          ),
          container,
        ),
      ) as unknown as FakeNode[]

      expect(collectComments(nodes)).toEqual([
        'ec:c:c0:start',
        'ec:s:c0:aa:0:start',
        'ec:s:c0:aa:0:end',
        'ec:s:c0:children:0:start',
        'ec:s:c0:children:0:end',
        'ec:s:c0:aa:1:start',
        'ec:s:c0:aa:1:end',
        'ec:c:c0:end',
      ])
    })
  })
})
