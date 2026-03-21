import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { __eclipsaComponent } from './internal.ts'
import { onCleanup, useSignal, useWatch } from './signal.ts'
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

const renderComponent = (render: () => string) => {
  const App = __eclipsaComponent(render, 'component-signal-test', () => [])
  const container = createContainer()
  withRuntimeContainer(container, () => {
    renderClientInsertable(jsxDEV(App, {}, null, false, {}), container)
  })
}

describe('useSignal', () => {
  it('throws when called outside a component render', () => {
    expect(() => useSignal(0)).toThrowError(
      'useSignal() can only be used while rendering a component.',
    )
  })

  it('throws when onCleanup is called outside a lifecycle or watch callback', () => {
    expect(() => onCleanup(() => {})).toThrowError(
      'onCleanup() can only be used while running onMount(), onVisible(), or useWatch() callbacks.',
    )
  })
})

describe('useWatch', () => {
  it('auto-tracks callback reads when dependencies are omitted', () => {
    withFakeNodeGlobal(() => {
      let tracked!: { value: number }
      let untracked!: { value: string }
      const values: string[] = []

      renderComponent(() => {
        tracked = useSignal(0)
        untracked = useSignal('a')

        useWatch(() => {
          values.push(`${tracked.value}:${untracked.value}`)
        })

        return 'ready'
      })

      untracked.value = 'b'
      tracked.value = 1

      expect(values).toEqual(['0:a', '0:b', '1:b'])
    })
  })

  it('runs cleanup before each local dynamic rerun', () => {
    withFakeNodeGlobal(() => {
      let tracked!: { value: number }
      let untracked!: { value: string }
      const events: string[] = []

      renderComponent(() => {
        tracked = useSignal(0)
        untracked = useSignal('a')

        useWatch(() => {
          const snapshot = `${tracked.value}:${untracked.value}`
          events.push(`run:${snapshot}`)
          onCleanup(() => {
            events.push(`cleanup:${snapshot}`)
          })
        })

        return 'ready'
      })

      untracked.value = 'b'
      tracked.value = 1

      expect(events).toEqual(['run:0:a', 'cleanup:0:a', 'run:0:b', 'cleanup:0:b', 'run:1:b'])
    })
  })

  it('re-runs only for explicitly listed signal dependencies', () => {
    withFakeNodeGlobal(() => {
      let tracked!: { value: number }
      let untracked!: { value: string }
      const values: string[] = []

      renderComponent(() => {
        tracked = useSignal(0)
        untracked = useSignal('a')

        useWatch(() => {
          values.push(untracked.value)
        }, [tracked])

        return 'ready'
      })

      untracked.value = 'b'
      tracked.value = 1

      expect(values).toEqual(['a', 'b'])
    })
  })

  it('runs cleanup before each local explicit-dependency rerun', () => {
    withFakeNodeGlobal(() => {
      let tracked!: { value: number }
      let untracked!: { value: string }
      const events: string[] = []

      renderComponent(() => {
        tracked = useSignal(0)
        untracked = useSignal('a')

        useWatch(() => {
          const snapshot = untracked.value
          events.push(`run:${snapshot}`)
          onCleanup(() => {
            events.push(`cleanup:${snapshot}`)
          })
        }, [tracked])

        return 'ready'
      })

      untracked.value = 'b'
      tracked.value = 1

      expect(events).toEqual(['run:a', 'cleanup:a', 'run:b'])
    })
  })

  it('accepts getter dependencies without auto-tracking callback reads', () => {
    withFakeNodeGlobal(() => {
      let tracked!: { value: number }
      let untracked!: { value: string }
      const values: string[] = []

      renderComponent(() => {
        tracked = useSignal(0)
        untracked = useSignal('a')

        useWatch(() => {
          values.push(untracked.value)
        }, [() => tracked.value])

        return 'ready'
      })

      untracked.value = 'b'
      tracked.value = 1

      expect(values).toEqual(['a', 'b'])
    })
  })
})
