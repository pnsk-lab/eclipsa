/** @jsxImportSource @eclipsa/native */

import * as native from './mod.ts'
import {
  createElement,
  bootNativeApplication,
  defineNativeComponent,
  getNativeRuntime,
  getNativeMap,
  peekNativeRuntime,
  setNativeMap,
} from './mod.ts'
import { useSignal } from 'eclipsa'
import { createRouteElement } from 'eclipsa/internal'
import { afterEach, describe, expect, it } from 'vitest'

interface MockNode {
  children: MockNode[]
  id: string
  props: Record<string, unknown>
  tag: string
  text: string | null
}

const createMockNode = (id: string, tag: string, text: string | null = null): MockNode => ({
  children: [],
  id,
  props: {},
  tag,
  text,
})

const insertChild = (parent: MockNode, child: MockNode, beforeID?: string | null) => {
  parent.children = parent.children.filter((candidate) => candidate.id !== child.id)
  if (beforeID) {
    const nextIndex = parent.children.findIndex((candidate) => candidate.id === beforeID)
    if (nextIndex >= 0) {
      parent.children.splice(nextIndex, 0, child)
      return
    }
  }
  parent.children.push(child)
}

const createMockBridge = () => {
  let nextID = 0
  const publishedRootIDs: string[] = []
  const handlers = new Map<string, (payload?: unknown) => unknown>()
  const nodes = new Map<string, MockNode>()
  return {
    bridge: {
      events: {
        on(nodeID: string, eventName: string, listener: (payload?: unknown) => unknown) {
          handlers.set(`${nodeID}:${eventName}`, listener)
        },
      },
      renderer: {
        createElement(type: string) {
          const node = createMockNode(`node-${++nextID}`, type)
          nodes.set(node.id, node)
          return node.id
        },
        createText(value: string) {
          const node = createMockNode(`node-${++nextID}`, '#text', value)
          nodes.set(node.id, node)
          return node.id
        },
        insert(parentID: string, childID: string, beforeID?: string | null) {
          insertChild(nodes.get(parentID)!, nodes.get(childID)!, beforeID)
        },
        publish(rootID: string) {
          publishedRootIDs.push(rootID)
        },
        remove(parentID: string, childID: string) {
          const parent = nodes.get(parentID)!
          parent.children = parent.children.filter((candidate) => candidate.id !== childID)
        },
        removeProp(nodeID: string, key: string) {
          delete nodes.get(nodeID)!.props[key]
        },
        reorder(parentID: string, childID: string, beforeID?: string | null) {
          insertChild(nodes.get(parentID)!, nodes.get(childID)!, beforeID)
        },
        setProp(nodeID: string, key: string, value: unknown) {
          nodes.get(nodeID)!.props[key] = value
        },
        setText(nodeID: string, value: string) {
          nodes.get(nodeID)!.text = value
        },
      },
    },
    getNode(id: string) {
      return nodes.get(id)
    },
    publishedRootIDs,
    trigger(nodeID: string, eventName: string, payload?: unknown) {
      return handlers.get(`${nodeID}:${eventName}`)?.(payload)
    },
  }
}

describe('@eclipsa/native runtime', () => {
  afterEach(() => {
    setNativeMap({})
  })

  it('rerenders imported native components with useSignal state', () => {
    const mock = createMockBridge()
    const Button = defineNativeComponent<{
      onPress?: () => void
      title?: string
    }>('swiftui:button')
    const Text = defineNativeComponent<{ value: string }>('swiftui:text')
    const VStack = defineNativeComponent<{ children?: unknown }>('swiftui:vstack')
    const WindowGroup = defineNativeComponent<{ children?: unknown }>('swiftui:window-group')

    const App = () => {
      const count = useSignal(0)

      return (
        <WindowGroup>
          <VStack>
            <Text value={`count ${count.value}`} />
            <Button
              onPress={() => {
                count.value += 1
              }}
              title={`Count ${count.value}`}
            />
          </VStack>
        </WindowGroup>
      )
    }

    const mounted = bootNativeApplication(App, mock.bridge)

    const rootID = mock.publishedRootIDs.at(-1)!
    const rootNode = mock.getNode(rootID)!
    expect(rootNode.tag).toBe('swiftui:window-group')

    const stackNode = mock.getNode(rootNode.children[0]!.id)!
    const buttonNode = mock.getNode(stackNode.children[1]!.id)!
    expect(buttonNode.tag).toBe('swiftui:button')
    expect(buttonNode.props.title).toBe('Count 0')

    mock.trigger(buttonNode.id, 'press')

    expect(buttonNode.props.title).toBe('Count 1')
    const labelNode = mock.getNode(stackNode.children[0]!.id)!
    expect(labelNode.props.value).toBe('count 1')

    mounted.unmount()
  })

  it('does not re-export standalone signal helpers', () => {
    expect('signal' in native).toBe(false)
  })

  it('supports imported component wrappers around concrete native tags', () => {
    const mock = createMockBridge()
    const Label = defineNativeComponent<{ value: string }>('swiftui:text')
    const Stack = defineNativeComponent<{ children?: unknown }>('swiftui:vstack')
    const Window = defineNativeComponent<{ children?: unknown }>('swiftui:window-group')

    const App = () => (
      <Window>
        <Stack>
          <Label value="wrapped" />
        </Stack>
      </Window>
    )

    bootNativeApplication(App, mock.bridge)

    const rootNode = mock.getNode(mock.publishedRootIDs.at(-1)!)!
    const stackNode = mock.getNode(rootNode.children[0]!.id)!
    const labelNode = mock.getNode(stackNode.children[0]!.id)!

    expect(rootNode.tag).toBe('swiftui:window-group')
    expect(stackNode.tag).toBe('swiftui:vstack')
    expect(labelNode.tag).toBe('swiftui:text')
    expect(labelNode.props.value).toBe('wrapped')
  })

  it('resolves lowercase JSX tags through the native map', () => {
    const mock = createMockBridge()
    const Text = defineNativeComponent<{ value: string }>('swiftui:text')
    const VStack = defineNativeComponent<{ children?: unknown }>('swiftui:vstack')
    const WindowGroup = defineNativeComponent<{ children?: unknown }>('swiftui:window-group')

    setNativeMap({
      div: VStack,
      span: Text,
      windowGroup: WindowGroup,
    })

    const App = () => (
      <windowGroup>
        <div>
          <span value="mapped" />
        </div>
      </windowGroup>
    )

    bootNativeApplication(App, mock.bridge)

    const rootNode = mock.getNode(mock.publishedRootIDs.at(-1)!)!
    const stackNode = mock.getNode(rootNode.children[0]!.id)!
    const labelNode = mock.getNode(stackNode.children[0]!.id)!

    expect(rootNode.tag).toBe('swiftui:window-group')
    expect(stackNode.tag).toBe('swiftui:vstack')
    expect(labelNode.tag).toBe('swiftui:text')
    expect(labelNode.props.value).toBe('mapped')
  })

  it('exposes the public native runtime bridge helpers', () => {
    const mock = createMockBridge()

    expect(peekNativeRuntime()).toBeNull()
    expect(() => getNativeRuntime()).toThrowError(
      'Native runtime is unavailable on globalThis.__eclipsaNative. This API can only be used while running inside a native host.',
    )

    expect(peekNativeRuntime(mock.bridge)).toBe(mock.bridge)
    expect(getNativeRuntime(mock.bridge).renderer.createElement('swiftui:text')).toMatch(/^node-/)
  })

  it('stores native map updates from plain objects and module-shaped inputs', () => {
    const Text = defineNativeComponent<{ value: string }>('swiftui:text')
    const VStack = defineNativeComponent<{ children?: unknown }>('swiftui:vstack')

    expect(setNativeMap({ div: VStack })).toEqual({ div: VStack })
    expect(getNativeMap()).toEqual({ div: VStack })

    setNativeMap({
      default: {
        div: VStack,
      },
      span: Text,
    })

    expect(getNativeMap()).toEqual({
      div: VStack,
      span: Text,
    })

    const element = createElement('div', {
      children: createElement('span', { value: 'mapped child' }),
    }) as {
      props: {
        children: {
          props: {
            value: string
          }
          type: string
        }
      }
      type: string
    }
    expect(element.type).toBe('swiftui:vstack')
    expect(element.props.children.type).toBe('swiftui:text')
    expect(element.props.children.props.value).toBe('mapped child')
  })

  it('rerenders and replaces the mounted application input without remounting the host bridge', () => {
    const mock = createMockBridge()
    const Text = defineNativeComponent<{ value: string }>('swiftui:text')
    const VStack = defineNativeComponent<{ children?: unknown }>('swiftui:vstack')
    const WindowGroup = defineNativeComponent<{ children?: unknown }>('swiftui:window-group')
    let title = 'before'

    const App = () => (
      <WindowGroup>
        <VStack>
          <Text value={title} />
        </VStack>
      </WindowGroup>
    )

    const mounted = bootNativeApplication(App, mock.bridge)
    const readLabelValue = () => {
      const rootNode = mock.getNode(mock.publishedRootIDs.at(-1)!)!
      const stackNode = mock.getNode(rootNode.children[0]!.id)!
      const labelNode = mock.getNode(stackNode.children[0]!.id)!
      return labelNode.props.value
    }

    expect(readLabelValue()).toBe('before')

    title = 'after rerender'
    mounted.rerender()
    expect(readLabelValue()).toBe('after rerender')

    const ReplacedApp = () => (
      <WindowGroup>
        <VStack>
          <Text value="after replace" />
        </VStack>
      </WindowGroup>
    )

    mounted.replace(ReplacedApp)
    expect(readLabelValue()).toBe('after replace')
  })

  it('renders layout and page composition through shared route slots', () => {
    const mock = createMockBridge()
    const Text = defineNativeComponent<{ value: string }>('swiftui:text')
    const VStack = defineNativeComponent<{ children?: unknown }>('swiftui:vstack')
    const WindowGroup = defineNativeComponent<{ children?: unknown }>('swiftui:window-group')

    const Layout = (props: { children?: unknown }) => <WindowGroup>{props.children}</WindowGroup>
    const Page = () => (
      <VStack>
        <Text value="route ok" />
      </VStack>
    )

    const App = () =>
      createRouteElement({
        error: null,
        layouts: [
          {
            metadata: null,
            renderer: Layout,
            symbol: null,
            url: '/app/+layout.tsx',
          },
        ],
        page: {
          metadata: null,
          renderer: Page,
          symbol: null,
          url: '/app/+page.tsx',
        },
        params: {},
        pathname: '/',
        render: Page,
      } as never)

    const mounted = bootNativeApplication(App as never, mock.bridge)
    const rootNode = mock.getNode(mock.publishedRootIDs.at(-1)!)!
    expect(rootNode.tag).toBe('swiftui:window-group')

    const stackNode = mock.getNode(rootNode.children[0]!.id)!
    expect(stackNode.tag).toBe('swiftui:vstack')

    const labelNode = mock.getNode(stackNode.children[0]!.id)!
    expect(labelNode.props.value).toBe('route ok')

    mounted.unmount()
  })
})
