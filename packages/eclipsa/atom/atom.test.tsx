import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { __eclipsaComponent } from '../core/internal.ts'
import {
  renderClientInsertable,
  type RuntimeContainer,
  withRuntimeContainer,
} from '../core/runtime.ts'
import { renderSSRStream } from '../core/ssr.ts'
import { atom, useAtom } from './mod.ts'

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
    actionStates: new Map(),
    actions: new Map(),
    asyncSignalSnapshotCache: new Map(),
    asyncSignalStates: new Map(),
    atoms: new WeakMap(),
    components: new Map(),
    dirty: new Set(),
    doc: new FakeDocument() as unknown as Document,
    id: 'rt-atom-test',
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

describe('atom', () => {
  it('shares atom state across components in the same container', () => {
    withFakeNodeGlobal(() => {
      const countAtom = atom(0)
      let first!: { value: number }
      let second!: { value: number }

      const First = __eclipsaComponent(() => {
        first = useAtom(countAtom)
        return 'first'
      }, 'component-atom-first', () => [])
      const Second = __eclipsaComponent(() => {
        second = useAtom(countAtom)
        return 'second'
      }, 'component-atom-second', () => [])

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
      let first!: { value: number }
      let second!: { value: number }

      const First = __eclipsaComponent(() => {
        first = useAtom(countAtom)
        return 'first'
      }, 'component-atom-first-isolated', () => [])
      const Second = __eclipsaComponent(() => {
        second = useAtom(countAtom)
        return 'second'
      }, 'component-atom-second-isolated', () => [])

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
    const App = __eclipsaComponent(() => {
      const count = useAtom(countAtom)
      return jsxDEV('div', {
        children: count.value,
      }, null, false, {})
    }, 'component-atom-stream', () => [])

    const { payload } = await renderSSRStream(() => jsxDEV(App, {}, null, false, {}))

    expect(payload.signals).toEqual({ a0: 0 })
    expect(
      Object.values(payload.components).some((component) => component.signalIds.includes('a0')),
    ).toBe(true)
  })
})
