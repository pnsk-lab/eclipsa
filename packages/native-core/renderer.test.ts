import { createContext, useContext } from './context.ts'
import { createNativeRoot, type NativeRendererAbi } from './renderer.ts'
import { createElement as h } from './component.ts'
import { createRouteElement } from 'eclipsa/internal'
import { describe, expect, it } from 'vitest'

interface MockNode {
  children: MockNode[]
  events: Map<string, () => void>
  props: Record<string, unknown>
  text: string | null
  type: string
}

const createMockNode = (type: string, text: string | null = null): MockNode => ({
  children: [],
  events: new Map(),
  props: {},
  text,
  type,
})

const insertChild = (parent: MockNode, child: MockNode, before?: MockNode | null) => {
  const currentIndex = parent.children.indexOf(child)
  if (currentIndex >= 0) {
    parent.children.splice(currentIndex, 1)
  }
  const index = before ? parent.children.indexOf(before) : -1
  if (index >= 0) {
    parent.children.splice(index, 0, child)
    return
  }
  parent.children.push(child)
}

const createRenderer = (): {
  container: MockNode
  renderer: NativeRendererAbi<MockNode, MockNode, () => void>
} => {
  const container = createMockNode('root')
  return {
    container,
    renderer: {
      createElement(type) {
        return createMockNode(type)
      },
      createText(value) {
        return createMockNode('#text', value)
      },
      insert(parent, child, before) {
        insertChild(parent, child, before)
      },
      remove(parent, child) {
        const index = parent.children.indexOf(child)
        if (index >= 0) {
          parent.children.splice(index, 1)
        }
      },
      reorder(parent, child, before) {
        insertChild(parent, child, before)
      },
      removeProp(node, key) {
        delete node.props[key]
      },
      setProp(node, key, value) {
        node.props[key] = value
      },
      setText(node, value) {
        node.text = value
      },
      subscribe(node, eventName, listener) {
        node.events.set(eventName, listener)
        return () => {
          node.events.delete(eventName)
        }
      },
      unsubscribe(_node, _eventName, subscription) {
        subscription()
      },
    },
  }
}

describe('native-core renderer', () => {
  it('mounts, updates, and unmounts native trees with prop and event diffs', () => {
    const { container, renderer } = createRenderer()
    const root = createNativeRoot(renderer, container)
    const events: string[] = []

    root.update(
      h(
        'VStack',
        { spacing: 8 },
        h('Text', { value: 'hello' }),
        h(
          'Button',
          {
            onPress: () => {
              events.push('press')
            },
            role: 'primary',
          },
          'Tap',
        ),
      ),
    )

    expect(container.children[0]?.type).toBe('VStack')
    expect(container.children[0]?.children[1]?.events.has('press')).toBe(true)

    container.children[0]?.children[1]?.events.get('press')?.()
    expect(events).toEqual(['press'])

    root.update(
      h(
        'VStack',
        { spacing: 12 },
        h('Button', { key: 'cta', role: 'secondary' }, 'Tap'),
        h('Text', { key: 'label', value: 'updated' }),
      ),
    )

    expect(container.children[0]?.props.spacing).toBe(12)
    expect(container.children[0]?.children.map((child) => child.type)).toEqual(['Button', 'Text'])
    expect(container.children[0]?.children[0]?.events.size).toBe(0)

    root.unmount()

    expect(container.children).toEqual([])
  })

  it('renders component trees through provider-aware contexts', () => {
    const { container, renderer } = createRenderer()
    const root = createNativeRoot(renderer, container)
    const ThemeContext = createContext('fallback')

    const Label = () => h('Text', { value: useContext(ThemeContext) })

    root.update(h(ThemeContext.Provider, { value: 'swiftui' }, h(Label, {})))

    expect(container.children[0]?.props.value).toBe('swiftui')
  })

  it('resolves route slots inside native component children', () => {
    const { container, renderer } = createRenderer()
    const root = createNativeRoot(renderer, container)
    const Layout = ({ children }: { children?: unknown }) => h('Stack', null, children as never)
    const Page = () => h('Text', { value: 'page' })

    root.update(
      createRouteElement({
        error: undefined,
        layouts: [{ renderer: Layout }],
        page: { renderer: Page },
        params: {},
        pathname: '/native',
      } as never) as never,
    )

    expect(container.children[0]?.type).toBe('Stack')
    expect(container.children[0]?.children[0]?.type).toBe('Text')
    expect(container.children[0]?.children[0]?.props.value).toBe('page')
  })
})
