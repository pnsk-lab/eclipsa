import {
  createElement,
  Fragment,
  isNativeComponentDescriptor,
  toChildArray,
  resolveNativeComponentDescriptor,
  type NativeChild,
  type NativeComponent,
  type NativeElement,
  type NativeElementType,
  type NativeKey,
} from './component.ts'
import {
  type ContextProviderProps,
  createChildRenderContext,
  enterRenderContext,
  getContextProviderMeta,
  getCurrentRenderContext,
} from './context.ts'
import { isRouteSlot, resolveRouteSlot } from 'eclipsa/internal'

export type NativeEventHandler = (payload?: unknown) => unknown

export interface NativeRendererAbi<TNode = unknown, TContainer = unknown, TSubscription = unknown> {
  createElement(type: string): TNode
  createText(value: string): TNode
  insert(parent: TContainer | TNode, child: TNode, before?: TNode | null): void
  remove(parent: TContainer | TNode, child: TNode): void
  reorder(parent: TContainer | TNode, child: TNode, before?: TNode | null): void
  removeProp(node: TNode, key: string): void
  setProp(node: TNode, key: string, value: unknown): void
  setText(node: TNode, value: string): void
  subscribe(node: TNode, eventName: string, listener: NativeEventHandler): TSubscription
  unsubscribe(node: TNode, eventName: string, subscription: TSubscription): void
}

export interface NativeRoot {
  update(nextTree: NativeChild): void
  unmount(): void
}

export interface NativeRootOptions {
  createComponentState?: () => unknown
  disposeComponentState?: (state: unknown) => void
  renderComponent?: <T>(state: unknown, render: () => T) => T
}

type RenderParent<TNode, TContainer> = TContainer | TNode

type Instance<TNode, TContainer, TSubscription> =
  | ComponentInstance<TNode, TContainer, TSubscription>
  | ElementInstance<TNode, TContainer, TSubscription>
  | FragmentInstance<TNode, TContainer, TSubscription>
  | TextInstance<TNode>

interface TextInstance<TNode> {
  handle: TNode
  kind: 'text'
  mounted: boolean
  value: string
}

interface ElementInstance<TNode, TContainer, TSubscription> {
  children: Array<Instance<TNode, TContainer, TSubscription>>
  eventSubscriptions: Map<string, TSubscription>
  handle: TNode
  key?: NativeKey
  kind: 'element'
  mounted: boolean
  props: Record<string, unknown>
  type: string
}

interface FragmentInstance<TNode, TContainer, TSubscription> {
  children: Array<Instance<TNode, TContainer, TSubscription>>
  key?: NativeKey
  kind: 'fragment'
}

interface ComponentInstance<TNode, TContainer, TSubscription> {
  child: Instance<TNode, TContainer, TSubscription> | null
  key?: NativeKey
  kind: 'component'
  props: Record<string, unknown>
  state?: unknown
  type: NativeComponent<Record<string, unknown>>
}

const isTextLike = (value: NativeChild): value is bigint | number | string =>
  typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string'

const textValue = (value: bigint | number | string) => String(value)

const isEventProp = (key: string, value: unknown): value is NativeEventHandler =>
  key.startsWith('on') && key.length > 2 && typeof value === 'function'

const toEventName = (key: string) => `${key[2]!.toLowerCase()}${key.slice(3)}`

const resolveRenderableChild = (value: NativeChild | unknown): NativeChild | unknown =>
  isRouteSlot(value) ? resolveRouteSlot(null, value) : value

const normalizeRenderableChildren = (value: NativeChild | unknown) =>
  toChildArray(resolveRenderableChild(value) as NativeChild)
    .flatMap((child) => toChildArray(resolveRenderableChild(child) as NativeChild))
    .map((child) => (isTextLike(child) ? textValue(child) : child)) as Array<NativeElement | string>

const createFragmentElement = (children: Array<NativeElement | string>) =>
  createElement(Fragment, null, ...children)

const resolveRenderableType = <P extends object>(
  type: NativeElementType<P>,
): NativeElementType<P> =>
  isNativeComponentDescriptor(type)
    ? resolveRenderableType(resolveNativeComponentDescriptor(type))
    : type

const getInstanceKey = <TNode, TContainer, TSubscription>(
  instance: Instance<TNode, TContainer, TSubscription>,
) => ('key' in instance ? instance.key : undefined)

const firstHandle = <TNode, TContainer, TSubscription>(
  instance: Instance<TNode, TContainer, TSubscription> | null,
): TNode | null => {
  if (!instance) {
    return null
  }
  if (instance.kind === 'text' || instance.kind === 'element') {
    return instance.handle
  }
  if (instance.kind === 'component') {
    return firstHandle(instance.child)
  }
  for (const child of instance.children) {
    const handle = firstHandle(child)
    if (handle !== null) {
      return handle
    }
  }
  return null
}

const placeInstance = <TNode, TContainer, TSubscription>(
  renderer: NativeRendererAbi<TNode, TContainer, TSubscription>,
  parent: RenderParent<TNode, TContainer>,
  instance: Instance<TNode, TContainer, TSubscription> | null,
  anchor: TNode | null,
): TNode | null => {
  if (!instance) {
    return anchor
  }

  if (instance.kind === 'component') {
    return placeInstance(renderer, parent, instance.child, anchor)
  }

  if (instance.kind === 'fragment') {
    let nextAnchor = anchor
    for (let index = instance.children.length - 1; index >= 0; index -= 1) {
      nextAnchor = placeInstance(renderer, parent, instance.children[index]!, nextAnchor)
    }
    return firstHandle(instance) ?? anchor
  }

  if (instance.mounted) {
    renderer.reorder(parent, instance.handle, anchor)
  } else {
    renderer.insert(parent, instance.handle, anchor)
    instance.mounted = true
  }
  return instance.handle
}

const removeInstance = <TNode, TContainer, TSubscription>(
  renderer: NativeRendererAbi<TNode, TContainer, TSubscription>,
  parent: RenderParent<TNode, TContainer>,
  instance: Instance<TNode, TContainer, TSubscription> | null,
  options?: NativeRootOptions,
) => {
  if (!instance) {
    return
  }

  if (instance.kind === 'component') {
    removeInstance(renderer, parent, instance.child, options)
    instance.child = null
    if (instance.state !== undefined) {
      options?.disposeComponentState?.(instance.state)
      instance.state = undefined
    }
    return
  }

  if (instance.kind === 'fragment') {
    for (const child of instance.children) {
      removeInstance(renderer, parent, child, options)
    }
    instance.children = []
    return
  }

  if (instance.kind === 'element') {
    for (const [eventName, subscription] of instance.eventSubscriptions) {
      renderer.unsubscribe(instance.handle, eventName, subscription)
    }
    instance.eventSubscriptions.clear()
    for (const child of instance.children) {
      removeInstance(renderer, instance.handle, child, options)
    }
    instance.children = []
  }

  if (instance.mounted) {
    renderer.remove(parent, instance.handle)
    instance.mounted = false
  }
}

const sameRenderableType = <TNode, TContainer, TSubscription>(
  current: Instance<TNode, TContainer, TSubscription> | null,
  next: NativeElement | string,
) => {
  if (!current) {
    return false
  }
  if (typeof next === 'string') {
    return current.kind === 'text'
  }
  const nextType = resolveRenderableType(next.type)
  if (nextType === Fragment) {
    return current.kind === 'fragment'
  }
  if (typeof nextType === 'function') {
    return current.kind === 'component' && current.type === nextType
  }
  return current.kind === 'element' && current.type === nextType
}

const updateElementProps = <TNode, TContainer, TSubscription>(
  renderer: NativeRendererAbi<TNode, TContainer, TSubscription>,
  instance: ElementInstance<TNode, TContainer, TSubscription>,
  nextProps: Record<string, unknown>,
) => {
  const previousProps = instance.props
  const keys = new Set([...Object.keys(previousProps), ...Object.keys(nextProps)])

  for (const key of keys) {
    if (key === 'children') {
      continue
    }
    const previousValue = previousProps[key]
    const nextValue = nextProps[key]
    if (isEventProp(key, previousValue)) {
      const eventName = toEventName(key)
      const currentSubscription = instance.eventSubscriptions.get(eventName)
      if (currentSubscription !== undefined) {
        renderer.unsubscribe(instance.handle, eventName, currentSubscription)
        instance.eventSubscriptions.delete(eventName)
      }
    } else if (previousValue !== undefined && !(key in nextProps)) {
      renderer.removeProp(instance.handle, key)
    }

    if (isEventProp(key, nextValue)) {
      const eventName = toEventName(key)
      const subscription = renderer.subscribe(instance.handle, eventName, nextValue)
      instance.eventSubscriptions.set(eventName, subscription)
      continue
    }

    if (nextValue === undefined) {
      continue
    }
    if (!Object.is(previousValue, nextValue)) {
      renderer.setProp(instance.handle, key, nextValue)
    }
  }

  instance.props = nextProps
}

const reconcileChildren = <TNode, TContainer, TSubscription>(
  renderer: NativeRendererAbi<TNode, TContainer, TSubscription>,
  parent: RenderParent<TNode, TContainer>,
  currentChildren: Array<Instance<TNode, TContainer, TSubscription>>,
  nextChildren: Array<NativeElement | string>,
  options?: NativeRootOptions,
): Array<Instance<TNode, TContainer, TSubscription>> => {
  const keyedCurrent = new Map<NativeKey, Instance<TNode, TContainer, TSubscription>>()
  const unkeyedCurrent: Array<Instance<TNode, TContainer, TSubscription>> = []

  for (const child of currentChildren) {
    const key = getInstanceKey(child)
    if (key !== undefined) {
      keyedCurrent.set(key, child)
    } else {
      unkeyedCurrent.push(child)
    }
  }

  const nextInstances: Array<Instance<TNode, TContainer, TSubscription>> = []
  let unkeyedIndex = 0

  for (const child of nextChildren) {
    const nextKey = typeof child === 'string' ? undefined : child.key
    let current =
      nextKey !== undefined
        ? (keyedCurrent.get(nextKey) ?? null)
        : (unkeyedCurrent[unkeyedIndex] ?? null)
    if (nextKey !== undefined) {
      keyedCurrent.delete(nextKey)
    } else if (current) {
      unkeyedIndex += 1
    }
    if (current && !sameRenderableType(current, child)) {
      removeInstance(renderer, parent, current, options)
      current = null
    }
    const nextInstance = reconcileNode(renderer, parent, current, child, options)
    if (nextInstance) {
      nextInstances.push(nextInstance)
    }
  }

  for (const leftover of keyedCurrent.values()) {
    removeInstance(renderer, parent, leftover, options)
  }
  for (let index = unkeyedIndex; index < unkeyedCurrent.length; index += 1) {
    removeInstance(renderer, parent, unkeyedCurrent[index]!, options)
  }

  let anchor: TNode | null = null
  for (let index = nextInstances.length - 1; index >= 0; index -= 1) {
    anchor = placeInstance(renderer, parent, nextInstances[index]!, anchor)
  }

  return nextInstances
}

const reconcileNode = <TNode, TContainer, TSubscription>(
  renderer: NativeRendererAbi<TNode, TContainer, TSubscription>,
  parent: RenderParent<TNode, TContainer>,
  current: Instance<TNode, TContainer, TSubscription> | null,
  next: NativeElement | string,
  options?: NativeRootOptions,
): Instance<TNode, TContainer, TSubscription> | null => {
  if (typeof next === 'string') {
    if (current?.kind === 'text') {
      if (current.value !== next) {
        renderer.setText(current.handle, next)
        current.value = next
      }
      return current
    }
    const instance: TextInstance<TNode> = {
      handle: renderer.createText(next),
      kind: 'text',
      mounted: false,
      value: next,
    }
    return instance
  }

  const nextType = resolveRenderableType(next.type)

  if (nextType === Fragment) {
    const instance: FragmentInstance<TNode, TContainer, TSubscription> =
      current?.kind === 'fragment'
        ? current
        : {
            children: [],
            ...(next.key === undefined ? {} : { key: next.key }),
            kind: 'fragment',
          }
    instance.children = reconcileChildren(
      renderer,
      parent,
      instance.children,
      normalizeRenderableChildren(next.props.children),
      options,
    )
    return instance
  }

  if (typeof nextType === 'function') {
    const providerMeta = getContextProviderMeta(nextType)
    const renderFrame = providerMeta
      ? createChildRenderContext(
          providerMeta.token,
          (next.props as ContextProviderProps<unknown>).value,
          getCurrentRenderContext(),
        )
      : getCurrentRenderContext()

    const instance: ComponentInstance<TNode, TContainer, TSubscription> =
      current?.kind === 'component' && current.type === nextType
        ? current
        : {
            child: null,
            ...(next.key === undefined ? {} : { key: next.key }),
            kind: 'component',
            props: next.props,
            state: options?.createComponentState?.(),
            type: nextType as NativeComponent<Record<string, unknown>>,
          }
    instance.props = next.props

    const renderChild = () =>
      enterRenderContext(renderFrame, () => {
        const renderedChild = providerMeta
          ? next.props.children
          : (nextType as NativeComponent<Record<string, unknown>>)(next.props)
        const renderables = normalizeRenderableChildren(renderedChild)
        const normalized =
          renderables.length === 1 ? renderables[0]! : createFragmentElement(renderables)
        return normalized
          ? reconcileNode(renderer, parent, instance.child, normalized, options)
          : null
      })

    instance.child =
      instance.state !== undefined && options?.renderComponent
        ? options.renderComponent(instance.state, renderChild)
        : renderChild()
    return instance
  }

  const instance: ElementInstance<TNode, TContainer, TSubscription> =
    current?.kind === 'element' && current.type === nextType
      ? current
      : {
          children: [],
          eventSubscriptions: new Map(),
          handle: renderer.createElement(nextType as string),
          ...(next.key === undefined ? {} : { key: next.key }),
          kind: 'element',
          mounted: false,
          props: {},
          type: nextType as string,
        }

  updateElementProps(renderer, instance, next.props)
  instance.children = reconcileChildren(
    renderer,
    instance.handle,
    instance.children,
    normalizeRenderableChildren(next.props.children),
    options,
  )
  return instance
}

export const createNativeRoot = <TNode, TContainer, TSubscription>(
  renderer: NativeRendererAbi<TNode, TContainer, TSubscription>,
  container: TContainer,
  options?: NativeRootOptions,
): NativeRoot => {
  let current: Instance<TNode, TContainer, TSubscription> | null = null

  return {
    update(nextTree) {
      const normalizedChildren = normalizeRenderableChildren(nextTree)
      const normalized =
        normalizedChildren.length === 1
          ? normalizedChildren[0]!
          : createFragmentElement(normalizedChildren)
      current = reconcileNode(renderer, container, current, normalized, options)
      placeInstance(renderer, container, current, null)
    },
    unmount() {
      removeInstance(renderer, container, current, options)
      current = null
    },
  }
}
