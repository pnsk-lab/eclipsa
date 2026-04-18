import {
  createElement as createCoreElement,
  createNativeRoot,
  Fragment,
  NativeComponentType,
  isNativeComponentDescriptor,
  isNativeComponentType,
  resolveNativeComponentDescriptor,
  type NativeChild,
  type NativeComponent,
  type NativeElementType,
  type NativeEventHandler,
  type NativeKey,
  type NativeRendererAbi,
  type NativeRoot,
} from '@eclipsa/native-core'
import { effect } from 'eclipsa'
import {
  createDetachedRuntimeComponent,
  createDetachedRuntimeContainer,
  disposeDetachedRuntimeComponent,
  runDetachedRuntimeComponent,
  type ComponentState,
} from 'eclipsa/internal'

const ROOT_CONTAINER_KEY = Symbol('eclipsa.native.root-container')

type RootContainer = {
  [ROOT_CONTAINER_KEY]: true
}

interface NativeEventSubscription {
  active: boolean
}

export interface NativeRuntimeRenderer {
  createElement(type: string): string
  createText(value: string): string
  insert(parentID: string, childID: string, beforeID?: string | null): void
  publish(rootID: string): void
  remove(parentID: string, childID: string): void
  removeProp(nodeID: string, key: string): void
  reorder(parentID: string, childID: string, beforeID?: string | null): void
  setProp(nodeID: string, key: string, value: unknown): void
  setText(nodeID: string, value: string): void
}

export interface NativeRuntimeEvents {
  on(nodeID: string, eventName: string, listener: NativeEventHandler): void
}

export interface NativeRuntime {
  events: NativeRuntimeEvents
  renderer: NativeRuntimeRenderer
}

export interface MountedNativeApplication {
  root: NativeRoot
  rerender(): void
  replace(nextInput: NativeApplicationInput): void
  unmount(): void
  update(nextTree: NativeChild): void
}

export type NativeApplicationInput = NativeChild | NativeComponent<object>
export type DefinedNativeComponent<P extends object> = NativeComponent<
  P & { children?: NativeChild }
>
export type NativeMap = Record<string, NativeElementType<object>>
export type NativeMapModule =
  | NativeMap
  | {
      default?: NativeMap
      [key: string]: unknown
    }

let currentNativeMap: NativeMap = {}

const isRootContainer = (value: unknown): value is RootContainer =>
  !!value && typeof value === 'object' && ROOT_CONTAINER_KEY in value

const insertRootChild = (childIDs: string[], childID: string, beforeID?: string | null) => {
  const existingIndex = childIDs.indexOf(childID)
  if (existingIndex >= 0) {
    childIDs.splice(existingIndex, 1)
  }
  if (beforeID) {
    const nextIndex = childIDs.indexOf(beforeID)
    if (nextIndex >= 0) {
      childIDs.splice(nextIndex, 0, childID)
      return
    }
  }
  childIDs.push(childID)
}

const removeRootChild = (childIDs: string[], childID: string) => {
  const index = childIDs.indexOf(childID)
  if (index >= 0) {
    childIDs.splice(index, 1)
  }
}

export const defineNativeComponent = <P extends object>(
  type: NativeElementType<P>,
): DefinedNativeComponent<P> => {
  const component = ((props: P & { children?: NativeChild }) =>
    createElement(resolveNativeElementType(type), props)) as unknown as NativeComponent<
    P & { children?: NativeChild }
  > & {
    [NativeComponentType]: NativeElementType<P>
  }
  Object.defineProperty(component, NativeComponentType, {
    configurable: false,
    enumerable: false,
    value: type,
    writable: false,
  })
  return component
}

const isNativeMapValue = (value: unknown): value is NativeElementType<object> =>
  typeof value === 'function' ||
  typeof value === 'string' ||
  typeof value === 'symbol' ||
  isNativeComponentDescriptor(value)

const isNativeMapRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !isNativeMapValue(value)

const mergeNativeMapEntries = (target: NativeMap, source: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(source)) {
    if (key === '__esModule' || key === 'default' || !isNativeMapValue(value)) {
      continue
    }
    target[key] = value
  }
}

const toNativeMap = (input: NativeMapModule | null | undefined): NativeMap => {
  if (!input || typeof input !== 'object') {
    return {}
  }
  const nextMap: NativeMap = {}
  const defaultMap = 'default' in input ? input.default : undefined
  if (isNativeMapRecord(defaultMap)) {
    mergeNativeMapEntries(nextMap, defaultMap)
  }
  mergeNativeMapEntries(nextMap, input)
  return nextMap
}

export const getNativeMap = () => currentNativeMap

export const setNativeMap = (input: NativeMapModule | null | undefined) => {
  currentNativeMap = toNativeMap(input)
  return currentNativeMap
}

export const createElement = <P extends object>(
  type: NativeElementType<P>,
  props?: (P & { children?: NativeChild; key?: NativeKey }) | null,
  ...children: NativeChild[]
) => createCoreElement(resolveNativeElementType(type), props, ...children)

export const h = createElement

export const resolveNativeElementType = <P extends object>(
  type: NativeElementType<P>,
  seenAliases = new Set<string>(),
): NativeElementType<P> => {
  if (isNativeComponentDescriptor(type)) {
    return resolveNativeElementType(resolveNativeComponentDescriptor(type), seenAliases)
  }
  if (typeof type === 'string') {
    const mappedType = currentNativeMap[type]
    if (!mappedType) {
      return type
    }
    if (seenAliases.has(type)) {
      throw new Error(`Circular native map alias detected for "${type}".`)
    }
    seenAliases.add(type)
    return resolveNativeElementType(mappedType as NativeElementType<P>, seenAliases)
  }
  return type
}

export const peekNativeRuntime = (
  input = (globalThis as Record<string, unknown>).__eclipsaNative,
): NativeRuntime | null => {
  if (!input || typeof input !== 'object') {
    return null
  }
  const runtime = input as Partial<NativeRuntime>
  if (!runtime.renderer || !runtime.events) {
    return null
  }
  return runtime as NativeRuntime
}

export const getNativeRuntime = (
  input = (globalThis as Record<string, unknown>).__eclipsaNative,
): NativeRuntime => {
  const runtime = peekNativeRuntime(input)
  if (runtime) {
    return runtime
  }
  throw new Error(
    'Native runtime is unavailable on globalThis.__eclipsaNative. This API can only be used while running inside a native host.',
  )
}

const createBridgeRenderer = (
  runtime: NativeRuntime,
  rootChildIDs: string[],
): NativeRendererAbi<string, RootContainer, NativeEventSubscription> => ({
  createElement(type) {
    return runtime.renderer.createElement(type)
  },
  createText(value) {
    return runtime.renderer.createText(value)
  },
  insert(parent, child, before) {
    if (isRootContainer(parent)) {
      insertRootChild(rootChildIDs, child, before)
      return
    }
    runtime.renderer.insert(parent, child, before ?? null)
  },
  remove(parent, child) {
    if (isRootContainer(parent)) {
      removeRootChild(rootChildIDs, child)
      return
    }
    runtime.renderer.remove(parent, child)
  },
  reorder(parent, child, before) {
    if (isRootContainer(parent)) {
      insertRootChild(rootChildIDs, child, before)
      return
    }
    runtime.renderer.reorder(parent, child, before ?? null)
  },
  removeProp(node, key) {
    runtime.renderer.removeProp(node, key)
  },
  setProp(node, key, value) {
    runtime.renderer.setProp(node, key, value)
  },
  setText(node, value) {
    runtime.renderer.setText(node, value)
  },
  subscribe(node, eventName, listener) {
    const subscription = { active: true }
    runtime.events.on(node, eventName, (payload) => {
      if (!subscription.active) {
        return
      }
      listener(payload)
    })
    return subscription
  },
  unsubscribe(_node, _eventName, subscription) {
    subscription.active = false
  },
})

const publishRoot = (runtime: NativeRuntime, rootChildIDs: string[]) => {
  if (rootChildIDs.length === 0) {
    return
  }
  if (rootChildIDs.length !== 1) {
    throw new Error('Native apps must render exactly one root element.')
  }
  runtime.renderer.publish(rootChildIDs[0]!)
}

const resolveApplicationTree = (input: NativeApplicationInput): NativeChild => {
  if (typeof input === 'function' && isNativeComponentType(input)) {
    return createElement(input as NativeComponent<object>, {})
  }
  return input
}

export const mountNativeApplication = (
  render: () => NativeChild,
  runtime = getNativeRuntime(),
): MountedNativeApplication => {
  const rootChildIDs: string[] = []
  const runtimeContainer = createDetachedRuntimeContainer()
  const container: RootContainer = {
    [ROOT_CONTAINER_KEY]: true,
  }
  const root = createNativeRoot(createBridgeRenderer(runtime, rootChildIDs), container, {
    createComponentState: () => createDetachedRuntimeComponent(runtimeContainer),
    disposeComponentState: (state) =>
      disposeDetachedRuntimeComponent(runtimeContainer, state as ComponentState),
    renderComponent: (state, run) =>
      runDetachedRuntimeComponent(runtimeContainer, state as ComponentState, run),
  })
  let currentRender = render
  const renderCurrentTree = () => {
    root.update(currentRender())
    publishRoot(runtime, rootChildIDs)
  }
  const stop = effect(() => {
    renderCurrentTree()
  })
  const rerender = () => {
    renderCurrentTree()
  }

  return {
    root,
    rerender,
    replace(nextInput) {
      currentRender = () => resolveApplicationTree(nextInput)
      rootChildIDs.splice(0, rootChildIDs.length)
      renderCurrentTree()
    },
    unmount() {
      stop()
      root.unmount()
    },
    update(nextTree) {
      root.update(nextTree)
      publishRoot(runtime, rootChildIDs)
    },
  }
}

export const bootNativeApplication = (
  input: NativeApplicationInput,
  runtime = getNativeRuntime(),
) => mountNativeApplication(() => resolveApplicationTree(input), runtime)

export { Fragment }
