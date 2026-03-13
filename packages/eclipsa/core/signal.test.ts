import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { component$ } from './component.ts'
import { __eclipsaComponent } from './internal.ts'
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
    components: new Map(),
    dirty: new Set(),
    doc: new FakeDocument() as unknown as Document,
    imports: new Map(),
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

const renderComponent = (render: () => string) => {
  const App = component$(
    __eclipsaComponent(
      render,
      'component-signal-test',
      () => [],
    ),
  )
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
