import type { JSX } from '../jsx/types.ts'
import { FRAGMENT } from '../jsx/shared.ts'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import type { ResumeHmrUpdatePayload } from './resume-hmr.ts'
import type { Component } from './component.ts'
import {
  getComponentMeta,
  getEventMeta,
  getLazyMeta,
  getNavigateMeta,
  getSignalMeta,
  getWatchMeta,
  setNavigateMeta,
  setSignalMeta,
  type EventDescriptor,
  type LazyMeta,
  type SignalMeta,
} from './internal.ts'
import {
  ROUTE_LINK_ATTR,
  ROUTE_REPLACE_ATTR,
  type Navigate,
  type NavigateOptions,
  type RouteManifest,
  type RouteModuleManifest,
} from './router-shared.ts'

const CONTAINER_STACK_KEY = Symbol.for('eclipsa.container-stack')
const FRAME_STACK_KEY = Symbol.for('eclipsa.frame-stack')
const DIRTY_FLUSH_PROMISE_KEY = Symbol.for('eclipsa.dirty-flush-promise')
const ROUTER_EVENT_STATE_KEY = Symbol.for('eclipsa.router-event-state')
const ROUTER_CURRENT_PATH_SIGNAL_ID = '$router:path'
const ROUTER_IS_NAVIGATING_SIGNAL_ID = '$router:isNavigating'
const ROUTER_LINK_BOUND_KEY = Symbol.for('eclipsa.router-link-bound')
const ROUTE_SLOT_ROUTE_KEY = Symbol.for('eclipsa.route-slot-route')
const RESUME_CONTAINERS_KEY = Symbol.for('eclipsa.resume-containers')
const ROOT_COMPONENT_ID = '$root'
const ROUTE_SLOT_TYPE = 'route-slot'

interface EncodedUndefined {
  __eclipsa_type: 'undefined'
}

export type EncodedValue =
  | EncodedUndefined
  | null
  | boolean
  | number
  | string
  | EncodedValue[]
  | {
      [key: string]: EncodedValue
    }

export interface ScopeSlot {
  kind: 'signal'
  id: string
}

export interface JSONScopeSlot {
  kind: 'json'
  value: EncodedValue
}

export interface SymbolScopeSlot {
  kind: 'symbol'
  id: string
  scope: string
}

export interface NavigateScopeSlot {
  kind: 'navigate'
}

export type ResumeScopeSlot = ScopeSlot | JSONScopeSlot | SymbolScopeSlot | NavigateScopeSlot

export interface ResumeComponentPayload {
  props: EncodedValue
  scope: string
  signalIds: string[]
  symbol: string
  watchCount: number
}

interface ResumeWatchPayload {
  componentId: string
  mode: WatchMode
  scope: string
  signals: string[]
  symbol: string
}

export interface ResumePayload {
  components: Record<string, ResumeComponentPayload>
  scopes: Record<string, ResumeScopeSlot[]>
  signals: Record<string, EncodedValue>
  subscriptions: Record<string, string[]>
  symbols: Record<string, string>
  watches: Record<string, ResumeWatchPayload>
}

interface SignalRecord<T = unknown> {
  effects: Set<ReactiveEffect>
  handle: {
    value: T
  }
  id: string
  subscribers: Set<string>
  value: T
}

interface ComponentState {
  active: boolean
  didMount: boolean
  end?: Comment
  id: string
  parentId: string | null
  props: unknown
  scopeId: string
  signalIds: string[]
  start?: Comment
  symbol: string
  watchCount: number
}

interface RenderFrame {
  childCursor: number
  component: ComponentState
  container: RuntimeContainer
  mountCallbacks: Array<() => void>
  visitedDescendants: Set<string>
  mode: 'client' | 'ssr'
  signalCursor: number
  watchCursor: number
}

interface RouterEventState {
  originalPreventDefault: () => void
  routerPrevented: boolean
  userPrevented: boolean
}

interface RouterState {
  currentPath: { value: string }
  currentRoute: LoadedRoute | null
  isNavigating: { value: boolean }
  loadedRoutes: Map<string, LoadedRoute>
  manifest: Map<string, RouteModuleManifest>
  navigate: Navigate
  sequence: number
}

export interface RuntimeContainer {
  components: Map<string, ComponentState>
  dirty: Set<string>
  doc?: Document
  imports: Map<string, Promise<RuntimeSymbolModule>>
  nextComponentId: number
  nextElementId: number
  nextScopeId: number
  nextSignalId: number
  rootChildCursor: number
  rootElement?: HTMLElement
  router: RouterState | null
  scopes: Map<string, ResumeScopeSlot[]>
  signals: Map<string, SignalRecord>
  symbols: Map<string, string>
  watches: Map<string, WatchState>
}

interface RuntimeSymbolModule {
  default: (scope: unknown[], propsOrArg?: unknown, ...args: unknown[]) => unknown
}

interface ReactiveEffect {
  fn: () => void
  signals: Set<SignalRecord>
}

type WatchDependency = { value: unknown } | (() => unknown)
type WatchMode = 'dynamic' | 'explicit'
type RouteRenderer = (props: unknown) => unknown

interface LoadedRouteModule {
  renderer: RouteRenderer
  symbol: string | null
  url: string
}

interface LoadedRoute {
  layouts: LoadedRouteModule[]
  pathname: string
  page: LoadedRouteModule
  render: RouteRenderer
}

interface RouteSlotValue {
  __eclipsa_type: typeof ROUTE_SLOT_TYPE
  pathname: string
  startLayoutIndex: number
}

interface RouteSlotCarrier extends RouteSlotValue {
  [ROUTE_SLOT_ROUTE_KEY]?: LoadedRoute
}

interface WatchState {
  componentId: string
  effect: ReactiveEffect
  id: string
  mode: WatchMode
  pending: Promise<void> | null
  run: (() => void) | null
  scopeId: string
  symbol: string
  track: (() => void) | null
}

interface PendingLinkNavigation {
  href: string
  replace: boolean
  state: RouterEventState
}

type NavigationMode = 'pop' | 'push' | 'replace'

type RenderObject = Extract<
  JSX.Element,
  {
    isStatic: boolean
    props: Record<string, unknown>
    type: JSX.Type
  }
>

const getContainerStack = (): RuntimeContainer[] => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[CONTAINER_STACK_KEY]
  if (Array.isArray(existing)) {
    return existing as RuntimeContainer[]
  }
  const created: RuntimeContainer[] = []
  globalRecord[CONTAINER_STACK_KEY] = created
  return created
}

const getFrameStack = (): RenderFrame[] => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[FRAME_STACK_KEY]
  if (Array.isArray(existing)) {
    return existing as RenderFrame[]
  }
  const created: RenderFrame[] = []
  globalRecord[FRAME_STACK_KEY] = created
  return created
}

const getResumeContainers = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[RESUME_CONTAINERS_KEY]
  if (existing instanceof Set) {
    return existing as Set<RuntimeContainer>
  }
  const created = new Set<RuntimeContainer>()
  globalRecord[RESUME_CONTAINERS_KEY] = created
  return created
}

const getCurrentContainer = (): RuntimeContainer | null => {
  const stack = getContainerStack()
  return stack.length > 0 ? stack[stack.length - 1] : null
}

const getCurrentFrame = (): RenderFrame | null => {
  const stack = getFrameStack()
  return stack.length > 0 ? stack[stack.length - 1] : null
}

const normalizeRoutePath = (pathname: string) => {
  const normalizedPath = pathname.trim() || '/'
  const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1)
  }
  return withLeadingSlash
}

let currentEffect: ReactiveEffect | null = null

const clearEffectSignals = (effect: ReactiveEffect) => {
  for (const signal of effect.signals) {
    signal.effects.delete(effect)
  }
  effect.signals.clear()
}

const collectTrackedDependencies = (effect: ReactiveEffect, fn: () => void) => {
  clearEffectSignals(effect)
  currentEffect = effect
  try {
    fn()
  } finally {
    currentEffect = null
  }
}

const trackWatchDependencies = (dependencies: WatchDependency[]) => {
  for (const dependency of dependencies) {
    if (typeof dependency === 'function') {
      dependency()
      continue
    }
    const signalMeta = getSignalMeta(dependency)
    if (!signalMeta) {
      throw new TypeError('useWatch dependencies must be signals or getter functions.')
    }
    dependency.value
  }
}

const createLocalWatchRunner =
  (effect: ReactiveEffect, fn: () => void, dependencies?: WatchDependency[]) => () => {
    if (!dependencies) {
      collectTrackedDependencies(effect, fn)
      return
    }
    collectTrackedDependencies(effect, () => {
      trackWatchDependencies(dependencies)
    })
    fn()
  }

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const encodeValue = (value: unknown): EncodedValue => {
  if (value === undefined) {
    return { __eclipsa_type: 'undefined' }
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Non-finite numbers cannot be serialized for resume.')
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((entry) => encodeValue(entry))
  }
  if (isPlainObject(value)) {
    const result: Record<string, EncodedValue> = {}
    for (const [key, entry] of Object.entries(value)) {
      result[key] = encodeValue(entry)
    }
    return result
  }
  throw new TypeError(`Unsupported resumable value: ${Object.prototype.toString.call(value)}`)
}

const decodeValue = (value: EncodedValue): unknown => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((entry) => decodeValue(entry))
  }
  if (isPlainObject(value) && value.__eclipsa_type === 'undefined') {
    return undefined
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      result[key] = decodeValue(entry)
    }
    return result
  }
  return value
}

const evaluateProps = (props: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(props))) {
    if (descriptor.get) {
      result[key] = descriptor.get.call(props)
    } else {
      result[key] = descriptor.value
    }
  }
  return result
}

const createContainer = (symbols: Record<string, string>, doc?: Document): RuntimeContainer => ({
  components: new Map(),
  dirty: new Set(),
  doc,
  imports: new Map(),
  nextComponentId: 0,
  nextElementId: 0,
  nextScopeId: 0,
  nextSignalId: 0,
  rootChildCursor: 0,
  rootElement: doc?.body,
  router: null,
  scopes: new Map(),
  signals: new Map(),
  symbols: new Map(Object.entries(symbols)),
  watches: new Map(),
})

export const registerResumeContainer = (container: RuntimeContainer) => {
  const containers = getResumeContainers()
  containers.add(container)
  return () => {
    containers.delete(container)
  }
}

const createSignalHandle = <T>(record: SignalRecord<T>, container: RuntimeContainer | null) => {
  const handle = {} as { value: T }
  Object.defineProperty(handle, 'value', {
    configurable: true,
    enumerable: true,
    get() {
      recordSignalRead(record)
      return record.value
    },
    set(value: T) {
      record.value = value
      notifySignalWrite(container, record)
    },
  })
  setSignalMeta(handle, {
    get: () => record.value,
    id: record.id,
    set: (value) => {
      record.value = value
      notifySignalWrite(container, record)
    },
  } satisfies SignalMeta<T>)
  return handle
}

const ensureSignalRecord = <T>(
  container: RuntimeContainer | null,
  id: string,
  initialValue: T,
): SignalRecord<T> => {
  if (!container) {
    const record = {
      effects: new Set<ReactiveEffect>(),
      handle: undefined as unknown as { value: T },
      id,
      subscribers: new Set<string>(),
      value: initialValue,
    } satisfies SignalRecord<T>
    record.handle = createSignalHandle(record, null)
    return record
  }
  const existing = container.signals.get(id)
  if (existing) {
    return existing as SignalRecord<T>
  }
  const record: SignalRecord<T> = {
    effects: new Set(),
    handle: undefined as unknown as { value: T },
    id,
    subscribers: new Set(),
    value: initialValue,
  }
  record.handle = createSignalHandle(record, container)
  container.signals.set(id, record as SignalRecord)
  return record
}

const isRouterSignalId = (id: string) =>
  id === ROUTER_CURRENT_PATH_SIGNAL_ID || id === ROUTER_IS_NAVIGATING_SIGNAL_ID

const createStandaloneNavigate = (): Navigate => {
  const navigate = (async (href: string, options?: NavigateOptions) => {
    if (typeof window === 'undefined') {
      return
    }
    const url = new URL(href, window.location.href)
    if (options?.replace) {
      window.location.replace(url.href)
      return
    }
    window.location.assign(url.href)
  }) as Navigate

  Object.defineProperty(navigate, 'isNavigating', {
    configurable: true,
    enumerable: true,
    get() {
      return false
    },
  })

  return setNavigateMeta(navigate)
}

const recordSignalRead = (record: SignalRecord) => {
  if (currentEffect) {
    currentEffect.signals.add(record)
    record.effects.add(currentEffect)
  }
  const frame = getCurrentFrame()
  if (!frame) {
    return
  }
  record.subscribers.add(frame.component.id)
}

const notifySignalWrite = (container: RuntimeContainer | null, record: SignalRecord) => {
  for (const effect of [...record.effects]) {
    effect.fn()
  }
  if (!container) {
    return
  }
  for (const componentId of record.subscribers) {
    const component = container.components.get(componentId)
    if (component?.active) {
      continue
    }
    container.dirty.add(componentId)
  }
}

const ensureRouterState = (container: RuntimeContainer, manifest?: RouteManifest) => {
  if (container.router) {
    if (manifest) {
      for (const [pathname, route] of Object.entries(manifest)) {
        container.router.manifest.set(normalizeRoutePath(pathname), route)
      }
    }
    return container.router
  }

  const currentPath = ensureSignalRecord(
    container,
    ROUTER_CURRENT_PATH_SIGNAL_ID,
    normalizeRoutePath(container.doc?.location.pathname ?? '/'),
  ).handle as { value: string }
  const isNavigating = ensureSignalRecord(container, ROUTER_IS_NAVIGATING_SIGNAL_ID, false)
    .handle as { value: boolean }

  const router: RouterState = {
    currentPath,
    currentRoute: null,
    isNavigating,
    loadedRoutes: new Map(),
    manifest: new Map(),
    navigate: undefined as unknown as Navigate,
    sequence: 0,
  }

  container.router = router
  router.navigate = setNavigateMeta((async (href: string, options?: NavigateOptions) => {
    await navigateContainer(container, href, {
      mode: options?.replace ? 'replace' : 'push',
    })
  }) as Navigate)

  Object.defineProperty(router.navigate, 'isNavigating', {
    configurable: true,
    enumerable: true,
    get() {
      return ensureRouterState(container).isNavigating.value
    },
  })

  if (manifest) {
    for (const [pathname, route] of Object.entries(manifest)) {
      router.manifest.set(normalizeRoutePath(pathname), route)
    }
  }

  return router
}

const pushContainer = <T>(container: RuntimeContainer, fn: () => T): T => {
  const stack = getContainerStack()
  stack.push(container)
  try {
    return fn()
  } finally {
    stack.pop()
  }
}

export const withRuntimeContainer = pushContainer

const pushFrame = <T>(frame: RenderFrame, fn: () => T): T => {
  const stack = getFrameStack()
  stack.push(frame)
  try {
    return fn()
  } finally {
    stack.pop()
  }
}

const allocateScopeId = (container: RuntimeContainer) => `sc${container.nextScopeId++}`

const serializeScopeValue = (container: RuntimeContainer, value: unknown): ResumeScopeSlot => {
  const signalMeta = getSignalMeta(value)
  if (signalMeta) {
    return {
      kind: 'signal',
      id: signalMeta.id,
    }
  }

  if (getNavigateMeta(value)) {
    return {
      kind: 'navigate',
    }
  }

  const lazyMeta = getLazyMeta(value)
  if (lazyMeta) {
    return {
      kind: 'symbol',
      id: lazyMeta.symbol,
      scope: registerScope(container, lazyMeta.captures()),
    }
  }

  return {
    kind: 'json',
    value: encodeValue(value),
  }
}

const registerScope = (container: RuntimeContainer, values: unknown[]): string => {
  const id = allocateScopeId(container)
  container.scopes.set(
    id,
    values.map((value) => serializeScopeValue(container, value)),
  )
  return id
}

const materializeSymbolReference = (
  container: RuntimeContainer,
  symbolId: string,
  scopeId: string,
) => {
  const fn = (...args: unknown[]) => {
    void loadSymbol(container, symbolId).then((module) =>
      module.default(materializeScope(container, scopeId), ...args),
    )
  }
  Object.defineProperty(fn, 'name', {
    configurable: true,
    value: `eclipsa$${symbolId}`,
  })
  return fn
}

const materializeScope = (container: RuntimeContainer, scopeId: string): unknown[] => {
  const slots = container.scopes.get(scopeId)
  if (!slots) {
    throw new Error(`Missing scope ${scopeId}.`)
  }
  return slots.map((slot) => {
    if (slot.kind === 'signal') {
      const record = container.signals.get(slot.id)
      if (!record) {
        throw new Error(`Missing signal ${slot.id}.`)
      }
      return record.handle
    }
    if (slot.kind === 'symbol') {
      return materializeSymbolReference(container, slot.id, slot.scope)
    }
    if (slot.kind === 'navigate') {
      return ensureRouterState(container).navigate
    }
    return decodeValue(slot.value)
  })
}

const createFrame = (
  container: RuntimeContainer,
  component: ComponentState,
  mode: RenderFrame['mode'],
): RenderFrame => ({
  childCursor: 0,
  component,
  container,
  mountCallbacks: [],
  mode,
  signalCursor: 0,
  visitedDescendants: new Set(),
  watchCursor: 0,
})

const createComponentId = (
  container: RuntimeContainer,
  parentId: string | null,
  childIndex: number,
) => {
  if (!parentId || parentId === ROOT_COMPONENT_ID) {
    return `c${childIndex}`
  }
  return `${parentId}.${childIndex}`
}

const getOrCreateComponentState = (
  container: RuntimeContainer,
  id: string,
  symbol: string,
  parentId: string | null,
): ComponentState => {
  const existing = container.components.get(id)
  if (existing) {
    existing.parentId = parentId
    existing.symbol = symbol
    return existing
  }
  const component: ComponentState = {
    active: false,
    didMount: false,
    id,
    parentId,
    props: {},
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol,
    watchCount: 0,
  }
  container.components.set(id, component)
  return component
}

const createWatchId = (componentId: string, watchIndex: number) => `${componentId}:w${watchIndex}`

const getOrCreateWatchState = (
  container: RuntimeContainer,
  id: string,
  componentId: string,
): WatchState => {
  const existing = container.watches.get(id)
  if (existing) {
    existing.componentId = componentId
    return existing
  }
  const effect: ReactiveEffect = {
    fn() {},
    signals: new Set(),
  }
  const watch: WatchState = {
    componentId,
    effect,
    id,
    mode: 'dynamic',
    pending: null,
    run: null,
    scopeId: registerScope(container, []),
    symbol: '',
    track: null,
  }
  effect.fn = () => {
    if (watch.run) {
      watch.run()
      return
    }
    if (!container.doc) {
      return
    }
    const scheduled = (watch.pending ?? Promise.resolve()).then(async () => {
      const module = await loadSymbol(container, watch.symbol)
      const scope = materializeScope(container, watch.scopeId)
      await withClientContainer(container, () => {
        if (watch.mode === 'dynamic') {
          collectTrackedDependencies(effect, () => {
            module.default(scope)
          })
          return
        }
        collectTrackedDependencies(effect, () => {
          module.default(scope, 'track')
        })
        module.default(scope, 'run')
      })
      await flushDirtyComponents(container)
    })
    const queued = scheduled.finally(() => {
      if (watch.pending === queued) {
        watch.pending = null
      }
    })
    watch.pending = queued
  }
  container.watches.set(id, watch)
  return watch
}

const clearComponentSubscriptions = (container: RuntimeContainer, componentId: string) => {
  for (const record of container.signals.values()) {
    record.subscribers.delete(componentId)
  }
}

const removeWatchState = (container: RuntimeContainer, watchId: string) => {
  const watch = container.watches.get(watchId)
  if (!watch) {
    return
  }
  clearEffectSignals(watch.effect)
  container.watches.delete(watchId)
}

const pruneComponentWatches = (
  container: RuntimeContainer,
  component: ComponentState,
  nextCount: number,
) => {
  for (let index = nextCount; index < component.watchCount; index++) {
    removeWatchState(container, createWatchId(component.id, index))
  }
  component.watchCount = nextCount
}

const isDescendantOf = (parentId: string, candidateId: string) =>
  candidateId.startsWith(`${parentId}.`)

const collectDescendantIds = (container: RuntimeContainer, componentId: string) =>
  [...container.components.keys()].filter((candidate) => isDescendantOf(componentId, candidate))

const pruneRemovedComponents = (
  container: RuntimeContainer,
  componentId: string,
  keep: Set<string>,
) => {
  for (const descendantId of collectDescendantIds(container, componentId)) {
    if (keep.has(descendantId)) {
      continue
    }
    clearComponentSubscriptions(container, descendantId)
    const descendant = container.components.get(descendantId)
    if (descendant) {
      pruneComponentWatches(container, descendant, 0)
    }
    container.components.delete(descendantId)
  }
}

const scheduleMicrotask = (fn: () => void) => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn)
    return
  }
  Promise.resolve().then(fn)
}

const scheduleMountCallbacks = (
  container: RuntimeContainer,
  component: ComponentState,
  callbacks: Array<() => void>,
) => {
  if (component.didMount || callbacks.length === 0) {
    return
  }
  component.didMount = true
  scheduleMicrotask(() => {
    void withClientContainer(container, () => {
      for (const callback of callbacks) {
        callback()
      }
    }).then(() => flushDirtyComponents(container))
  })
}

const replaceBoundaryContents = (start: Comment, end: Comment, nodes: Node[]) => {
  let cursor = start.nextSibling
  while (cursor && cursor !== end) {
    const next = cursor.nextSibling
    cursor.remove()
    cursor = next
  }
  for (const node of nodes) {
    end.parentNode?.insertBefore(node, end)
  }
}

interface FocusSnapshot {
  path: number[]
  selectionDirection?: 'backward' | 'forward' | 'none' | null
  selectionEnd?: number | null
  selectionStart?: number | null
}

interface PendingFocusRestore {
  snapshot: FocusSnapshot
}

const getBoundaryChildren = (start: Comment, end: Comment) => {
  const nodes: Node[] = []
  let cursor = start.nextSibling
  while (cursor && cursor !== end) {
    nodes.push(cursor)
    cursor = cursor.nextSibling
  }
  return nodes
}

const getNodePath = (root: Node, target: Node): number[] | null => {
  if (root === target) {
    return []
  }

  const path: number[] = []
  let cursor: Node | null = target
  while (cursor && cursor !== root) {
    const parent: Node | null = cursor.parentNode
    if (!parent) {
      return null
    }
    const index = Array.prototype.indexOf.call(parent.childNodes, cursor)
    if (index < 0) {
      return null
    }
    path.unshift(index)
    cursor = parent
  }

  return cursor === root ? path : null
}

const getNodeByPath = (root: Node, path: number[]) => {
  let cursor: Node | null = root
  for (const index of path) {
    cursor = cursor?.childNodes.item(index) ?? null
    if (!cursor) {
      return null
    }
  }
  return cursor
}

const getElementPath = (root: Element, target: Element): number[] | null => {
  if (root === target) {
    return []
  }

  const path: number[] = []
  let cursor: Element | null = target
  while (cursor && cursor !== root) {
    const parent: HTMLElement | null = cursor.parentElement
    if (!parent) {
      return null
    }
    const index = Array.prototype.indexOf.call(parent.children, cursor)
    if (index < 0) {
      return null
    }
    path.unshift(index)
    cursor = parent
  }

  return cursor === root ? path : null
}

const getElementByPath = (root: Element, path: number[]) => {
  let cursor: Element | null = root
  for (const index of path) {
    cursor = (cursor?.children.item(index) as Element | null) ?? null
    if (!cursor) {
      return null
    }
  }
  return cursor
}

const captureBoundaryFocus = (
  doc: Document,
  start: Comment,
  end: Comment,
): FocusSnapshot | null => {
  const activeElement = doc.activeElement
  if (!(activeElement instanceof HTMLElement)) {
    return null
  }

  const topLevelNodes = getBoundaryChildren(start, end)
  for (let i = 0; i < topLevelNodes.length; i++) {
    const candidate = topLevelNodes[i]
    if (
      candidate !== activeElement &&
      (!(candidate instanceof Element) || !candidate.contains(activeElement))
    ) {
      continue
    }

    const innerPath = getNodePath(candidate, activeElement)
    if (!innerPath) {
      continue
    }

    return {
      path: [i, ...innerPath],
      selectionDirection:
        activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
          ? activeElement.selectionDirection
          : null,
      selectionEnd:
        activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
          ? activeElement.selectionEnd
          : null,
      selectionStart:
        activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
          ? activeElement.selectionStart
          : null,
    }
  }

  return null
}

const restoreBoundaryFocus = (
  doc: Document,
  start: Comment,
  end: Comment,
  snapshot: FocusSnapshot | null,
) => {
  if (!snapshot) {
    return
  }

  const [topLevelIndex, ...innerPath] = snapshot.path
  const root = getBoundaryChildren(start, end)[topLevelIndex]
  if (!root) {
    return
  }

  const nextActive = innerPath.length > 0 ? getNodeByPath(root, innerPath) : root
  if (!(nextActive instanceof HTMLElement)) {
    return
  }

  restoreFocusTarget(doc, nextActive, snapshot)
}

const restoreFocusTarget = (doc: Document, nextActive: HTMLElement, snapshot: FocusSnapshot) => {
  const restore = () => {
    if (!nextActive.isConnected) {
      return false
    }
    nextActive.focus({ preventScroll: true })
    if (
      (nextActive instanceof HTMLInputElement || nextActive instanceof HTMLTextAreaElement) &&
      snapshot.selectionStart !== null &&
      snapshot.selectionStart !== undefined
    ) {
      nextActive.setSelectionRange(
        snapshot.selectionStart,
        snapshot.selectionEnd ?? snapshot.selectionStart,
        snapshot.selectionDirection ?? undefined,
      )
    }
    return doc.activeElement === nextActive
  }

  if (restore()) {
    return
  }

  const win = doc.defaultView
  if (!win) {
    return
  }

  let remainingAttempts = 3
  const retry = () => {
    if (remainingAttempts <= 0) {
      return
    }
    remainingAttempts--
    const run = () => {
      if (restore()) {
        return
      }
      retry()
    }

    if (typeof win.requestAnimationFrame === 'function') {
      win.requestAnimationFrame(() => run())
      return
    }
    win.setTimeout(run, 16)
  }

  retry()
}

const captureDocumentFocus = (
  doc: Document,
  focusSource?: EventTarget | null,
): FocusSnapshot | null => {
  const candidate =
    focusSource instanceof HTMLElement
      ? focusSource
      : doc.activeElement instanceof HTMLElement
        ? doc.activeElement
        : null
  if (!candidate) {
    return null
  }

  const path = getElementPath(doc.body, candidate)
  if (!path) {
    return null
  }

  return {
    path,
    selectionDirection:
      candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement
        ? candidate.selectionDirection
        : null,
    selectionEnd:
      candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement
        ? candidate.selectionEnd
        : null,
    selectionStart:
      candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement
        ? candidate.selectionStart
        : null,
  }
}

const capturePendingFocusRestore = (
  container: RuntimeContainer,
  focusSource?: EventTarget | null,
): PendingFocusRestore | null => {
  if (!container.doc) {
    return null
  }

  const snapshot = captureDocumentFocus(container.doc, focusSource)
  if (!snapshot) {
    return null
  }
  return {
    snapshot,
  }
}

const restorePendingFocus = (container: RuntimeContainer, pending: PendingFocusRestore | null) => {
  if (!pending || !container.doc) {
    return
  }

  const nextActive = getElementByPath(container.doc.body, pending.snapshot.path)
  if (!(nextActive instanceof HTMLElement)) {
    return
  }

  restoreFocusTarget(container.doc, nextActive, pending.snapshot)
}

const htmlToNodes = (doc: Document, html: string) => {
  const template = doc.createElement('template')
  template.innerHTML = html
  return Array.from(template.content.childNodes)
}

const EVENT_PROP_REGEX = /^on([A-Z].+)\$$/

const toEventName = (propName: string) => {
  const matched = propName.match(EVENT_PROP_REGEX)
  if (!matched) {
    return null
  }
  const [first, ...rest] = matched[1]
  return `${first.toLowerCase()}${rest.join('')}`
}

const escapeText = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const escapeAttr = (value: string) =>
  escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;')

const resolveRenderable = (value: JSX.Element): JSX.Element => {
  let current = value
  while (typeof current === 'function' && !getLazyMeta(current) && !getComponentMeta(current)) {
    current = current()
  }
  return current
}

const isRenderObject = (value: JSX.Element): value is RenderObject =>
  typeof value === 'object' && value !== null && 'type' in value && 'props' in value

const nextComponentPosition = (container: RuntimeContainer) => {
  const frame = getCurrentFrame()
  if (!frame) {
    return {
      childIndex: container.rootChildCursor++,
      parentId: ROOT_COMPONENT_ID,
    }
  }
  return {
    childIndex: frame.childCursor++,
    parentId: frame.component.id,
  }
}

const registerEventBinding = (
  container: RuntimeContainer,
  descriptor: EventDescriptor | LazyMeta,
): string => {
  const scopeId = registerScope(container, descriptor.captures())
  return `${descriptor.symbol}:${scopeId}`
}

export const bindRuntimeEvent = (element: Element, eventName: string, value: unknown): boolean => {
  const descriptor = getEventMeta(value)
  if (!descriptor) {
    return false
  }

  const container = getCurrentContainer()
  if (!container) {
    return false
  }

  element.setAttribute('data-eid', `e${container.nextElementId++}`)
  element.setAttribute(`data-e-on${eventName}`, registerEventBinding(container, descriptor))
  return true
}

const renderStringNode = (inputElementLike: JSX.Element | JSX.Element[]): string => {
  if (Array.isArray(inputElementLike)) {
    return inputElementLike.map((entry) => renderStringNode(entry)).join('')
  }

  const resolved = resolveRenderable(inputElementLike as JSX.Element)
  if (resolved === false || resolved === null || resolved === undefined) {
    return ''
  }
  if (Array.isArray(resolved)) {
    return renderStringNode(resolved)
  }
  if (
    typeof resolved === 'string' ||
    typeof resolved === 'number' ||
    typeof resolved === 'boolean'
  ) {
    return escapeText(String(resolved))
  }
  if (isRouteSlot(resolved)) {
    const routeElement = resolveRouteSlot(getCurrentContainer(), resolved)
    return routeElement ? renderStringNode(routeElement as JSX.Element) : ''
  }
  if (!isRenderObject(resolved)) {
    return ''
  }

  if (typeof resolved.type === 'function') {
    const container = getCurrentContainer()
    const meta = getComponentMeta(resolved.type)
    if (!meta || !container) {
      return renderStringNode(resolved.type(resolved.props))
    }

    const evaluatedProps = evaluateProps(resolved.props)
    const position = nextComponentPosition(container)
    const componentId = createComponentId(container, position.parentId, position.childIndex)
    const component = getOrCreateComponentState(
      container,
      componentId,
      meta.symbol,
      position.parentId,
    )
    component.scopeId = registerScope(container, meta.captures())
    component.props = evaluatedProps
    const frame = createFrame(container, component, 'ssr')
    clearComponentSubscriptions(container, component.id)

    const componentFn = resolved.type as Component
    const body = pushFrame(frame, () => renderStringNode(componentFn(evaluatedProps)))
    pruneComponentWatches(container, component, frame.watchCursor)
    return `<!--ec:c:${componentId}:start-->${body}<!--ec:c:${componentId}:end-->`
  }

  const attrParts: string[] = []
  const descriptors = Object.getOwnPropertyDescriptors(resolved.props)
  const container = getCurrentContainer()

  for (const [name, descriptor] of Object.entries(descriptors) as [string, PropertyDescriptor][]) {
    if (name === 'children') {
      continue
    }

    const eventName = toEventName(name)
    const value = descriptor.get ? descriptor.get.call(resolved.props) : descriptor.value

    if (eventName) {
      const eventMeta = getEventMeta(value)
      if (!eventMeta || !container) {
        continue
      }
      attrParts.push(`data-eid="e${container.nextElementId++}"`)
      attrParts.push(
        `data-e-on${eventName}="${escapeAttr(registerEventBinding(container, eventMeta))}"`,
      )
      continue
    }

    if (value === false || value === undefined || value === null) {
      continue
    }

    if (resolved.type === 'body' && name === 'data-e-resume') {
      continue
    }

    if (value === true) {
      attrParts.push(name)
      continue
    }

    attrParts.push(`${name}="${escapeAttr(String(value))}"`)
  }

  if (resolved.type === 'body' && container) {
    attrParts.push('data-e-resume="paused"')
  }

  let childrenText = ''
  const children = resolved.props.children
  if (Array.isArray(children)) {
    for (const child of children) {
      childrenText += renderStringNode(child)
    }
  } else {
    childrenText += renderStringNode(children as JSX.Element)
  }

  if (resolved.type === FRAGMENT) {
    return childrenText
  }

  return `<${resolved.type}${attrParts.length > 0 ? ` ${attrParts.join(' ')}` : ''}>${childrenText}</${
    resolved.type
  }>`
}

const createElementNode = (doc: Document, tagName: string) => doc.createElement(tagName)

const renderComponentToNodes = (
  componentFn: Component,
  props: Record<string, unknown>,
  container: RuntimeContainer,
  mode: RenderFrame['mode'],
): Node[] => {
  if (!container.doc) {
    throw new Error('Client rendering requires a document.')
  }
  const meta = getComponentMeta(componentFn)
  if (!meta) {
    return renderClientNodes(componentFn(props), container)
  }

  const position = nextComponentPosition(container)
  const componentId = createComponentId(container, position.parentId, position.childIndex)
  const component = getOrCreateComponentState(
    container,
    componentId,
    meta.symbol,
    position.parentId,
  )
  component.scopeId = registerScope(container, meta.captures())
  component.props = props
  const frame = createFrame(container, component, mode)
  clearComponentSubscriptions(container, componentId)
  const oldDescendants = collectDescendantIds(container, componentId)
  const start = container.doc.createComment(`ec:c:${componentId}:start`)
  const end = container.doc.createComment(`ec:c:${componentId}:end`)
  component.start = start
  component.end = end
  const rendered = pushFrame(frame, () => toMountedNodes(componentFn(props), container))
  pruneComponentWatches(container, component, frame.watchCursor)
  pruneRemovedComponents(container, componentId, frame.visitedDescendants)

  for (const descendantId of oldDescendants) {
    if (frame.visitedDescendants.has(descendantId)) {
      continue
    }
    clearComponentSubscriptions(container, descendantId)
  }

  const currentFrame = getCurrentFrame()
  if (currentFrame) {
    currentFrame.visitedDescendants.add(componentId)
    for (const descendantId of frame.visitedDescendants) {
      currentFrame.visitedDescendants.add(descendantId)
    }
  }

  scheduleMountCallbacks(container, component, frame.mountCallbacks)

  return [start, ...rendered, end]
}

const applyElementProp = (
  element: HTMLElement,
  name: string,
  value: unknown,
  container: RuntimeContainer,
) => {
  const eventName = toEventName(name)
  if (eventName) {
    const eventMeta = getEventMeta(value)
    if (!eventMeta) {
      return
    }
    element.setAttribute('data-eid', `e${container.nextElementId++}`)
    element.setAttribute(`data-e-on${eventName}`, registerEventBinding(container, eventMeta))
    return
  }

  if (value === false || value === undefined || value === null) {
    return
  }

  if (name === 'class') {
    element.className = String(value)
    return
  }

  if (name === 'style' && isPlainObject(value)) {
    element.setAttribute(
      'style',
      Object.entries(value)
        .map(([styleName, styleValue]) => `${styleName}: ${styleValue}`)
        .join('; '),
    )
    return
  }

  if (name === 'value' && 'value' in element) {
    ;(element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = String(value)
  }
  if (name === 'checked' && element instanceof HTMLInputElement) {
    element.checked = Boolean(value)
  }

  if (value === true) {
    element.setAttribute(name, '')
    return
  }

  element.setAttribute(name, String(value))
}

export const renderClientNodes = (
  inputElementLike: JSX.Element | JSX.Element[],
  container: RuntimeContainer,
): Node[] => {
  if (!container.doc) {
    throw new Error('Client rendering requires a document.')
  }
  if (Array.isArray(inputElementLike)) {
    return inputElementLike.flatMap((entry) => renderClientNodes(entry, container))
  }

  const resolved = resolveRenderable(inputElementLike as JSX.Element)
  if (resolved === false || resolved === null || resolved === undefined) {
    return []
  }
  if (Array.isArray(resolved)) {
    return renderClientNodes(resolved, container)
  }
  if (
    typeof resolved === 'string' ||
    typeof resolved === 'number' ||
    typeof resolved === 'boolean'
  ) {
    return [container.doc.createTextNode(String(resolved))]
  }
  if (isRouteSlot(resolved)) {
    const routeElement = resolveRouteSlot(container, resolved)
    return routeElement ? renderClientNodes(routeElement as JSX.Element, container) : []
  }
  if (!isRenderObject(resolved)) {
    return []
  }

  if (typeof resolved.type === 'function') {
    const evaluatedProps = evaluateProps(resolved.props)
    return renderComponentToNodes(resolved.type, evaluatedProps, container, 'client')
  }

  if (resolved.type === FRAGMENT) {
    const children = resolved.props.children
    return Array.isArray(children)
      ? children.flatMap((child: JSX.Element) => renderClientNodes(child, container))
      : renderClientNodes(children as JSX.Element, container)
  }

  const element = createElementNode(container.doc, resolved.type)
  for (const [name, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(resolved.props),
  ) as [string, PropertyDescriptor][]) {
    if (name === 'children') {
      continue
    }
    const value = descriptor.get ? descriptor.get.call(resolved.props) : descriptor.value
    if (resolved.type === 'body' && name === 'data-e-resume') {
      continue
    }
    applyElementProp(element, name, value, container)
  }

  const children = resolved.props.children
  const childNodes = Array.isArray(children)
    ? children.flatMap((child: JSX.Element) => renderClientNodes(child, container))
    : renderClientNodes(children as JSX.Element, container)
  for (const child of childNodes) {
    element.appendChild(child)
  }

  return [element]
}

const scanComponentBoundaries = (
  root: HTMLElement,
): Map<string, { end?: Comment; start?: Comment }> => {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  const boundaries = new Map<string, { end?: Comment; start?: Comment }>()

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (!(node instanceof Comment)) {
      continue
    }
    const matched = node.data.match(/^ec:c:(.+):(start|end)$/)
    if (!matched) {
      continue
    }
    const [, id, edge] = matched
    const boundary = boundaries.get(id) ?? {}
    if (edge === 'start') {
      boundary.start = node
    } else {
      boundary.end = node
    }
    boundaries.set(id, boundary)
  }

  return boundaries
}

const loadSymbol = async (
  container: RuntimeContainer,
  symbolId: string,
): Promise<RuntimeSymbolModule> => {
  const existing = container.imports.get(symbolId)
  if (existing) {
    return existing
  }

  const url = container.symbols.get(symbolId)
  if (!url) {
    throw new Error(`Missing symbol URL for ${symbolId}.`)
  }

  const loaded = import(/* @vite-ignore */ url) as Promise<RuntimeSymbolModule>
  container.imports.set(symbolId, loaded)
  return loaded
}

const toMountedNodes = (value: unknown, container: RuntimeContainer): Node[] => {
  if (!container.doc) {
    throw new Error('Client rendering requires a document.')
  }

  let resolved = value
  while (typeof resolved === 'function') {
    resolved = resolved()
  }

  if (Array.isArray(resolved)) {
    return resolved.flatMap((entry) => toMountedNodes(entry, container))
  }
  if (resolved === null || resolved === undefined || resolved === false) {
    return [container.doc.createComment('eclipsa-empty')]
  }
  if (resolved instanceof Node) {
    return [resolved]
  }
  if (
    typeof resolved === 'string' ||
    typeof resolved === 'number' ||
    typeof resolved === 'boolean'
  ) {
    return [container.doc.createTextNode(String(resolved))]
  }
  return renderClientNodes(resolved as JSX.Element | JSX.Element[], container)
}

export const getRuntimeContainer = () => getCurrentContainer()

export const renderClientInsertable = (
  value: unknown,
  container: RuntimeContainer | null = getCurrentContainer(),
): Node[] => {
  const doc = container?.doc ?? (typeof document !== 'undefined' ? document : null)
  if (!doc) {
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => renderClientInsertable(entry, container))
  }

  let resolved = value
  while (typeof resolved === 'function') {
    resolved = resolved()
  }

  if (resolved === null || resolved === undefined || resolved === false) {
    return [doc.createComment('eclipsa-empty')]
  }
  if (resolved instanceof Node) {
    return [resolved]
  }
  if (
    typeof resolved === 'string' ||
    typeof resolved === 'number' ||
    typeof resolved === 'boolean'
  ) {
    return [doc.createTextNode(String(resolved))]
  }
  if (isRouteSlot(resolved)) {
    const routeElement = resolveRouteSlot(container, resolved)
    return routeElement ? renderClientInsertable(routeElement, container) : [doc.createComment('eclipsa-empty')]
  }
  if (container) {
    return renderClientNodes(resolved as JSX.Element | JSX.Element[], container)
  }
  return [doc.createTextNode(String(resolved))]
}

const resetContainerForRouteRender = (container: RuntimeContainer) => {
  for (const watch of container.watches.values()) {
    clearEffectSignals(watch.effect)
  }

  container.components.clear()
  container.dirty.clear()
  container.nextElementId = 0
  container.nextScopeId = 0
  container.nextSignalId = 0
  container.rootChildCursor = 0
  container.scopes.clear()
  container.watches.clear()

  for (const [id, record] of [...container.signals.entries()]) {
    for (const effect of [...record.effects]) {
      clearEffectSignals(effect)
    }
    record.effects.clear()
    record.subscribers.clear()
    if (!isRouterSignalId(id)) {
      container.signals.delete(id)
    }
  }
}

const resolveRouteComponentSymbol = (Page: RouteRenderer, fallback: string) =>
  getComponentMeta(Page)?.symbol ?? fallback

const isRouteSlot = (value: unknown): value is RouteSlotCarrier =>
  isPlainObject(value) && value.__eclipsa_type === ROUTE_SLOT_TYPE

const createRouteSlot = (route: LoadedRoute, startLayoutIndex: number): RouteSlotCarrier => {
  const slot: RouteSlotCarrier = {
    __eclipsa_type: ROUTE_SLOT_TYPE,
    pathname: route.pathname,
    startLayoutIndex,
  }
  Object.defineProperty(slot, ROUTE_SLOT_ROUTE_KEY, {
    configurable: true,
    enumerable: false,
    value: route,
    writable: true,
  })
  return slot
}

const resolveRouteSlot = (container: RuntimeContainer | null, slot: RouteSlotCarrier) => {
  const route = slot[ROUTE_SLOT_ROUTE_KEY] ?? container?.router?.loadedRoutes.get(slot.pathname)
  if (!route) {
    return null
  }
  return createRouteElement(route, slot.startLayoutIndex)
}

const createRouteElement = (route: LoadedRoute, startLayoutIndex = 0) => {
  if (startLayoutIndex >= route.layouts.length) {
    return jsxDEV(route.page.renderer as unknown as JSX.Type, {}, null, false, {})
  }

  let children: unknown = null
  for (let index = route.layouts.length - 1; index >= startLayoutIndex; index -= 1) {
    const layout = route.layouts[index]!
    children = jsxDEV(
      layout.renderer as unknown as JSX.Type,
      {
        children: createRouteSlot(route, index + 1),
      },
      null,
      false,
      {},
    )
  }
  return children
}

const renderRouteIntoRoot = (
  container: RuntimeContainer,
  Page: RouteRenderer,
  routeKey: string,
) => {
  if (!container.doc || !container.rootElement) {
    throw new Error('Client route rendering requires a document root.')
  }

  resetContainerForRouteRender(container)
  const rootComponent = getOrCreateComponentState(
    container,
    'c0',
    resolveRouteComponentSymbol(Page, routeKey),
    ROOT_COMPONENT_ID,
  )
  rootComponent.active = true
  rootComponent.didMount = false
  rootComponent.end = undefined
  rootComponent.props = {}
  rootComponent.scopeId = registerScope(container, getComponentMeta(Page)?.captures() ?? [])
  rootComponent.signalIds = []
  rootComponent.start = undefined
  rootComponent.watchCount = 0

  clearComponentSubscriptions(container, rootComponent.id)
  const frame = createFrame(container, rootComponent, 'client')
  const nodes = pushContainer(container, () =>
    pushFrame(frame, () => {
      const rendered = Page({})
      return toMountedNodes(rendered, container)
    }),
  )
  pruneComponentWatches(container, rootComponent, frame.watchCursor)
  scheduleMountCallbacks(container, rootComponent, frame.mountCallbacks)

  const root = container.rootElement
  while (root.firstChild) {
    root.firstChild.remove()
  }
  const start = container.doc.createComment('ec:c:c0:start')
  const end = container.doc.createComment('ec:c:c0:end')
  root.appendChild(start)
  for (const node of nodes) {
    root.appendChild(node)
  }
  root.appendChild(end)
  rootComponent.start = start
  rootComponent.end = end
  bindRouterLinks(container, root)
}

const loadRouteModule = async (url: string): Promise<LoadedRouteModule> => {
  const module = (await import(/* @vite-ignore */ url)) as { default?: RouteRenderer }
  if (typeof module.default !== 'function') {
    throw new TypeError(`Route module ${url} does not export a default component.`)
  }

  return {
    renderer: module.default,
    symbol: getComponentMeta(module.default)?.symbol ?? null,
    url,
  }
}

const loadRouteComponent = async (container: RuntimeContainer, pathname: string) => {
  const router = ensureRouterState(container)
  const normalizedPath = normalizeRoutePath(pathname)
  const existing = router.loadedRoutes.get(normalizedPath)
  if (existing) {
    return existing
  }

  const entry = router.manifest.get(normalizedPath)
  if (!entry) {
    return null
  }

  const [page, ...layouts] = await Promise.all([
    loadRouteModule(entry.page),
    ...entry.layouts.map((layoutUrl) => loadRouteModule(layoutUrl)),
  ])
  const route: LoadedRoute = {
    layouts,
    pathname: normalizedPath,
    page,
    render: () => createRouteElement(route),
  }

  router.loadedRoutes.set(normalizedPath, route)
  return route
}

const findRouteComponentChain = (
  container: RuntimeContainer,
  symbols: string[],
  parentId: string | null = null,
): string[] | null => {
  if (symbols.length === 0) {
    return []
  }

  const [symbol, ...rest] = symbols
  const candidates = [...container.components.values()]
    .filter((component) => {
      if (!component.active || component.symbol !== symbol) {
        return false
      }
      if (parentId === null) {
        return true
      }
      return isDescendantOf(parentId, component.id)
    })
    .sort((left, right) => left.id.split('.').length - right.id.split('.').length)

  for (const candidate of candidates) {
    const remainder = findRouteComponentChain(container, rest, candidate.id)
    if (!remainder) {
      continue
    }
    return [candidate.id, ...remainder]
  }

  return null
}

const collectSharedLayoutBoundaryIds = (container: RuntimeContainer, route: LoadedRoute) => {
  if (route.layouts.length === 0 || route.layouts.some((layout) => !layout.symbol)) {
    return null
  }

  const symbols = route.layouts.map((layout) => layout.symbol as string)
  if (route.page.symbol) {
    const chain = findRouteComponentChain(container, [...symbols, route.page.symbol])
    return chain?.slice(0, route.layouts.length) ?? null
  }

  return findRouteComponentChain(container, symbols)
}

const countSharedLayouts = (current: LoadedRoute | null, next: LoadedRoute) => {
  if (!current) {
    return 0
  }

  let count = 0
  const limit = Math.min(current.layouts.length, next.layouts.length)
  while (count < limit && current.layouts[count]!.url === next.layouts[count]!.url) {
    count += 1
  }
  return count
}

const updateSharedLayoutBoundary = async (
  container: RuntimeContainer,
  current: LoadedRoute,
  next: LoadedRoute,
  sharedLayoutCount: number,
) => {
  if (sharedLayoutCount <= 0) {
    return false
  }

  const boundaryIds = collectSharedLayoutBoundaryIds(container, current)
  if (!boundaryIds || boundaryIds.length < sharedLayoutCount) {
    return false
  }

  const boundaryId = boundaryIds[sharedLayoutCount - 1]!
  const boundary = container.components.get(boundaryId)
  if (!boundary) {
    return false
  }

  boundary.props = {
    children: createRouteElement(next, sharedLayoutCount),
  }
  boundary.active = false
  container.dirty.add(boundaryId)
  await flushDirtyComponents(container)
  return true
}

const commitBrowserNavigation = (doc: Document, url: URL, mode: NavigationMode) => {
  if (!doc.defaultView || mode === 'pop') {
    return
  }
  if (mode === 'replace') {
    doc.defaultView.history.replaceState(null, '', url.href)
    return
  }
  doc.defaultView.history.pushState(null, '', url.href)
}

const fallbackDocumentNavigation = (doc: Document, url: URL, mode: NavigationMode) => {
  if (!doc.defaultView) {
    return
  }
  if (mode === 'replace') {
    doc.defaultView.location.replace(url.href)
    return
  }
  if (mode === 'pop') {
    doc.defaultView.location.assign(url.href)
    return
  }
  doc.defaultView.location.assign(url.href)
}

const navigateContainer = async (
  container: RuntimeContainer,
  href: string,
  options?: {
    mode?: NavigationMode
  },
) => {
  const doc = container.doc
  if (!doc) {
    return
  }

  const mode = options?.mode ?? 'push'
  const url = new URL(href, doc.location.href)
  const pathname = normalizeRoutePath(url.pathname)
  const router = ensureRouterState(container)
  const routeEntry = url.origin === doc.location.origin ? router.manifest.get(pathname) : null

  if (!routeEntry) {
    fallbackDocumentNavigation(doc, url, mode)
    return
  }

  const currentHref = `${doc.location.pathname}${doc.location.search}${doc.location.hash}`
  const nextHref = `${url.pathname}${url.search}${url.hash}`
  if (pathname === router.currentPath.value) {
    if (nextHref !== currentHref) {
      commitBrowserNavigation(doc, url, mode)
    }
    return
  }

  const sequence = ++router.sequence
  router.isNavigating.value = true

  try {
    const [currentRoute, nextRoute] = await Promise.all([
      router.currentRoute
        ? Promise.resolve(router.currentRoute)
        : loadRouteComponent(container, router.currentPath.value),
      loadRouteComponent(container, pathname),
    ])
    if (!nextRoute) {
      fallbackDocumentNavigation(doc, url, mode)
      return
    }
    if (sequence !== router.sequence) {
      return
    }

    const sharedLayoutCount = countSharedLayouts(currentRoute, nextRoute)
    const reusedLayout =
      currentRoute && sharedLayoutCount > 0
        ? await updateSharedLayoutBoundary(container, currentRoute, nextRoute, sharedLayoutCount)
        : false

    if (!reusedLayout) {
      renderRouteIntoRoot(container, nextRoute.render, `route:${pathname}`)
    }

    router.currentRoute = nextRoute
    commitBrowserNavigation(doc, url, mode)
    router.currentPath.value = pathname
  } catch {
    if (sequence === router.sequence) {
      fallbackDocumentNavigation(doc, url, mode)
    }
  } finally {
    if (sequence === router.sequence) {
      router.isNavigating.value = false
    }
  }
}

export const renderClientComponent = <T>(componentFn: Component<T>, props: T): unknown => {
  const container = getCurrentContainer()
  const parentFrame = getCurrentFrame()
  const meta = getComponentMeta(componentFn)

  if (!container || !parentFrame || !meta) {
    return componentFn(props)
  }

  const position = nextComponentPosition(container)
  const componentId = createComponentId(container, position.parentId, position.childIndex)
  const existing = container.components.get(componentId)
  const symbolChanged = !!existing && existing.symbol !== meta.symbol
  const component = getOrCreateComponentState(
    container,
    componentId,
    meta.symbol,
    position.parentId,
  )
  component.props =
    props && typeof props === 'object'
      ? evaluateProps(props as Record<string, unknown>)
      : (props as unknown)
  if (!existing || symbolChanged) {
    component.scopeId = registerScope(container, meta.captures())
  }
  component.active = true
  component.start = undefined
  component.end = undefined

  const frame = createFrame(container, component, 'client')
  const oldDescendants = collectDescendantIds(container, componentId)
  clearComponentSubscriptions(container, componentId)
  const rendered = pushFrame(frame, () => componentFn(props))
  pruneComponentWatches(container, component, frame.watchCursor)
  pruneRemovedComponents(container, componentId, frame.visitedDescendants)

  for (const descendantId of oldDescendants) {
    if (frame.visitedDescendants.has(descendantId)) {
      continue
    }
    clearComponentSubscriptions(container, descendantId)
  }

  parentFrame.visitedDescendants.add(componentId)
  for (const descendantId of frame.visitedDescendants) {
    parentFrame.visitedDescendants.add(descendantId)
  }

  scheduleMountCallbacks(container, component, frame.mountCallbacks)

  return rendered
}

const activateComponent = async (container: RuntimeContainer, componentId: string) => {
  const component = container.components.get(componentId)
  if (!component?.start || !component.end || component.active) {
    return
  }

  clearComponentSubscriptions(container, componentId)
  const oldDescendants = collectDescendantIds(container, componentId)
  const scope = materializeScope(container, component.scopeId)
  const module = await loadSymbol(container, component.symbol)
  const frame = createFrame(container, component, 'client')
  const focusSnapshot = captureBoundaryFocus(container.doc!, component.start, component.end)
  const nodes = pushContainer(container, () =>
    pushFrame(frame, () => {
      const rendered = module.default(scope, component.props)
      return toMountedNodes(rendered, container)
    }),
  )
  pruneComponentWatches(container, component, frame.watchCursor)
  replaceBoundaryContents(component.start, component.end, nodes)
  if (component.start.parentNode && 'querySelectorAll' in component.start.parentNode) {
    bindRouterLinks(container, component.start.parentNode as ParentNode)
  }
  restoreBoundaryFocus(container.doc!, component.start, component.end, focusSnapshot)

  component.active = true
  for (const descendantId of frame.visitedDescendants) {
    const descendant = container.components.get(descendantId)
    if (!descendant) {
      continue
    }
    descendant.active = true
    descendant.start = undefined
    descendant.end = undefined
  }

  pruneRemovedComponents(container, componentId, frame.visitedDescendants)

  for (const descendantId of oldDescendants) {
    if (frame.visitedDescendants.has(descendantId)) {
      continue
    }
    clearComponentSubscriptions(container, descendantId)
  }
  clearComponentSubscriptions(container, componentId)
  scheduleMountCallbacks(container, component, frame.mountCallbacks)
}

const sortDirtyComponents = (ids: Iterable<string>) =>
  [...ids].sort((a, b) => a.split('.').length - b.split('.').length)

const parseSymbolIdFromUrl = (url: string) => {
  const parsed = new URL(url, 'http://localhost')
  return parsed.searchParams.get('eclipsa-symbol')
}

const findNearestMountedBoundary = (container: RuntimeContainer, componentId: string) => {
  let currentId: string | null = componentId
  while (currentId && currentId !== ROOT_COMPONENT_ID) {
    const component = container.components.get(currentId)
    if (!component) {
      return null
    }
    if (component.start && component.end) {
      return component.id
    }
    currentId = component.parentId
  }
  return null
}

export const collectResumeHmrBoundaryIds = (
  container: RuntimeContainer,
  symbolIds: Iterable<string>,
) => {
  const targetSymbols = new Set(symbolIds)
  const pendingBoundaries = new Set<string>()

  for (const component of container.components.values()) {
    if (!targetSymbols.has(component.symbol)) {
      continue
    }
    const boundaryId = findNearestMountedBoundary(container, component.id)
    if (!boundaryId) {
      if (component.active) {
        return null
      }
      continue
    }
    pendingBoundaries.add(boundaryId)
  }

  const result: string[] = []
  for (const boundaryId of sortDirtyComponents(pendingBoundaries)) {
    if (
      result.some((parentId) => boundaryId === parentId || isDescendantOf(parentId, boundaryId))
    ) {
      continue
    }
    result.push(boundaryId)
  }
  return result
}

export const applyResumeHmrSymbolReplacements = (
  container: RuntimeContainer,
  replacements: Record<string, string>,
) => {
  for (const [oldSymbolId, url] of Object.entries(replacements)) {
    const currentUrl = container.symbols.get(oldSymbolId)
    const affectedIds = new Set<string>([oldSymbolId])

    if (currentUrl) {
      for (const [candidateId, candidateUrl] of container.symbols.entries()) {
        if (candidateUrl === currentUrl) {
          affectedIds.add(candidateId)
        }
      }
    }

    for (const affectedId of affectedIds) {
      container.symbols.set(affectedId, url)
      container.imports.delete(affectedId)
    }

    const nextSymbolId = parseSymbolIdFromUrl(url)
    if (!nextSymbolId) {
      continue
    }

    for (const component of container.components.values()) {
      if (affectedIds.has(component.symbol)) {
        component.symbol = nextSymbolId
      }
    }

    for (const watch of container.watches.values()) {
      if (affectedIds.has(watch.symbol)) {
        watch.symbol = nextSymbolId
      }
    }

    container.symbols.set(nextSymbolId, url)
    container.imports.delete(nextSymbolId)
  }
}

export const applyResumeHmrUpdate = async (
  container: RuntimeContainer,
  payload: ResumeHmrUpdatePayload,
) => {
  if (payload.fullReload) {
    return 'reload' as const
  }

  const boundaryIds = collectResumeHmrBoundaryIds(container, [
    ...payload.rerenderComponentSymbols,
    ...payload.rerenderOwnerSymbols,
  ])
  if (boundaryIds === null) {
    return 'reload' as const
  }

  applyResumeHmrSymbolReplacements(container, payload.symbolUrlReplacements)

  for (const boundaryId of boundaryIds) {
    const component = container.components.get(boundaryId)
    if (!component) {
      continue
    }
    component.active = false
    container.dirty.add(boundaryId)
  }

  if (container.dirty.size > 0) {
    await flushDirtyComponents(container)
  }

  return 'updated' as const
}

export const applyResumeHmrUpdateToRegisteredContainers = async (
  payload: ResumeHmrUpdatePayload,
) => {
  for (const container of getResumeContainers()) {
    const result = await applyResumeHmrUpdate(container, payload)
    if (result === 'reload') {
      return 'reload' as const
    }
  }

  return 'updated' as const
}

export const flushDirtyComponents = async (container: RuntimeContainer) => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[DIRTY_FLUSH_PROMISE_KEY]
  if (existing instanceof Promise) {
    await existing
    return
  }

  const flushing = (async () => {
    while (container.dirty.size > 0) {
      const batch = sortDirtyComponents(container.dirty)
      container.dirty.clear()
      const rerendered = new Set<string>()
      for (const componentId of batch) {
        if (
          [...rerendered].some(
            (parentId) => componentId === parentId || isDescendantOf(parentId, componentId),
          )
        ) {
          continue
        }
        const component = container.components.get(componentId)
        if (component?.active) {
          continue
        }
        await activateComponent(container, componentId)
        rerendered.add(componentId)
      }
    }
  })()

  globalRecord[DIRTY_FLUSH_PROMISE_KEY] = flushing
  try {
    await flushing
  } finally {
    delete globalRecord[DIRTY_FLUSH_PROMISE_KEY]
  }
}

export const beginSSRContainer = <T>(
  symbols: Record<string, string>,
  render: () => T,
): {
  container: RuntimeContainer
  result: T
} => {
  const container = createContainer(symbols)
  const rootComponent: ComponentState = {
    active: false,
    didMount: false,
    id: ROOT_COMPONENT_ID,
    parentId: null,
    props: {},
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol: ROOT_COMPONENT_ID,
    watchCount: 0,
  }

  const rootFrame = createFrame(container, rootComponent, 'ssr')
  const result = pushContainer(container, () => pushFrame(rootFrame, render))
  return {
    container,
    result,
  }
}

export const toResumePayload = (container: RuntimeContainer): ResumePayload => ({
  components: Object.fromEntries(
    [...container.components.entries()].map(([id, component]) => [
      id,
      {
        props: encodeValue(component.props),
        scope: component.scopeId,
        signalIds: [...component.signalIds],
        symbol: component.symbol,
        watchCount: component.watchCount,
      } satisfies ResumeComponentPayload,
    ]),
  ),
  scopes: Object.fromEntries(container.scopes.entries()),
  signals: Object.fromEntries(
    [...container.signals.entries()].map(([id, record]) => [id, encodeValue(record.value)]),
  ),
  subscriptions: Object.fromEntries(
    [...container.signals.entries()].map(([id, record]) => [id, [...record.subscribers]]),
  ),
  symbols: Object.fromEntries(container.symbols.entries()),
  watches: Object.fromEntries(
    [...container.watches.entries()].map(([id, watch]) => [
      id,
      {
        componentId: watch.componentId,
        mode: watch.mode,
        scope: watch.scopeId,
        signals: [...watch.effect.signals].map((signal) => signal.id),
        symbol: watch.symbol,
      } satisfies ResumeWatchPayload,
    ]),
  ),
})

export const createResumeContainer = (
  source: Document | HTMLElement,
  payload: ResumePayload,
  options?: {
    routeManifest?: RouteManifest
  },
) => {
  const doc = source instanceof Document ? source : source.ownerDocument
  const root = source instanceof Document ? doc.body : source
  const container = createContainer(payload.symbols, doc)
  container.rootElement = root as HTMLElement
  ensureRouterState(container, options?.routeManifest)

  for (const [id, encodedValue] of Object.entries(payload.signals)) {
    const decodedValue = decodeValue(encodedValue)
    const record = ensureSignalRecord(container, id, decodedValue)
    record.value = decodedValue
  }

  for (const [id, slots] of Object.entries(payload.scopes)) {
    container.scopes.set(id, slots)
  }

  for (const [id, componentPayload] of Object.entries(payload.components)) {
    container.components.set(id, {
      active: false,
      didMount: false,
      id,
      parentId: id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : ROOT_COMPONENT_ID,
      props: decodeValue(componentPayload.props),
      scopeId: componentPayload.scope,
      signalIds: [...componentPayload.signalIds],
      symbol: componentPayload.symbol,
      watchCount: componentPayload.watchCount,
    })
  }

  for (const [signalId, subscribers] of Object.entries(payload.subscriptions)) {
    const record = container.signals.get(signalId)
    if (!record) {
      continue
    }
    record.subscribers = new Set(subscribers)
  }

  for (const [id, watchPayload] of Object.entries(payload.watches)) {
    const watch = getOrCreateWatchState(container, id, watchPayload.componentId)
    watch.mode = watchPayload.mode
    watch.scopeId = watchPayload.scope
    watch.symbol = watchPayload.symbol
    watch.track = null
    watch.run = null
    clearEffectSignals(watch.effect)
    for (const signalId of watchPayload.signals) {
      const record = container.signals.get(signalId)
      if (!record) {
        continue
      }
      watch.effect.signals.add(record)
      record.effects.add(watch.effect)
    }
  }

  for (const [id, boundary] of scanComponentBoundaries(root as HTMLElement)) {
    const component = container.components.get(id)
    if (!component) {
      continue
    }
    component.start = boundary.start
    component.end = boundary.end
  }

  const router = ensureRouterState(container)
  router.currentPath.value = normalizeRoutePath(doc.location.pathname)
  router.isNavigating.value = false

  return container
}

export const primeRouteModules = async (container: RuntimeContainer) => {
  const router = ensureRouterState(container)
  const currentRoute = await loadRouteComponent(container, router.currentPath.value)
  if (currentRoute) {
    router.currentRoute = currentRoute
  }
}

const getRouterEventState = (event: Event): RouterEventState => {
  const eventRecord = event as Event & {
    [ROUTER_EVENT_STATE_KEY]?: RouterEventState
    preventDefault: () => void
  }
  const existing = eventRecord[ROUTER_EVENT_STATE_KEY]
  if (existing) {
    return existing
  }

  const originalPreventDefault = event.preventDefault.bind(event)
  const state: RouterEventState = {
    originalPreventDefault,
    routerPrevented: false,
    userPrevented: false,
  }

  eventRecord.preventDefault = () => {
    if (state.routerPrevented) {
      state.userPrevented = true
    }
    originalPreventDefault()
  }
  eventRecord[ROUTER_EVENT_STATE_KEY] = state
  return state
}

const findInteractiveTarget = (target: EventTarget | null, eventName: string): Element | null => {
  let element =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  while (element) {
    if (element.hasAttribute(`data-e-on${eventName}`)) {
      return element
    }
    element = element.parentElement
  }
  return null
}

const getPendingLinkNavigationForLink = (
  container: RuntimeContainer,
  event: Event,
  link: HTMLAnchorElement,
): PendingLinkNavigation | null => {
  if (!(event instanceof MouseEvent)) {
    return null
  }
  if (event.defaultPrevented) {
    return null
  }
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null
  }
  if (link.hasAttribute('download')) {
    return null
  }
  if (link.target && link.target !== '_self') {
    return null
  }

  const href = link.getAttribute('href')
  if (!href || !container.doc) {
    return null
  }

  const url = new URL(href, container.doc.location.href)
  const pathname = normalizeRoutePath(url.pathname)
  if (url.origin !== container.doc.location.origin) {
    return null
  }
  if (!ensureRouterState(container).manifest.has(pathname)) {
    return null
  }

  const state = getRouterEventState(event)
  state.routerPrevented = true
  state.originalPreventDefault()

  return {
    href: url.href,
    replace: link.getAttribute(ROUTE_REPLACE_ATTR) === 'true',
    state,
  }
}

const bindRouterLink = (container: RuntimeContainer, link: HTMLAnchorElement) => {
  const boundLink = link as HTMLAnchorElement & {
    [ROUTER_LINK_BOUND_KEY]?: true
  }
  if (boundLink[ROUTER_LINK_BOUND_KEY]) {
    return
  }

  boundLink[ROUTER_LINK_BOUND_KEY] = true
  link.addEventListener('click', (event) => {
    const pendingLink = getPendingLinkNavigationForLink(container, event, link)
    if (!pendingLink || pendingLink.state.userPrevented) {
      return
    }
    void navigateContainer(container, pendingLink.href, {
      mode: pendingLink.replace ? 'replace' : 'push',
    })
  })
}

const bindRouterLinks = (container: RuntimeContainer, root: ParentNode) => {
  const links = root.querySelectorAll(`a[${ROUTE_LINK_ATTR}]`)
  for (const link of links) {
    if (!(link instanceof HTMLAnchorElement)) {
      continue
    }
    bindRouterLink(container, link)
  }
}

const parseBinding = (value: string): { scopeId: string; symbolId: string } => {
  const separatorIndex = value.indexOf(':')
  if (separatorIndex < 0) {
    throw new Error(`Invalid binding ${value}.`)
  }
  return {
    symbolId: value.slice(0, separatorIndex),
    scopeId: value.slice(separatorIndex + 1),
  }
}

const withClientContainer = async <T>(container: RuntimeContainer, fn: () => Promise<T> | T) =>
  pushContainer(container, () => Promise.resolve(fn()))

const createDelegatedEvent = (event: Event, currentTarget: Element) =>
  Object.create(event, {
    currentTarget: {
      value: currentTarget,
    },
  }) as Event

export const createClientLazyListener = (
  descriptor: EventDescriptor | LazyMeta,
  currentTarget: Element,
) => {
  const container = getCurrentContainer()
  if (!container) {
    return null
  }

  return async (event: Event) => {
    const module = await loadSymbol(container, descriptor.symbol)
    await withClientContainer(container, async () => {
      await module.default(descriptor.captures(), createDelegatedEvent(event, currentTarget))
    })
    await flushDirtyComponents(container)
  }
}

export const dispatchResumeEvent = async (container: RuntimeContainer, event: Event) => {
  const interactiveTarget = findInteractiveTarget(event.target, event.type)
  if (!interactiveTarget) {
    return
  }
  const pendingFocus = capturePendingFocusRestore(container, event.target)

  const binding = interactiveTarget.getAttribute(`data-e-on${event.type}`)
  if (!binding) {
    return
  }

  const { scopeId, symbolId } = parseBinding(binding)
  const module = await loadSymbol(container, symbolId)
  await withClientContainer(container, async () => {
    await module.default(
      materializeScope(container, scopeId),
      createDelegatedEvent(event, interactiveTarget),
    )
  })
  await flushDirtyComponents(container)
  restorePendingFocus(container, pendingFocus)
}

const dispatchDocumentEvent = async (container: RuntimeContainer, event: Event) => {
  await dispatchResumeEvent(container, event)
}

export const installResumeListeners = (container: RuntimeContainer) => {
  const doc = container.doc
  if (!doc) {
    return () => {}
  }
  bindRouterLinks(container, doc)
  const listeners = ['click', 'input', 'change', 'submit'] as const
  const onEvent = (event: Event) => {
    void dispatchDocumentEvent(container, event)
  }
  const onPopState = () => {
    void navigateContainer(container, doc.location.href, {
      mode: 'pop',
    })
  }

  for (const eventName of listeners) {
    doc.addEventListener(eventName, onEvent, true)
  }
  doc.defaultView?.addEventListener('popstate', onPopState)

  return () => {
    for (const eventName of listeners) {
      doc.removeEventListener(eventName, onEvent, true)
    }
    doc.defaultView?.removeEventListener('popstate', onPopState)
  }
}

export const renderString = (inputElementLike: JSX.Element | JSX.Element[]) =>
  renderStringNode(inputElementLike)

export const useRuntimeSignal = <T>(fallback: T): { value: T } => {
  const container = getCurrentContainer()
  const frame = getCurrentFrame()

  if (!container || !frame || frame.component.id === ROOT_COMPONENT_ID) {
    const standaloneId = `standalone:${Math.random().toString(36).slice(2)}`
    const record = ensureSignalRecord(null, standaloneId, fallback)
    return record.handle
  }

  const signalIndex = frame.signalCursor++
  const existingId = frame.component.signalIds[signalIndex]
  const signalId = existingId ?? `s${container.nextSignalId++}`
  if (!existingId) {
    frame.component.signalIds.push(signalId)
  }
  const record = ensureSignalRecord(container, signalId, fallback)
  recordSignalRead(record)
  return record.handle
}

export const useRuntimeNavigate = (): Navigate => {
  const container = getCurrentContainer()
  if (!container) {
    return createStandaloneNavigate()
  }
  return ensureRouterState(container).navigate
}

export const createEffect = (fn: () => void) => {
  const effect: ReactiveEffect = {
    fn() {
      collectTrackedDependencies(effect, fn)
    },
    signals: new Set(),
  }

  effect.fn()
}

export const createOnMount = (fn: () => void) => {
  const frame = getCurrentFrame()
  if (!frame || frame.component.id === ROOT_COMPONENT_ID || frame.mode !== 'client') {
    return
  }
  frame.mountCallbacks.push(fn)
}

export const createWatch = (fn: () => void, dependencies?: WatchDependency[]) => {
  const container = getCurrentContainer()
  const frame = getCurrentFrame()
  const watchMeta = getWatchMeta(fn)

  if (!container || !frame || frame.component.id === ROOT_COMPONENT_ID || !watchMeta) {
    const effect: ReactiveEffect = {
      fn() {
        createLocalWatchRunner(effect, fn, dependencies)()
      },
      signals: new Set(),
    }
    effect.fn()
    return
  }

  const watchIndex = frame.watchCursor++
  const watchId = createWatchId(frame.component.id, watchIndex)
  const watch = getOrCreateWatchState(container, watchId, frame.component.id)
  watch.mode = dependencies ? 'explicit' : 'dynamic'
  watch.scopeId = registerScope(container, watchMeta.captures())
  watch.symbol = watchMeta.symbol
  watch.track = dependencies ? () => trackWatchDependencies(dependencies) : null
  watch.run = createLocalWatchRunner(watch.effect, fn, dependencies)
  watch.effect.fn()
}

export const getResumePayloadScriptContent = (payload: ResumePayload) => JSON.stringify(payload)
