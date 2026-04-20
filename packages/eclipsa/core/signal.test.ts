import { describe, expect, it } from 'vitest'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { Dynamic } from './dynamic.ts'
import { __eclipsaComponent } from './internal.ts'
import { effect, onCleanup, signal, useComputed, useSignal, useWatch } from './signal.ts'
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
    asyncSignalSnapshotCache: new Map(),
    asyncSignalStates: new Map(),
    atoms: new WeakMap(),
    components: new Map(),
    dirty: new Set(),
    dirtyFlushQueued: false,
    doc: new FakeDocument() as unknown as Document,
    eventDispatchPromise: null,
    imports: new Map(),
    interactivePrefetchCheckQueued: false,
    loaderStates: new Map(),
    loaders: new Map(),
    id: 'rt-test',
    nextAtomId: 0,
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
    pendingSuspensePromises: new Set(),
    resumeReadyPromise: null,
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

describe('signal', () => {
  it('does not re-run effects for equal primitive values or the same object reference', () => {
    const count = signal(1)
    const initialObject = { label: 'same' }
    const state = signal(initialObject)
    const values: string[] = []

    effect(() => {
      values.push(`${count.value}:${state.value === initialObject ? 'same' : 'new'}`)
    })

    count.value = 1
    state.value = initialObject
    state.value = { label: 'same' }
    count.value = 2

    expect(values).toEqual(['1:same', '1:new', '2:new'])
  })
})

describe('useWatch', () => {
  it('does not re-run for equal primitive values or the same object reference', () => {
    withFakeNodeGlobal(() => {
      let count!: { value: number }
      let state!: { value: { label: string } }
      const initialObject = { label: 'same' }
      const values: string[] = []

      renderComponent(() => {
        count = useSignal(1)
        state = useSignal(initialObject)

        useWatch(() => {
          values.push(`${count.value}:${state.value === initialObject ? 'same' : 'new'}`)
        })

        return 'ready'
      })

      count.value = 1
      state.value = initialObject
      state.value = { label: 'same' }
      count.value = 2

      expect(values).toEqual(['1:same', '1:new', '2:new'])
    })
  })

  it('reacts to signal changes read through managed component prop getters', () => {
    withFakeNodeGlobal(() => {
      let visible!: { value: boolean }
      const values: number[] = []

      const Child = __eclipsaComponent(
        (props: { animate: { opacity: number } }) => {
          useWatch(() => {
            values.push(props.animate.opacity)
          }, [() => props.animate])

          return 'ready'
        },
        'component-prop-watch-child',
        () => [],
      )

      const App = __eclipsaComponent(
        () => {
          visible = useSignal(true)

          return jsxDEV(
            Child as never,
            {
              get animate() {
                return visible.value ? { opacity: 1 } : { opacity: 0 }
              },
            },
            null,
            false,
            {},
          )
        },
        'component-prop-watch-app',
        () => [],
      )

      const container = createContainer()
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container)
      })

      visible.value = false
      visible.value = true

      expect(values).toEqual([1, 0, 1])
    })
  })

  it('skips component re-renders for optimized roots when local signals only drive watches', () => {
    withFakeNodeGlobal(() => {
      let trigger!: { value: number }
      let renderCount = 0
      const watchValues: number[] = []

      const App = __eclipsaComponent(
        () => {
          renderCount += 1
          trigger = useSignal(0)

          useWatch(() => {
            watchValues.push(trigger.value)
          })

          return 'ready'
        },
        'component-optimized-root-watch-only',
        () => [],
        undefined,
        {
          optimizedRoot: true,
        },
      )

      const container = createContainer()
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container)
      })

      trigger.value = 1

      expect(renderCount).toBe(1)
      expect(watchValues).toEqual([0, 1])
    })
  })

  it('preserves getter props through non-managed wrapper components on the client', () => {
    withFakeNodeGlobal(() => {
      let visible!: { value: boolean }
      const values: number[] = []

      const Child = __eclipsaComponent(
        (props: { animate: { opacity: number } }) => {
          useWatch(() => {
            values.push(props.animate.opacity)
          }, [() => props.animate])

          return 'ready'
        },
        'component-prop-watch-wrapper-child',
        () => [],
      )

      const Wrapper = (props: { animate: { opacity: number } }) =>
        jsxDEV(Child as never, props, null, false, {})

      const App = __eclipsaComponent(
        () => {
          visible = useSignal(true)

          return jsxDEV(
            Wrapper as never,
            {
              get animate() {
                return visible.value ? { opacity: 1 } : { opacity: 0 }
              },
            },
            null,
            false,
            {},
          )
        },
        'component-prop-watch-wrapper-app',
        () => [],
      )

      const container = createContainer()
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container)
      })

      visible.value = false
      visible.value = true

      expect(values).toEqual([1, 0, 1])
    })
  })

  it('preserves getter props through Dynamic on the client', () => {
    withFakeNodeGlobal(() => {
      let visible!: { value: boolean }
      const values: number[] = []

      const Child = __eclipsaComponent(
        (props: { animate: { opacity: number } }) => {
          useWatch(() => {
            values.push(props.animate.opacity)
          }, [() => props.animate])

          return 'ready'
        },
        'component-prop-watch-dynamic-child',
        () => [],
      )

      const App = __eclipsaComponent(
        () => {
          visible = useSignal(true)

          return jsxDEV(
            Dynamic as never,
            {
              component: Child,
              get animate() {
                return visible.value ? { opacity: 1 } : { opacity: 0 }
              },
            },
            null,
            false,
            {},
          )
        },
        'component-prop-watch-dynamic-app',
        () => [],
      )

      const container = createContainer()
      withRuntimeContainer(container, () => {
        renderClientInsertable(jsxDEV(App, {}, null, false, {}), container)
      })

      visible.value = false
      visible.value = true

      expect(values).toEqual([1, 0, 1])
    })
  })

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

describe('useComputed', () => {
  it('auto-tracks callback reads when dependencies are omitted', () => {
    withFakeNodeGlobal(() => {
      let tracked!: { value: number }
      let untracked!: { value: string }
      let computed!: { value: string }
      const values: string[] = []

      renderComponent(() => {
        tracked = useSignal(0)
        untracked = useSignal('a')
        computed = useComputed(() => {
          const snapshot = `${tracked.value}:${untracked.value}`
          values.push(snapshot)
          return snapshot
        })

        return 'ready'
      })

      untracked.value = 'b'
      tracked.value = 1

      expect(values).toEqual(['0:a', '0:b', '1:b'])
      expect(computed.value).toBe('1:b')
    })
  })

  it('re-runs only for explicitly listed signal dependencies', () => {
    withFakeNodeGlobal(() => {
      let tracked!: { value: number }
      let untracked!: { value: string }
      let computed!: { value: string }
      const values: string[] = []

      renderComponent(() => {
        tracked = useSignal(0)
        untracked = useSignal('a')
        computed = useComputed(() => {
          const snapshot = `${tracked.value}:${untracked.value}`
          values.push(snapshot)
          return snapshot
        }, [tracked])

        return 'ready'
      })

      untracked.value = 'b'
      tracked.value = 1

      expect(values).toEqual(['0:a', '1:b'])
      expect(computed.value).toBe('1:b')
    })
  })

  it('accepts getter dependencies without auto-tracking callback reads', () => {
    withFakeNodeGlobal(() => {
      let tracked!: { value: number }
      let untracked!: { value: string }
      let computed!: { value: string }
      const values: string[] = []

      renderComponent(() => {
        tracked = useSignal(0)
        untracked = useSignal('a')
        computed = useComputed(() => {
          const snapshot = `${tracked.value}:${untracked.value}`
          values.push(snapshot)
          return snapshot
        }, [() => tracked.value])

        return 'ready'
      })

      untracked.value = 'b'
      tracked.value = 1

      expect(values).toEqual(['0:a', '1:b'])
      expect(computed.value).toBe('1:b')
    })
  })
})
