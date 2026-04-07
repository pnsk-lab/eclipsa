import type { JSX } from '../jsx/types.ts'
import { FRAGMENT } from '../jsx/shared.ts'
import { isSSRAttrValue, isSSRRawValue, isSSRTemplate, jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import { isPendingSignalError, isSuspenseType, type SuspenseProps } from './suspense.ts'
import type { ResumeHmrUpdatePayload } from './resume-hmr.ts'
import {
  deserializePublicValue,
  serializePublicValue,
  type SerializedReference,
  type SerializedValue,
} from './hooks.ts'
import { escapeJSONScriptText } from './serialize.ts'
import type { Component } from './component.ts'
import type { Insertable } from './client/types.ts'
import {
  getContextProviderMeta,
  getRuntimeContextReference,
  materializeRuntimeContext,
  materializeRuntimeContextProvider,
} from './context.ts'
import {
  ROUTE_METADATA_HEAD_ATTR,
  composeRouteMetadata,
  type RouteMetadataExport,
} from './metadata.ts'
import {
  __eclipsaComponent,
  getActionHandleMeta,
  getActionHookMeta,
  getComponentMeta,
  getEventMeta,
  getRegisteredActionHookIds,
  getRegisteredActionHook,
  getRegisteredLoaderHookIds,
  getRegisteredLoaderHook,
  getLazyMeta,
  getLoaderHandleMeta,
  getLoaderHookMeta,
  getNavigateMeta,
  getSignalMeta,
  getWatchMeta,
  setNavigateMeta,
  setSignalMeta,
  type ComponentMeta,
  type EventDescriptor,
  type LazyMeta,
  type SignalMeta,
} from './internal.ts'
import {
  ROUTE_DATA_ENDPOINT,
  ROUTE_LINK_ATTR,
  ROUTE_PREFETCH_ATTR,
  ROUTE_PREFLIGHT_REQUEST_HEADER,
  ROUTE_REPLACE_ATTR,
  type LinkPrefetchMode,
  type Navigate,
  type NavigateOptions,
  type RouteManifest,
  type RouteLocation,
  type RouteModuleManifest,
  type RouteParams,
} from './router-shared.ts'

const CONTAINER_STACK_KEY = Symbol.for('eclipsa.container-stack')
const CONTEXT_VALUE_STACK_KEY = Symbol.for('eclipsa.context-value-stack')
const FRAME_STACK_KEY = Symbol.for('eclipsa.frame-stack')
const DIRTY_FLUSH_PROMISE_KEY = Symbol.for('eclipsa.dirty-flush-promise')
const ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY = Symbol.for('eclipsa.async-signal-snapshot-cache')
const STANDALONE_SIGNAL_ID_KEY = Symbol.for('eclipsa.standalone-signal-id')
const ACTION_FORM_ATTR = 'data-e-action-form'
const ROUTER_EVENT_STATE_KEY = Symbol.for('eclipsa.router-event-state')
const ROUTER_CURRENT_PATH_SIGNAL_ID = '$router:path'
const ROUTER_CURRENT_URL_SIGNAL_ID = '$router:url'
const ROUTER_IS_NAVIGATING_SIGNAL_ID = '$router:isNavigating'
const ROUTER_LINK_BOUND_KEY = Symbol.for('eclipsa.router-link-bound')
const ROUTER_LINK_PREFETCH_BOUND_KEY = Symbol.for('eclipsa.router-link-prefetch-bound')
const ROUTE_NOT_FOUND_KEY = Symbol.for('eclipsa.route-not-found')
const ROUTE_PARAMS_PROP = '__eclipsa_route_params'
const ROUTE_ERROR_PROP = '__eclipsa_route_error'
const ROUTE_SLOT_ROUTE_KEY = Symbol.for('eclipsa.route-slot-route')
const RESUME_CONTAINERS_KEY = Symbol.for('eclipsa.resume-containers')
export const RESUME_STATE_ELEMENT_ID = 'eclipsa-resume'
export const RESUME_FINAL_STATE_ELEMENT_ID = 'eclipsa-resume-final'
export const SCOPED_STYLE_ATTR = 'data-e-scope'
const ROOT_COMPONENT_ID = '$root'
const SUSPENSE_COMPONENT_SYMBOL = '$suspense'
const ROUTE_SLOT_TYPE = 'route-slot'
const PROJECTION_SLOT_TYPE = 'projection-slot'
const CONTAINER_ID_KEY = Symbol.for('eclipsa.runtime-container-id')
const RENDER_COMPONENT_TYPE_KEY = Symbol.for('eclipsa.render-component-type')
const RENDER_REFERENCE_KIND = 'render'
const REF_SIGNAL_ATTR = 'data-e-ref'
const STREAM_STATE_KEY = '__eclipsa_stream'
const PENDING_RESUME_LINK_KEY = '__eclipsa_pending_route_link'
const BIND_VALUE_PROP = 'bind:value'
const BIND_CHECKED_PROP = 'bind:checked'
const BIND_VALUE_ATTR = 'data-e-bind-value'
const BIND_CHECKED_ATTR = 'data-e-bind-checked'
const CLIENT_INSERT_OWNER_SYMBOL = '$client-insert-root'
const CLIENT_INSERT_OWNER_ID_PREFIX = '$insert:'
const DOM_TEXT_NODE = 3
const DOM_COMMENT_NODE = 8
const DOM_SHOW_COMMENT = 0x80
type DomConstructorName =
  | 'Element'
  | 'HTMLElement'
  | 'HTMLInputElement'
  | 'HTMLSelectElement'
  | 'HTMLTextAreaElement'
  | 'HTMLAnchorElement'
  | 'HTMLFormElement'

export interface ResumeComponentPayload {
  optimizedRoot?: boolean
  props: SerializedValue
  projectionSlots?: Record<string, number>
  scope: string
  signalIds: string[]
  symbol: string
  visibleCount: number
  watchCount: number
}

interface ResumeWatchPayload {
  componentId: string
  mode: WatchMode
  scope: string
  signals: string[]
  symbol: string
}

interface ResumeActionPayload {
  error: SerializedValue
  input: SerializedValue
  result: SerializedValue
}

interface ResumeVisiblePayload {
  componentId: string
  scope: string
  symbol: string
}

export interface ResumeLoaderPayload {
  data: SerializedValue
  error: SerializedValue
  loaded: boolean
}

interface LoaderSnapshot {
  data: unknown
  error: unknown
  loaded: boolean
}

export interface ResumePayload {
  actions: Record<string, ResumeActionPayload>
  components: Record<string, ResumeComponentPayload>
  loaders: Record<string, ResumeLoaderPayload>
  scopes: Record<string, SerializedValue[]>
  signals: Record<string, SerializedValue>
  subscriptions: Record<string, string[]>
  symbols: Record<string, string>
  visibles: Record<string, ResumeVisiblePayload>
  watches: Record<string, ResumeWatchPayload>
}

interface StreamedSuspenseChunk {
  boundaryId: string
  payloadScriptId: string
  templateId: string
}

interface StreamState {
  enqueue: (chunk: StreamedSuspenseChunk) => void
  pending: StreamedSuspenseChunk[]
  process?: () => Promise<void>
  processing?: Promise<void> | null
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

type CleanupCallback = () => void

export type RuntimeContextToken<T = unknown> = symbol & {
  __eclipsa_context_type__?: T
}

interface RuntimeContextValue {
  token: RuntimeContextToken
  value: unknown
}

const getDomContexts = (value: unknown): Array<Window | typeof globalThis> => {
  const contexts: Array<Window | typeof globalThis> = []
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return contexts
  }
  if ('ownerDocument' in value) {
    const ownerDocument = (value as { ownerDocument?: Document | null }).ownerDocument
    if (ownerDocument?.defaultView) {
      contexts.push(ownerDocument.defaultView)
    }
  }
  if ('defaultView' in value) {
    const defaultView = (value as { defaultView?: Window | null }).defaultView
    if (defaultView) {
      contexts.push(defaultView)
    }
  }
  contexts.push(globalThis)
  return contexts
}

const isDomInstance = <T>(value: unknown, name: DomConstructorName): value is T => {
  for (const context of getDomContexts(value)) {
    const ctor = (context as Record<DomConstructorName, unknown>)[name]
    if (typeof ctor === 'function' && value instanceof ctor) {
      return true
    }
  }
  return false
}

const hasOwnerDocument = (value: unknown): value is ParentNode & { ownerDocument: Document } =>
  !!value &&
  (typeof value === 'object' || typeof value === 'function') &&
  'ownerDocument' in value &&
  !!(value as { ownerDocument?: Document | null }).ownerDocument

const isElementNode = (value: unknown): value is Element =>
  isDomInstance<Element>(value, 'Element') || isDomInstance<HTMLElement>(value, 'HTMLElement')

const isHTMLElementNode = (value: unknown): value is HTMLElement =>
  isDomInstance<HTMLElement>(value, 'HTMLElement')

const isHTMLInputElementNode = (value: unknown): value is HTMLInputElement =>
  isDomInstance<HTMLInputElement>(value, 'HTMLInputElement')

const isHTMLSelectElementNode = (value: unknown): value is HTMLSelectElement =>
  isDomInstance<HTMLSelectElement>(value, 'HTMLSelectElement')

const isHTMLTextAreaElementNode = (value: unknown): value is HTMLTextAreaElement =>
  isDomInstance<HTMLTextAreaElement>(value, 'HTMLTextAreaElement')

const isTextEntryElement = (value: unknown): value is HTMLInputElement | HTMLTextAreaElement =>
  isHTMLInputElementNode(value) || isHTMLTextAreaElementNode(value)

const isHTMLAnchorElementNode = (value: unknown): value is HTMLAnchorElement =>
  isDomInstance<HTMLAnchorElement>(value, 'HTMLAnchorElement')

const isHTMLFormElementNode = (value: unknown): value is HTMLFormElement =>
  isDomInstance<HTMLFormElement>(value, 'HTMLFormElement')

interface CleanupSlot {
  callbacks: CleanupCallback[]
}

interface ComponentState {
  active: boolean
  activateModeOnFlush?: 'patch' | 'replace'
  didMount: boolean
  end?: Comment
  id: string
  mountCleanupSlots: CleanupSlot[]
  optimizedRoot?: boolean
  parentId: string | null
  prefersEffectOnlyLocalSignalWrites?: boolean
  props: unknown
  projectionSlots: Record<string, number> | null
  rawProps?: Record<string, unknown> | null
  renderEffectCleanupSlot: CleanupSlot
  reuseExistingDomOnActivate?: boolean
  reuseProjectionSlotDomOnActivate?: boolean
  scopeId: string
  signalIds: string[]
  start?: Comment
  symbol: string
  suspensePromise?: Promise<unknown> | null
  visibleCount: number
  watchCount: number
}

interface RenderFrame {
  childCursor: number
  component: ComponentState
  container: RuntimeContainer
  effectCleanupSlot: CleanupSlot
  insertCursor: number
  mountCallbacks: Array<() => void>
  projectionState: {
    counters: Map<string, number>
    reuseExistingDom: boolean
    reuseProjectionSlotDom: boolean
  }
  visitedDescendants: Set<string>
  mode: 'client' | 'ssr'
  scopedStyles: ScopedStyleEntry[]
  signalCursor: number
  visibleCursor: number
  watchCursor: number
}

export interface ClientInsertOwner {
  childIndex: number
  componentId: string
  projectionCounters: Array<[string, number]>
}

interface ScopedStyleEntry {
  attributes: Record<string, unknown>
  cssText: string
}

interface RouterEventState {
  originalPreventDefault: () => void
  routerPrevented: boolean
  userPrevented: boolean
}

interface RouterState {
  currentPath: { value: string }
  currentRoute: LoadedRoute | null
  currentUrl: { value: string }
  defaultTitle: string
  isNavigating: { value: boolean }
  loadedRoutes: Map<string, LoadedRoute>
  location: RouteLocation
  manifest: RouteManifest
  navigate: Navigate
  prefetchedLoaders: Map<string, Map<string, LoaderSnapshot>>
  routeModuleBusts: Map<string, number>
  routePrefetches: Map<string, Promise<RoutePrefetchResult>>
  sequence: number
}

export interface RuntimeContainer {
  actions: Map<string, unknown>
  actionStates: Map<
    string,
    {
      error: unknown
      input: unknown
      result: unknown
    }
  >
  components: Map<string, ComponentState>
  dirty: Set<string>
  dirtyFlushQueued: boolean
  doc?: Document
  eventDispatchPromise: Promise<void> | null
  id: string
  imports: Map<string, Promise<RuntimeSymbolModule>>
  interactivePrefetchCheckQueued: boolean
  loaderStates: Map<
    string,
    {
      data: unknown
      error: unknown
      loaded: boolean
    }
  >
  loaders: Map<string, unknown>
  nextComponentId: number
  nextElementId: number
  nextScopeId: number
  nextSignalId: number
  pendingSuspensePromises: Set<Promise<unknown>>
  resumeReadyPromise: Promise<void> | null
  rootChildCursor: number
  rootElement?: HTMLElement
  router: RouterState | null
  asyncSignalStates: Map<string, unknown>
  asyncSignalSnapshotCache: Map<string, unknown>
  atoms: WeakMap<object, string>
  nextAtomId: number
  scopes: Map<string, SerializedValue[]>
  signals: Map<string, SignalRecord>
  symbols: Map<string, string>
  visibilityListenersCleanup: (() => void) | null
  visibilityCheckQueued: boolean
  visibles: Map<string, VisibleState>
  watches: Map<string, WatchState>
}

interface RuntimeSymbolModule {
  default: (scope: unknown[], propsOrArg?: unknown, ...args: unknown[]) => unknown
}

interface ReactiveEffect {
  fn: () => void
  signals: Set<SignalRecord>
}

const COMPONENT_BOUNDARY_PROPS_CHANGED = Symbol.for('eclipsa.component-boundary-props-changed')
const COMPONENT_BOUNDARY_SYMBOL_CHANGED = Symbol.for('eclipsa.component-boundary-symbol-changed')

const isMissingGeneratedScopeReferenceError = (error: unknown): error is ReferenceError =>
  error instanceof ReferenceError && /\b__scope\b/.test(error.message)

const toRuntimeError = (error: unknown) =>
  error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error))

const areShallowEqualRenderProps = (
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
) => {
  if (previous === next) {
    return true
  }
  if (!previous || !next) {
    return !previous && !next
  }

  const previousKeys = Object.keys(previous)
  const nextKeys = Object.keys(next)
  if (previousKeys.length !== nextKeys.length) {
    return false
  }

  for (const key of previousKeys) {
    if (!Object.hasOwn(next, key) || !Object.is(previous[key], next[key])) {
      return false
    }
  }

  for (const hiddenKey of [ROUTE_PARAMS_PROP, ROUTE_ERROR_PROP] as const) {
    const previousHas = Object.hasOwn(previous, hiddenKey)
    const nextHas = Object.hasOwn(next, hiddenKey)
    if (previousHas !== nextHas) {
      return false
    }
    if (previousHas && !Object.is(previous[hiddenKey], next[hiddenKey])) {
      return false
    }
  }

  return true
}

const wrapGeneratedScopeReferenceError = (
  error: unknown,
  context: {
    componentId?: string
    phase: string
    symbolId?: string
  },
) => {
  const baseError = toRuntimeError(error)
  if (!isMissingGeneratedScopeReferenceError(baseError)) {
    return baseError
  }

  const location = [
    context.componentId ? `component "${context.componentId}"` : null,
    context.symbolId ? `symbol "${context.symbolId}"` : null,
  ]
    .filter(Boolean)
    .join(', ')

  const wrapped = new Error(
    `Eclipsa runtime failed while ${context.phase}${location ? ` ${location}` : ''}. The generated resumable symbol referenced "__scope" outside its valid scope. This usually means a same-file helper was transformed incorrectly during symbol compilation. Inline that helper into the component as a workaround. Original error: ${baseError.message}`,
    { cause: baseError },
  )
  wrapped.name = 'EclipsaRuntimeError'
  return wrapped
}

type WatchDependency = { value: unknown } | (() => unknown)
type EffectOptions = {
  dependencies?: WatchDependency[]
  errorLabel?: string
  untracked?: boolean
}
type WatchMode = 'dynamic' | 'explicit'
type RouteRenderer = (props: unknown) => unknown

interface LoadedRouteModule {
  metadata: RouteMetadataExport | null
  renderer: RouteRenderer
  symbol: string | null
  url: string
}

interface LoadedRoute {
  entry: RouteModuleManifest
  error: unknown
  layouts: LoadedRouteModule[]
  params: RouteParams
  pathname: string
  page: LoadedRouteModule
  render: RouteRenderer
}

interface RoutePreflightSuccess {
  ok: true
}

interface RoutePreflightRedirect {
  location: string
  ok: false
}

interface RoutePreflightDocumentFallback {
  document: true
  ok: false
}

type RoutePreflightResult =
  | RoutePreflightSuccess
  | RoutePreflightRedirect
  | RoutePreflightDocumentFallback

interface RouteDataSuccess {
  finalHref: string
  finalPathname: string
  kind: 'page' | 'not-found'
  loaders: Record<string, ResumeLoaderPayload>
  ok: true
}

interface RouteDataRedirect {
  location: string
  ok: false
}

interface RouteDataDocumentFallback {
  document: true
  ok: false
}

type RouteDataResponse = RouteDataSuccess | RouteDataRedirect | RouteDataDocumentFallback
type RoutePrefetchResult = RouteDataResponse

interface RouteSlotValue {
  __eclipsa_type: typeof ROUTE_SLOT_TYPE
  pathname: string
  startLayoutIndex: number
}

interface RouteSlotCarrier extends RouteSlotValue {
  [ROUTE_SLOT_ROUTE_KEY]?: LoadedRoute
}

interface ProjectionSlotValue {
  __eclipsa_type: typeof PROJECTION_SLOT_TYPE
  componentId: string
  name: string
  occurrence: number
  source: unknown
}

interface WatchState {
  cleanupSlot: CleanupSlot
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

interface VisibleState {
  cleanupSlot: CleanupSlot
  componentId: string
  done: boolean
  id: string
  pending: Promise<void> | null
  run: (() => void | Promise<void>) | null
  scopeId: string
  symbol: string
}

interface PendingLinkNavigation {
  href: string
  replace: boolean
  state: RouterEventState
}

interface PendingResumeLinkNavigation {
  href: string
  replace: boolean
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

interface RenderComponentTypeRef {
  scopeId: string
  symbol: string
}

interface ForValue<T = unknown> {
  __e_for: true
  arr: readonly T[]
  fallback?: JSX.Element
  fn: (e: T, i: number) => JSX.Element
  key?: (e: T, i: number) => string | number | symbol
}

interface ShowValue<T = unknown> {
  __e_show: true
  children: JSX.Element | ((value: T) => JSX.Element)
  fallback?: JSX.Element | ((value: T) => JSX.Element)
  when: T
}

const resolvedRuntimeSymbols = new WeakMap<RuntimeContainer, Map<string, RuntimeSymbolModule>>()
const managedElementAttributes = new WeakMap<Element, Set<string>>()
const listNodeChildren = (
  node: { childNodes?: Iterable<Node> | ArrayLike<Node> } | null | undefined,
) => Array.from((node?.childNodes ?? []) as Iterable<Node> | ArrayLike<Node>)

const getElementAttributeNames = (element: Element): string[] => {
  const withGetAttributeNames = element as Element & { getAttributeNames?: () => string[] }
  if (typeof withGetAttributeNames.getAttributeNames === 'function') {
    return withGetAttributeNames.getAttributeNames.call(element)
  }

  const attributes = (
    element as Element & {
      attributes?: Map<string, string> | ArrayLike<Attr | { name?: string }>
    }
  ).attributes
  if (attributes instanceof Map) {
    return [...attributes.keys()]
  }
  if (attributes && typeof attributes.length === 'number') {
    const names: string[] = []
    for (let index = 0; index < attributes.length; index += 1) {
      const attribute = attributes[index]
      if (attribute && typeof attribute === 'object' && 'name' in attribute) {
        const name = attribute.name
        if (typeof name === 'string') {
          names.push(name)
        }
      }
    }
    return names
  }

  return []
}

const hasElementAttribute = (element: Element, name: string): boolean | null => {
  const withHasAttribute = element as Element & { hasAttribute?: (name: string) => boolean }
  if (typeof withHasAttribute.hasAttribute === 'function') {
    return withHasAttribute.hasAttribute.call(element, name)
  }

  const withGetAttribute = element as Element & { getAttribute?: (name: string) => string | null }
  if (typeof withGetAttribute.getAttribute === 'function') {
    return withGetAttribute.getAttribute.call(element, name) !== null
  }

  const attributes = (element as Element & { attributes?: Map<string, string> }).attributes
  if (attributes instanceof Map) {
    return attributes.has(name)
  }

  return null
}
const insertMarkerNodeCounts = new WeakMap<Comment, number>()

const getResolvedRuntimeSymbols = (container: RuntimeContainer) => {
  const existing = resolvedRuntimeSymbols.get(container)
  if (existing) {
    return existing
  }
  const created = new Map<string, RuntimeSymbolModule>()
  resolvedRuntimeSymbols.set(container, created)
  return created
}

export const invalidateRuntimeSymbolCaches = (
  container: RuntimeContainer,
  symbolIds: Iterable<string>,
) => {
  const resolved = getResolvedRuntimeSymbols(container)
  for (const symbolId of symbolIds) {
    container.imports.delete(symbolId)
    resolved.delete(symbolId)
  }
}

const cloneManagedAttributeSnapshot = (element: Element) =>
  new Set(getElementAttributeNames(element))

const replaceManagedAttributeSnapshot = (element: Element, names: Iterable<string>) => {
  managedElementAttributes.set(element, new Set(names))
}

const getManagedAttributeSnapshot = (element: Element) =>
  managedElementAttributes.get(element) ?? null

export const syncManagedAttributeSnapshot = (element: Element, name: string) => {
  const snapshot = getManagedAttributeSnapshot(element) ?? new Set<string>()
  const hasAttribute = hasElementAttribute(element, name)
  if (hasAttribute === true) {
    snapshot.add(name)
  } else if (hasAttribute === false) {
    snapshot.delete(name)
  } else {
    snapshot.add(name)
  }
  replaceManagedAttributeSnapshot(element, snapshot)
}

export const rememberManagedAttributesForNode = (node: Node | null | undefined) => {
  if (!node) {
    return
  }

  const visit = (current: Node) => {
    if (isElementNode(current)) {
      replaceManagedAttributeSnapshot(current, cloneManagedAttributeSnapshot(current))
    }
    for (const child of listNodeChildren(current)) {
      visit(child)
    }
  }

  visit(node)
}

export const rememberManagedAttributesForNodes = (nodes: Iterable<Node>) => {
  for (const node of nodes) {
    rememberManagedAttributesForNode(node)
  }
}

export const rememberInsertMarkerRange = (
  marker: Node | null | undefined,
  nodes: Iterable<Node>,
) => {
  if (!(typeof Comment !== 'undefined' ? marker instanceof Comment : marker?.nodeType === 8)) {
    return
  }

  let count = 0
  for (const _node of nodes) {
    count += 1
  }
  insertMarkerNodeCounts.set(marker as Comment, count)
}

export const getRememberedInsertMarkerNodeCount = (marker: Comment | null | undefined) =>
  marker ? (insertMarkerNodeCounts.get(marker) ?? 0) : 0

const withResumeHmrTimestamp = (url: string, timestamp: number) => {
  const parsed = new URL(url, 'http://localhost')
  parsed.searchParams.set('t', timestamp.toString())
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

const canBustRuntimeSymbolUrl = (url: string) => parseSymbolIdFromUrl(url) !== null

export const bustRuntimeSymbolUrls = (
  container: RuntimeContainer,
  symbolIds: Iterable<string>,
  timestamp: number,
) => {
  for (const symbolId of symbolIds) {
    const current = container.symbols.get(symbolId)
    if (!current || !canBustRuntimeSymbolUrl(current)) {
      continue
    }
    container.symbols.set(symbolId, withResumeHmrTimestamp(current, timestamp))
  }
}

const isRenderObject = (value: unknown): value is RenderObject =>
  typeof value === 'object' && value !== null && 'type' in value && 'props' in value

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

const getContextValueStack = (): RuntimeContextValue[] => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[CONTEXT_VALUE_STACK_KEY]
  if (Array.isArray(existing)) {
    return existing as RuntimeContextValue[]
  }
  const created: RuntimeContextValue[] = []
  globalRecord[CONTEXT_VALUE_STACK_KEY] = created
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

const getAsyncSignalSnapshotCache = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY]
  if (existing instanceof Map) {
    return existing as Map<string, unknown>
  }
  const created = new Map<string, unknown>()
  globalRecord[ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY] = created
  return created
}

export const readAsyncSignalSnapshot = (
  id: string,
  container: RuntimeContainer | null = getCurrentContainer(),
) =>
  container?.asyncSignalStates.get(id) ??
  container?.asyncSignalSnapshotCache.get(id) ??
  getAsyncSignalSnapshotCache().get(id)

export const writeAsyncSignalSnapshot = (
  id: string,
  value: unknown,
  container: RuntimeContainer | null = getCurrentContainer(),
) => {
  container?.asyncSignalStates.set(id, value)
  container?.asyncSignalSnapshotCache.set(id, value)
  if (!container) {
    getAsyncSignalSnapshotCache().set(id, value)
  }
}

export const clearAsyncSignalSnapshot = (
  id: string,
  container: RuntimeContainer | null = getCurrentContainer(),
) => {
  container?.asyncSignalStates.delete(id)
  container?.asyncSignalSnapshotCache.delete(id)
  if (!container) {
    getAsyncSignalSnapshotCache().delete(id)
  }
}

const getCurrentFrame = (): RenderFrame | null => {
  const stack = getFrameStack()
  return stack.length > 0 ? stack[stack.length - 1] : null
}

export const shouldReconnectDetachedInsertMarkers = (container: RuntimeContainer | null) => {
  const frame = getCurrentFrame()
  if (!container || !frame || frame.container !== container) {
    return true
  }
  return frame.projectionState.reuseExistingDom
}

const hasScopedStyles = (frame: RenderFrame | null) => !!frame && frame.scopedStyles.length > 0

const getScopedStyleRootSelector = (scopeId: string) =>
  `[${SCOPED_STYLE_ATTR}="${escapeAttr(scopeId)}"]`

const wrapScopedStyleCss = (scopeId: string, cssText: string) =>
  `@scope (${getScopedStyleRootSelector(scopeId)}) {\n${cssText}\n}`

const renderScopedStyleString = (scopeId: string, style: ScopedStyleEntry) => {
  const attrParts = Object.entries(style.attributes)
    .filter(([, value]) => value !== false && value !== undefined && value !== null)
    .map(([name, value]) => (value === true ? name : `${name}="${escapeAttr(String(value))}"`))
  const attrs = attrParts.length > 0 ? ` ${attrParts.join(' ')}` : ''
  return `<style${attrs}>${escapeText(wrapScopedStyleCss(scopeId, style.cssText))}</style>`
}

const renderScopedStyleNode = (
  container: RuntimeContainer,
  scopeId: string,
  style: ScopedStyleEntry,
) => {
  const element = createElementNode(container.doc!, 'style')
  for (const [name, value] of Object.entries(style.attributes)) {
    if (value === false || value === undefined || value === null) {
      continue
    }
    if (value === true) {
      element.setAttribute(name, '')
      continue
    }
    element.setAttribute(name, String(value))
  }
  element.appendChild(container.doc!.createTextNode(wrapScopedStyleCss(scopeId, style.cssText)))
  return element
}

const renderFrameScopedStylesToString = (frame: RenderFrame) =>
  frame.scopedStyles
    .map((style) => renderScopedStyleString(frame.component.scopeId, style))
    .join('')

const renderFrameScopedStylesToNodes = (frame: RenderFrame, container: RuntimeContainer) =>
  frame.scopedStyles.map((style) =>
    renderScopedStyleNode(container, frame.component.scopeId, style),
  )

export const registerRuntimeScopedStyle = (
  cssText: string,
  attributes: Record<string, unknown> = {},
): void => {
  const frame = getCurrentFrame()
  if (!frame || frame.component.id === ROOT_COMPONENT_ID) {
    throw new Error('useStyleScoped() can only be used while rendering a component.')
  }

  if (cssText.length === 0) {
    return
  }

  const existing = frame.scopedStyles.find(
    (entry) =>
      entry.cssText === cssText && JSON.stringify(entry.attributes) === JSON.stringify(attributes),
  )
  if (existing) {
    return
  }

  frame.scopedStyles.push({
    attributes: { ...attributes },
    cssText,
  })
}

const normalizeRoutePath = (pathname: string) => {
  const normalizedPath = pathname.trim() || '/'
  const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1)
  }
  return withLeadingSlash
}

const parseLocationHref = (href: string) => new URL(href, 'http://localhost')

const createStandaloneLocation = (): RouteLocation => ({
  get hash() {
    return typeof window === 'undefined' ? '' : window.location.hash
  },
  get href() {
    return typeof window === 'undefined' ? '/' : window.location.href
  },
  get pathname() {
    return typeof window === 'undefined' ? '/' : normalizeRoutePath(window.location.pathname)
  },
  get search() {
    return typeof window === 'undefined' ? '' : window.location.search
  },
})

const createRouterLocation = (router: RouterState): RouteLocation => ({
  get hash() {
    return parseLocationHref(router.currentUrl.value).hash
  },
  get href() {
    return router.currentUrl.value
  },
  get pathname() {
    return normalizeRoutePath(parseLocationHref(router.currentUrl.value).pathname)
  },
  get search() {
    return parseLocationHref(router.currentUrl.value).search
  },
})

const EMPTY_ROUTE_PARAMS = Object.freeze({}) as RouteParams

const splitRoutePath = (pathname: string) => normalizeRoutePath(pathname).split('/').filter(Boolean)

const matchRouteSegments = (
  segments: RouteModuleManifest['segments'],
  pathnameSegments: string[],
  routeIndex = 0,
  pathIndex = 0,
  params: RouteParams = {},
): RouteParams | null => {
  if (routeIndex >= segments.length) {
    return pathIndex >= pathnameSegments.length ? params : null
  }

  const segment = segments[routeIndex]!
  switch (segment.kind) {
    case 'static':
      if (pathnameSegments[pathIndex] !== segment.value) {
        return null
      }
      return matchRouteSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, params)
    case 'required':
      if (pathIndex >= pathnameSegments.length) {
        return null
      }
      return matchRouteSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, {
        ...params,
        [segment.value]: pathnameSegments[pathIndex],
      })
    case 'optional': {
      const consumed =
        pathIndex < pathnameSegments.length
          ? matchRouteSegments(segments, pathnameSegments, routeIndex + 1, pathIndex + 1, {
              ...params,
              [segment.value]: pathnameSegments[pathIndex],
            })
          : null
      if (consumed) {
        return consumed
      }
      return matchRouteSegments(segments, pathnameSegments, routeIndex + 1, pathIndex, {
        ...params,
        [segment.value]: undefined,
      })
    }
    case 'rest': {
      const rest = pathnameSegments.slice(pathIndex)
      if (rest.length === 0) {
        return null
      }
      return matchRouteSegments(
        segments,
        pathnameSegments,
        segments.length,
        pathnameSegments.length,
        {
          ...params,
          [segment.value]: rest,
        },
      )
    }
  }
}

const matchRouteManifest = (manifest: RouteManifest, pathname: string) => {
  const normalizedPath = normalizeRoutePath(pathname)
  const pathnameSegments = splitRoutePath(normalizedPath)
  for (const entry of manifest) {
    const params = matchRouteSegments(entry.segments, pathnameSegments)
    if (params) {
      return {
        entry,
        params,
        pathname: normalizedPath,
      }
    }
  }
  return null
}

const scoreSpecialManifestEntry = (entry: RouteModuleManifest, pathname: string) => {
  const pathnameSegments = splitRoutePath(pathname)
  let score = 0
  for (
    let index = 0;
    index < entry.segments.length && index < pathnameSegments.length;
    index += 1
  ) {
    const segment = entry.segments[index]!
    const pathnameSegment = pathnameSegments[index]
    if (segment.kind === 'static') {
      if (segment.value !== pathnameSegment) {
        break
      }
      score += 10
      continue
    }
    score += segment.kind === 'rest' ? 1 : 2
    if (segment.kind === 'rest') {
      break
    }
  }
  return score
}

const findSpecialManifestEntry = (
  manifest: RouteManifest,
  pathname: string,
  kind: 'error' | 'notFound',
) => {
  const matched = matchRouteManifest(manifest, pathname)
  if (matched?.entry[kind]) {
    return matched
  }

  let best: ReturnType<typeof matchRouteManifest> = null
  let bestScore = -1
  for (const entry of manifest) {
    if (!entry[kind]) {
      continue
    }
    const score = scoreSpecialManifestEntry(entry, pathname)
    if (score > bestScore) {
      best = {
        entry,
        params: EMPTY_ROUTE_PARAMS,
        pathname: normalizeRoutePath(pathname),
      }
      bestScore = score
    }
  }
  return best
}

const routeCacheKey = (
  pathname: string,
  variant: 'page' | 'loading' | 'error' | 'not-found' = 'page',
) => `${normalizeRoutePath(pathname)}::${variant}`

const routePrefetchKey = (url: URL) => `${normalizeRoutePath(url.pathname)}${url.search}`
const isLoaderSignalId = (id: string) => id.startsWith('$loader:')

let currentEffect: ReactiveEffect | null = null
let currentCleanupSlot: CleanupSlot | null = null

const withoutTrackedEffect = <T>(fn: () => T): T => {
  const previous = currentEffect
  currentEffect = null
  try {
    return fn()
  } finally {
    currentEffect = previous
  }
}

const createCleanupSlot = (): CleanupSlot => ({
  callbacks: [],
})

const withCleanupSlot = <T>(slot: CleanupSlot, fn: () => T): T => {
  const previous = currentCleanupSlot
  currentCleanupSlot = slot
  try {
    return fn()
  } finally {
    currentCleanupSlot = previous
  }
}

const disposeCleanupSlot = (slot: CleanupSlot | null | undefined) => {
  if (!slot || slot.callbacks.length === 0) {
    return
  }

  const callbacks = [...slot.callbacks].reverse()
  slot.callbacks.length = 0
  let firstError: unknown = null
  const previous = currentCleanupSlot
  currentCleanupSlot = null

  try {
    for (const callback of callbacks) {
      try {
        withoutTrackedEffect(callback)
      } catch (error) {
        firstError ??= error
      }
    }
  } finally {
    currentCleanupSlot = previous
  }

  if (firstError) {
    throw firstError
  }
}

const resetComponentRenderEffects = (component: ComponentState) => {
  disposeCleanupSlot(component.renderEffectCleanupSlot)
  component.renderEffectCleanupSlot = createCleanupSlot()
}

const syncEffectOnlyLocalSignalPreference = (component: ComponentState) => {
  component.prefersEffectOnlyLocalSignalWrites = component.optimizedRoot === true
}

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

const runWithoutDependencyTracking = <T>(fn: () => T): T => {
  const previousEffect = currentEffect
  currentEffect = null
  try {
    return fn()
  } finally {
    currentEffect = previousEffect
  }
}

const trackWatchDependencies = (dependencies: WatchDependency[], errorLabel = 'useWatch') => {
  for (const dependency of dependencies) {
    if (typeof dependency === 'function') {
      dependency()
      continue
    }
    const signalMeta = getSignalMeta(dependency)
    if (!signalMeta) {
      throw new TypeError(`${errorLabel} dependencies must be signals or getter functions.`)
    }
    void dependency.value
  }
}

const runWatchCallback = (
  effect: ReactiveEffect,
  cleanupSlot: CleanupSlot,
  fn: () => void,
  dependencies?: WatchDependency[],
) => {
  disposeCleanupSlot(cleanupSlot)
  if (!dependencies) {
    collectTrackedDependencies(effect, () => {
      withCleanupSlot(cleanupSlot, fn)
    })
    return
  }
  collectTrackedDependencies(effect, () => {
    trackWatchDependencies(dependencies)
  })
  withCleanupSlot(cleanupSlot, fn)
}

const createLocalWatchRunner =
  (
    effect: ReactiveEffect,
    cleanupSlot: CleanupSlot,
    fn: () => void,
    dependencies?: WatchDependency[],
  ) =>
  () => {
    runWatchCallback(effect, cleanupSlot, fn, dependencies)
  }

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const isProjectionSlot = (value: unknown): value is ProjectionSlotValue =>
  isPlainObject(value) && value.__eclipsa_type === PROJECTION_SLOT_TYPE

const createProjectionSlot = (
  componentId: string,
  name: string,
  occurrence: number,
  source: unknown,
): ProjectionSlotValue => ({
  __eclipsa_type: PROJECTION_SLOT_TYPE,
  componentId,
  name,
  occurrence,
  source,
})

const encodeProjectionSlotName = (value: string) => encodeURIComponent(value)
const decodeProjectionSlotName = (value: string) => decodeURIComponent(value)
const encodeKeyedRangeToken = (value: string | number | symbol) => encodeURIComponent(String(value))
const decodeKeyedRangeToken = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const createProjectionSlotMarker = (
  componentId: string,
  name: string,
  occurrence: number,
  kind: 'start' | 'end',
) => `ec:s:${componentId}:${encodeProjectionSlotName(name)}:${occurrence}:${kind}`
const createKeyedRangeMarker = (value: string | number | symbol, kind: 'start' | 'end') =>
  `ec:k:${encodeKeyedRangeToken(value)}:${kind}`

const COMPONENT_BOUNDARY_MARKER_REGEX = /^ec:c:(.+):(start|end)$/
const INSERT_MARKER_REGEX = /^ec:i:(.+)$/
const KEYED_RANGE_MARKER_REGEX = /^ec:k:([^:]+):(start|end)$/
const PROJECTION_SLOT_MARKER_REGEX = /^ec:s:([^:]+):([^:]+):(\d+):(start|end)$/

const parseComponentBoundaryMarker = (value: string) => {
  const matched = value.match(COMPONENT_BOUNDARY_MARKER_REGEX)
  if (!matched) {
    return null
  }
  return {
    id: matched[1],
    kind: matched[2] as 'start' | 'end',
  }
}

const parseProjectionSlotMarker = (value: string) => {
  const matched = value.match(PROJECTION_SLOT_MARKER_REGEX)
  if (!matched) {
    return null
  }
  return {
    componentId: matched[1],
    kind: matched[4] as 'start' | 'end',
    key: `${matched[1]}:${matched[2]}:${matched[3]}`,
    name: decodeProjectionSlotName(matched[2]),
    occurrence: Number(matched[3]),
  }
}

const parseKeyedRangeMarker = (value: string) => {
  const matched = value.match(KEYED_RANGE_MARKER_REGEX)
  if (!matched) {
    return null
  }
  return {
    key: decodeKeyedRangeToken(matched[1]!),
    kind: matched[2] as 'start' | 'end',
  }
}

const parseInsertMarker = (value: string) => {
  const matched = value.match(INSERT_MARKER_REGEX)
  if (!matched) {
    return null
  }
  return {
    key: matched[1],
  }
}

const getRenderComponentTypeRef = (value: unknown): RenderComponentTypeRef | null => {
  if (typeof value !== 'function') {
    return null
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[RENDER_COMPONENT_TYPE_KEY] as
      | RenderComponentTypeRef
      | undefined) ?? null
  )
}

const createMaterializedRenderComponentType = (
  container: RuntimeContainer,
  symbol: string,
  scopeId: string,
) => {
  const component = __eclipsaComponent(
    ((props: unknown) => {
      const module = getResolvedRuntimeSymbols(container).get(symbol)
      if (!module) {
        throw new Error(`Missing preloaded render component symbol ${symbol}.`)
      }
      return module.default(materializeScope(container, scopeId), props)
    }) as Component,
    symbol,
    () => materializeScope(container, scopeId),
  )
  Object.defineProperty(component, RENDER_COMPONENT_TYPE_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      scopeId,
      symbol,
    } satisfies RenderComponentTypeRef,
    writable: true,
  })
  return component
}

const serializeRenderObjectReference = (
  container: RuntimeContainer,
  value: RenderObject,
): SerializedReference => {
  if (typeof value.type === 'function' && !getComponentMeta(value.type)) {
    const resolved = resolveRenderable((value.type as Component)(value.props))
    if (!isRenderObject(resolved)) {
      throw new TypeError('Only resumable component render objects can be serialized.')
    }
    return serializeRenderObjectReference(container, resolved)
  }

  const evaluatedProps = evaluateProps(value.props)
  const key = value.key ?? null
  const isStatic = value.isStatic === true
  const metadata = value.metadata ?? null

  if (typeof value.type === 'string') {
    return {
      __eclipsa_type: 'ref',
      data: [
        'element',
        value.type,
        null,
        serializeRuntimeValue(container, evaluatedProps),
        serializeRuntimeValue(container, key),
        isStatic,
        serializeRuntimeValue(container, metadata),
      ],
      kind: RENDER_REFERENCE_KIND,
      token: 'jsx',
    }
  }

  const meta = getComponentMeta(value.type)
  if (!meta) {
    throw new TypeError('Only resumable component render objects can be serialized.')
  }

  return {
    __eclipsa_type: 'ref',
    data: [
      'component',
      meta.symbol,
      registerScope(container, meta.captures()),
      serializeRuntimeValue(container, evaluatedProps),
      serializeRuntimeValue(container, key),
      isStatic,
      serializeRuntimeValue(container, metadata),
    ],
    kind: RENDER_REFERENCE_KIND,
    token: 'jsx',
  }
}

const deserializeRenderObjectReference = (
  container: RuntimeContainer,
  data: SerializedValue | undefined,
): RenderObject => {
  if (!Array.isArray(data) || data.length !== 7) {
    throw new TypeError('Render references require a seven-part payload.')
  }

  const [variant, typeValue, scopeValue, propsValue, keyValue, isStaticValue, metadataValue] = data
  if (variant !== 'element' && variant !== 'component') {
    throw new TypeError(`Unsupported render reference variant "${String(variant)}".`)
  }
  if (typeof isStaticValue !== 'boolean' && isStaticValue !== null && isStaticValue !== undefined) {
    throw new TypeError('Render references require a boolean static flag.')
  }
  const isStatic = isStaticValue === true

  const props = deserializeRuntimeValue(container, propsValue as SerializedValue)
  const key = deserializeRuntimeValue(container, keyValue as SerializedValue)
  const metadata = deserializeRuntimeValue(container, metadataValue as SerializedValue)

  if (!props || typeof props !== 'object') {
    throw new TypeError('Render references require object props.')
  }

  if (variant === 'element') {
    if (typeof typeValue !== 'string') {
      throw new TypeError('Element render references require a string tag name.')
    }
    return {
      isStatic,
      key: (key ?? undefined) as RenderObject['key'],
      metadata: (metadata ?? undefined) as RenderObject['metadata'],
      props: props as Record<string, unknown>,
      type: typeValue,
    }
  }

  if (typeof typeValue !== 'string' || typeof scopeValue !== 'string') {
    throw new TypeError('Component render references require a symbol id and scope id.')
  }

  return {
    isStatic,
    key: (key ?? undefined) as RenderObject['key'],
    metadata: (metadata ?? undefined) as RenderObject['metadata'],
    props: props as Record<string, unknown>,
    type: createMaterializedRenderComponentType(container, typeValue, scopeValue),
  }
}

const preloadResumableValue = async (
  container: RuntimeContainer,
  value: unknown,
  seen = new Set<unknown>(),
): Promise<void> => {
  if (value === null || value === undefined || value === false) {
    return
  }
  if (seen.has(value)) {
    return
  }
  if (typeof value === 'function') {
    const renderComponentRef = getRenderComponentTypeRef(value)
    if (!renderComponentRef) {
      return
    }
    seen.add(value)
    await loadSymbol(container, renderComponentRef.symbol)
    for (const capturedValue of materializeScope(container, renderComponentRef.scopeId)) {
      await preloadResumableValue(container, capturedValue, seen)
    }
    return
  }
  if (Array.isArray(value)) {
    seen.add(value)
    for (const entry of value) {
      await preloadResumableValue(container, entry, seen)
    }
    return
  }
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return
  }
  if (isProjectionSlot(value)) {
    return
  }
  if (isRenderObject(value)) {
    seen.add(value)
    await preloadResumableValue(container, value.type, seen)
    await preloadResumableValue(container, evaluateProps(value.props), seen)
    return
  }
  if (!isPlainObject(value)) {
    return
  }

  seen.add(value)
  for (const entry of Object.values(value)) {
    await preloadResumableValue(container, entry, seen)
  }
}

const serializeRuntimeValue = (container: RuntimeContainer, value: unknown): SerializedValue =>
  serializePublicValue(value, {
    serializeReference(candidate) {
      const signalMeta = getSignalMeta(candidate)
      if (signalMeta) {
        return {
          __eclipsa_type: 'ref',
          kind: 'signal',
          token: signalMeta.id,
        }
      }
      if (getNavigateMeta(candidate)) {
        return {
          __eclipsa_type: 'ref',
          kind: 'navigate',
          token: 'navigate',
        }
      }
      const actionMeta = getActionHandleMeta(candidate)
      if (actionMeta) {
        return {
          __eclipsa_type: 'ref',
          kind: 'action',
          token: actionMeta.id,
        }
      }
      const actionHookMeta = getActionHookMeta(candidate)
      if (actionHookMeta) {
        return {
          __eclipsa_type: 'ref',
          kind: 'action-hook',
          token: actionHookMeta.id,
        }
      }
      const loaderMeta = getLoaderHandleMeta(candidate)
      if (loaderMeta) {
        return {
          __eclipsa_type: 'ref',
          kind: 'loader',
          token: loaderMeta.id,
        }
      }
      const loaderHookMeta = getLoaderHookMeta(candidate)
      if (loaderHookMeta) {
        return {
          __eclipsa_type: 'ref',
          kind: 'loader-hook',
          token: loaderHookMeta.id,
        }
      }
      const contextReference = getRuntimeContextReference(candidate)
      if (contextReference) {
        return {
          __eclipsa_type: 'ref',
          data: serializeRuntimeValue(container, {
            defaultValue: contextReference.defaultValue,
            hasDefault: contextReference.hasDefault,
          }),
          kind: contextReference.kind,
          token: contextReference.id,
        }
      }
      if (isRouteSlot(candidate)) {
        return {
          __eclipsa_type: 'ref',
          data: serializePublicValue(candidate.startLayoutIndex),
          kind: 'route-slot',
          token: candidate.pathname,
        }
      }
      if (isProjectionSlot(candidate)) {
        return {
          __eclipsa_type: 'ref',
          data: serializeRuntimeValue(container, candidate.source),
          kind: PROJECTION_SLOT_TYPE,
          token: JSON.stringify([candidate.componentId, candidate.name, candidate.occurrence]),
        }
      }
      if (isRenderObject(candidate)) {
        return serializeRenderObjectReference(container, candidate)
      }
      const lazyMeta = getLazyMeta(candidate)
      if (lazyMeta) {
        return {
          __eclipsa_type: 'ref',
          data: lazyMeta.captures().map((entry) => serializeRuntimeValue(container, entry)),
          kind: 'symbol',
          token: lazyMeta.symbol,
        }
      }
      if (isElementNode(candidate)) {
        return {
          __eclipsa_type: 'ref',
          kind: 'dom',
          token: ensureRuntimeElementId(container, candidate),
        }
      }
      return null
    },
  })

const deserializeRuntimeValue = (container: RuntimeContainer, value: SerializedValue): unknown =>
  deserializePublicValue(value, {
    deserializeReference(reference) {
      if (reference.kind === 'navigate') {
        return ensureRouterState(container).navigate
      }
      if (reference.kind === 'action') {
        const action = container.actions.get(reference.token)
        if (!action) {
          throw new Error(`Missing action handle ${reference.token}.`)
        }
        return action
      }
      if (reference.kind === 'action-hook') {
        const actionHook = getRegisteredActionHook(reference.token)
        if (!actionHook) {
          throw new Error(`Missing action hook ${reference.token}.`)
        }
        return actionHook
      }
      if (reference.kind === 'loader') {
        const loader = container.loaders.get(reference.token)
        if (!loader) {
          throw new Error(`Missing loader handle ${reference.token}.`)
        }
        return loader
      }
      if (reference.kind === 'loader-hook') {
        const loaderHook = getRegisteredLoaderHook(reference.token)
        if (!loaderHook) {
          throw new Error(`Missing loader hook ${reference.token}.`)
        }
        return loaderHook
      }
      if (reference.kind === 'context' || reference.kind === 'context-provider') {
        const decoded =
          reference.data === undefined
            ? null
            : (deserializeRuntimeValue(container, reference.data as SerializedValue) as {
                defaultValue?: unknown
                hasDefault?: unknown
              } | null)
        const hasDefault = decoded?.hasDefault === true
        const defaultValue = hasDefault ? decoded?.defaultValue : undefined
        const descriptor = {
          defaultValue,
          hasDefault,
          id: reference.token,
        }
        return reference.kind === 'context'
          ? materializeRuntimeContext(descriptor)
          : materializeRuntimeContextProvider(descriptor)
      }
      if (reference.kind === 'route-slot') {
        const startLayoutIndex =
          reference.data === undefined ? 0 : deserializePublicValue(reference.data)
        if (typeof startLayoutIndex !== 'number' || !Number.isInteger(startLayoutIndex)) {
          throw new TypeError('Route slot references require an integer start layout index.')
        }
        return {
          __eclipsa_type: ROUTE_SLOT_TYPE,
          pathname: reference.token,
          startLayoutIndex,
        } satisfies RouteSlotValue
      }
      if (reference.kind === PROJECTION_SLOT_TYPE) {
        let componentId = ''
        let name = ''
        let occurrence = 0
        try {
          const parsed = JSON.parse(reference.token)
          if (
            !Array.isArray(parsed) ||
            parsed.length !== 3 ||
            typeof parsed[0] !== 'string' ||
            typeof parsed[1] !== 'string' ||
            typeof parsed[2] !== 'number'
          ) {
            throw new Error('invalid projection slot token')
          }
          componentId = parsed[0]
          name = parsed[1]
          occurrence = parsed[2]
        } catch {
          throw new TypeError(
            'Projection slot references require a component id, name, and occurrence.',
          )
        }
        return createProjectionSlot(
          componentId,
          name,
          occurrence,
          deserializeRuntimeValue(container, reference.data as SerializedValue),
        )
      }
      if (reference.kind === 'signal') {
        const record = container.signals.get(reference.token)
        if (!record) {
          throw new Error(`Missing signal ${reference.token}.`)
        }
        return record.handle
      }
      if (reference.kind === 'symbol') {
        if (!reference.data || !Array.isArray(reference.data)) {
          throw new TypeError('Symbol references require an encoded scope array.')
        }
        const scopeId = registerSerializedScope(container, reference.data)
        return materializeSymbolReference(container, reference.token, scopeId)
      }
      if (reference.kind === RENDER_REFERENCE_KIND) {
        return deserializeRenderObjectReference(container, reference.data)
      }
      if (reference.kind === 'dom') {
        const element = findRuntimeElement(container, reference.token)
        if (!element) {
          throw new Error(`Missing DOM reference ${reference.token}.`)
        }
        return element
      }
      throw new TypeError(`Unsupported runtime reference kind "${reference.kind}".`)
    },
  })

const findNextNumericId = (ids: Iterable<string>, prefix: string) => {
  let nextId = 0
  for (const id of ids) {
    if (!id.startsWith(prefix)) {
      continue
    }
    const suffix = id.slice(prefix.length)
    if (!/^\d+$/.test(suffix)) {
      continue
    }
    nextId = Math.max(nextId, Number(suffix) + 1)
  }
  return nextId
}

const getRefSignalId = (value: unknown) => getSignalMeta(value)?.id ?? null

const getBindableSignalId = (value: unknown) => getSignalMeta(value)?.id ?? null

export const syncRuntimeRefMarker = (element: Element, value: unknown) => {
  const signalId = getRefSignalId(value)
  if (signalId) {
    element.setAttribute(REF_SIGNAL_ATTR, signalId)
    syncManagedAttributeSnapshot(element, REF_SIGNAL_ATTR)
    return
  }
  element.removeAttribute(REF_SIGNAL_ATTR)
  syncManagedAttributeSnapshot(element, REF_SIGNAL_ATTR)
}

const readBindableSignalValue = (value: unknown) => {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') || !('value' in value)) {
    return undefined
  }
  return (value as { value: unknown }).value
}

export const assignRuntimeRef = (
  value: unknown,
  element: Element,
  container: RuntimeContainer | null = getCurrentContainer(),
) => {
  const signalMeta = getSignalMeta<Element | undefined>(value)
  if (!signalMeta) {
    return false
  }

  const record = container?.signals.get(signalMeta.id)
  if (record) {
    writeSignalValue(container, record, element)
    return true
  }

  signalMeta.set(element)
  return true
}

export const restoreSignalRefs = (container: RuntimeContainer, root: ParentNode) => {
  const assignElement = (element: Element) => {
    const signalId = element.getAttribute(REF_SIGNAL_ATTR)
    if (!signalId) {
      return
    }
    const record = container.signals.get(signalId)
    if (!record) {
      return
    }
    writeSignalValue(container, record, element)
  }

  if (isElementNode(root) && root.getAttribute(REF_SIGNAL_ATTR)) {
    assignElement(root)
  }

  const visitDescendants = (node: ParentNode) => {
    for (const child of listNodeChildren(node)) {
      if (!isElementNode(child)) {
        continue
      }
      if (child.getAttribute(REF_SIGNAL_ATTR)) {
        assignElement(child)
      }
      visitDescendants(child)
    }
  }

  visitDescendants(root)
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

const hasProjectionSlotValue = (props: Record<string, unknown>, name: string) =>
  Object.prototype.hasOwnProperty.call(props, name)

const shouldRenderProjectionSlotValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === false) {
    return false
  }
  if (isProjectionSlot(value)) {
    return false
  }
  if (Array.isArray(value)) {
    return value.some((entry) => shouldRenderProjectionSlotValue(entry))
  }
  if (typeof value === 'function') {
    return true
  }
  return typeof value === 'object'
}

const shouldPreserveProjectionSlotDom = (value: unknown): boolean => {
  if (value === null || value === undefined || value === false) {
    return false
  }
  if (isProjectionSlot(value) || isRouteSlot(value)) {
    return false
  }
  if (Array.isArray(value)) {
    return value.some((entry) => shouldPreserveProjectionSlotDom(entry))
  }
  if (typeof value === 'function') {
    return true
  }
  return typeof value === 'object'
}

const getComponentProjectionSlotProps = (component: ComponentState) => {
  if (component.rawProps && typeof component.rawProps === 'object') {
    return component.rawProps
  }
  return component.props && typeof component.props === 'object'
    ? (component.props as Record<string, unknown>)
    : null
}

const hasDynamicProjectionSlotDom = (component: ComponentState) => {
  if (!component.projectionSlots || Object.keys(component.projectionSlots).length === 0) {
    return false
  }

  const props = getComponentProjectionSlotProps(component)
  if (!props) {
    return false
  }

  return Object.keys(component.projectionSlots).some(
    (name) => hasProjectionSlotValue(props, name) && shouldPreserveProjectionSlotDom(props[name]),
  )
}

const createRenderProps = (
  componentId: string,
  meta: ComponentMeta,
  props: Record<string, unknown>,
): Record<string, unknown> => {
  const nextProps = Object.create(null) as Record<string, unknown>
  Object.defineProperties(nextProps, Object.getOwnPropertyDescriptors(props))

  if (!meta.projectionSlots || Object.keys(meta.projectionSlots).length === 0) {
    return nextProps
  }

  const counters = new Map<string, number>()

  for (const [name, totalOccurrences] of Object.entries(meta.projectionSlots)) {
    Object.defineProperty(nextProps, name, {
      configurable: true,
      enumerable: true,
      get() {
        if (!hasProjectionSlotValue(props, name)) {
          return undefined
        }
        const value = props[name]
        if (!shouldRenderProjectionSlotValue(value)) {
          return value
        }
        const current = counters.get(name) ?? 0
        counters.set(name, current + 1)
        const occurrence = totalOccurrences > 0 ? current % totalOccurrences : current
        return createProjectionSlot(componentId, name, occurrence, value)
      },
    })
  }

  return nextProps
}

const preloadComponentProps = async (
  container: RuntimeContainer,
  meta: ComponentMeta,
  props: unknown,
) => {
  if (!props || typeof props !== 'object') {
    await preloadResumableValue(container, props)
    return
  }

  if (!meta.projectionSlots) {
    await preloadResumableValue(container, props)
    return
  }

  const projectionNames = new Set(Object.keys(meta.projectionSlots))
  const entries: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (projectionNames.has(key)) {
      await preloadResumableValue(container, value)
      continue
    }
    entries[key] = value
  }
  await preloadResumableValue(container, entries)
}

const createContainer = (
  symbols: Record<string, string>,
  doc?: Document,
  asyncSignalSnapshotCache?: Map<string, unknown>,
): RuntimeContainer => ({
  actions: new Map(),
  actionStates: new Map(),
  asyncSignalStates: new Map(),
  asyncSignalSnapshotCache: asyncSignalSnapshotCache ?? new Map(),
  atoms: new WeakMap(),
  components: new Map(),
  dirty: new Set(),
  dirtyFlushQueued: false,
  doc,
  eventDispatchPromise: null,
  id: `rt${((globalThis as Record<PropertyKey, unknown>)[CONTAINER_ID_KEY] =
    (((globalThis as Record<PropertyKey, unknown>)[CONTAINER_ID_KEY] as number | undefined) ?? 0) +
    1)}`,
  imports: new Map(),
  interactivePrefetchCheckQueued: false,
  loaderStates: new Map(),
  loaders: new Map(),
  nextAtomId: 0,
  nextComponentId: 0,
  nextElementId: 0,
  nextScopeId: 0,
  nextSignalId: 0,
  pendingSuspensePromises: new Set(),
  resumeReadyPromise: null,
  rootChildCursor: 0,
  rootElement: doc?.body,
  router: null,
  scopes: new Map(),
  signals: new Map(),
  symbols: new Map(Object.entries(symbols)),
  visibilityCheckQueued: false,
  visibilityListenersCleanup: null,
  visibles: new Map(),
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
      writeSignalValue(container, record, value)
    },
  })
  setSignalMeta(handle, {
    get: () => record.value,
    id: record.id,
    set: (value) => {
      writeSignalValue(container, record, value)
    },
  } satisfies SignalMeta<T>)
  return handle
}

const isPrimitiveSignalValue = (value: unknown) =>
  value === null || (typeof value !== 'object' && typeof value !== 'function')

const didSignalValueChange = (previous: unknown, next: unknown) => {
  if (isPrimitiveSignalValue(previous) && isPrimitiveSignalValue(next)) {
    return !Object.is(previous, next)
  }

  return previous !== next
}

const writeSignalValue = <T>(
  container: RuntimeContainer | null,
  record: SignalRecord<T>,
  nextValue: T,
) => {
  if (!didSignalValueChange(record.value, nextValue)) {
    return false
  }

  record.value = nextValue
  notifySignalWrite(container, record)
  return true
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
  id === ROUTER_CURRENT_PATH_SIGNAL_ID ||
  id === ROUTER_CURRENT_URL_SIGNAL_ID ||
  id === ROUTER_IS_NAVIGATING_SIGNAL_ID

const isAtomSignalId = (id: string) => id.startsWith('a')

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

export const primeLocationState = (container: RuntimeContainer, href: string | URL) => {
  writeRouterLocation(ensureRouterState(container), href)
}

const recordSignalRead = (record: SignalRecord) => {
  if (currentEffect) {
    currentEffect.signals.add(record)
    record.effects.add(currentEffect)
    return
  }
  const frame = getCurrentFrame()
  if (!frame) {
    return
  }
  record.subscribers.add(frame.component.id)
}

const notifySignalWrite = (container: RuntimeContainer | null, record: SignalRecord) => {
  for (const effect of Array.from(record.effects)) {
    effect.fn()
  }
  if (!container) {
    return
  }
  for (const componentId of record.subscribers) {
    const component = container.components.get(componentId)
    if (!component?.start || !component.end) {
      continue
    }
    if (
      component.prefersEffectOnlyLocalSignalWrites &&
      component.signalIds.includes(record.id) &&
      record.effects.size > 0 &&
      !record.subscribers.has(component.id)
    ) {
      continue
    }
    const hasProjectionSlotDom = hasDynamicProjectionSlotDom(component)
    const nextActivateMode = hasProjectionSlotDom ? 'replace' : 'patch'
    component.active = false
    if (component.activateModeOnFlush !== 'replace') {
      component.activateModeOnFlush = nextActivateMode
    }
    component.reuseExistingDomOnActivate = !hasProjectionSlotDom
    component.reuseProjectionSlotDomOnActivate = !hasProjectionSlotDom
    container.dirty.add(component.id)
  }
  scheduleDirtyFlush(container)
}

const canFlushDirtyComponents = (container: RuntimeContainer) =>
  [...container.dirty].every((componentId) => {
    const component = container.components.get(componentId)
    return (
      !!component &&
      (container.imports.has(component.symbol) || container.symbols.has(component.symbol))
    )
  })

const scheduleDirtyFlush = (container: RuntimeContainer) => {
  if (
    container.dirty.size === 0 ||
    container.dirtyFlushQueued ||
    !canFlushDirtyComponents(container)
  ) {
    return
  }

  container.dirtyFlushQueued = true
  queueMicrotask(() => {
    const flushWhenReady = async () => {
      try {
        const pendingEvent = container.eventDispatchPromise
        if (pendingEvent) {
          await pendingEvent.catch(() => {})
        }
      } finally {
        container.dirtyFlushQueued = false
      }

      if (container.dirty.size === 0) {
        return
      }
      void flushDirtyComponents(container)
    }

    void flushWhenReady()
  })
}

const writeRouterLocation = (router: RouterState, href: string | URL) => {
  const url = href instanceof URL ? href : parseLocationHref(href)
  const nextPath = normalizeRoutePath(url.pathname)
  if (router.currentPath.value !== nextPath) {
    router.currentPath.value = nextPath
  }
  if (router.currentUrl.value !== url.href) {
    router.currentUrl.value = url.href
  }
}

const syncRouterLocationSilently = (container: RuntimeContainer, href: string | URL) => {
  const url = href instanceof URL ? href : parseLocationHref(href)
  const nextPath = normalizeRoutePath(url.pathname)
  ensureSignalRecord(container, ROUTER_CURRENT_PATH_SIGNAL_ID, nextPath).value = nextPath
  ensureSignalRecord(container, ROUTER_CURRENT_URL_SIGNAL_ID, url.href).value = url.href
  ensureSignalRecord(container, ROUTER_IS_NAVIGATING_SIGNAL_ID, false).value = false
}

const ensureRouterState = (container: RuntimeContainer, manifest?: RouteManifest) => {
  if (container.router) {
    if (manifest) {
      container.router.manifest = [...manifest]
    }
    return container.router
  }

  const currentPath = ensureSignalRecord(
    container,
    ROUTER_CURRENT_PATH_SIGNAL_ID,
    normalizeRoutePath(container.doc?.location.pathname ?? '/'),
  ).handle as { value: string }
  const currentUrl = ensureSignalRecord(
    container,
    ROUTER_CURRENT_URL_SIGNAL_ID,
    container.doc?.location.href ?? currentPath.value,
  ).handle as { value: string }
  const isNavigating = ensureSignalRecord(container, ROUTER_IS_NAVIGATING_SIGNAL_ID, false)
    .handle as { value: boolean }

  const router: RouterState = {
    currentPath,
    currentRoute: null,
    currentUrl,
    defaultTitle: container.doc?.title ?? '',
    isNavigating,
    loadedRoutes: new Map(),
    location: undefined as unknown as RouteLocation,
    manifest: [],
    navigate: undefined as unknown as Navigate,
    prefetchedLoaders: new Map(),
    routeModuleBusts: new Map(),
    routePrefetches: new Map(),
    sequence: 0,
  }

  container.router = router
  router.location = createRouterLocation(router)
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
    router.manifest = [...manifest]
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

const withRuntimeContextValue = <T>(token: RuntimeContextToken, value: unknown, fn: () => T): T => {
  const stack = getContextValueStack()
  stack.push({
    token,
    value,
  })
  try {
    return fn()
  } finally {
    stack.pop()
  }
}

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

export const ensureRuntimeElementId = (container: RuntimeContainer, element: Element) => {
  const existingId = element.getAttribute('data-eid')
  if (existingId) {
    return existingId
  }
  const nextId = `e${container.nextElementId++}`
  element.setAttribute('data-eid', nextId)
  return nextId
}

export const findRuntimeElement = (
  container: RuntimeContainer,
  elementId: string,
): Element | null => {
  const root = container.rootElement ?? container.doc?.body
  if (!root) {
    return null
  }
  if (root.getAttribute('data-eid') === elementId) {
    return root
  }
  return root.querySelector(`[data-eid="${elementId}"]`)
}

const registerScope = (container: RuntimeContainer, values: unknown[]): string => {
  const id = allocateScopeId(container)
  container.scopes.set(
    id,
    values.map((value) => serializeRuntimeValue(container, value)),
  )
  return id
}

const registerSerializedScope = (container: RuntimeContainer, values: SerializedValue[]) => {
  const id = allocateScopeId(container)
  container.scopes.set(id, [...values])
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
  return slots.map((slot) => deserializeRuntimeValue(container, slot))
}

const createFrame = (
  container: RuntimeContainer,
  component: ComponentState,
  mode: RenderFrame['mode'],
  options?: {
    effectCleanupSlot?: CleanupSlot
    reuseExistingDom?: boolean
    reuseProjectionSlotDom?: boolean
  },
): RenderFrame => ({
  childCursor: 0,
  component,
  container,
  effectCleanupSlot: options?.effectCleanupSlot ?? component.renderEffectCleanupSlot,
  insertCursor: 0,
  mountCallbacks: [],
  mode,
  projectionState: {
    counters: new Map(),
    reuseExistingDom: options?.reuseExistingDom ?? false,
    reuseProjectionSlotDom: options?.reuseProjectionSlotDom ?? false,
  },
  scopedStyles: [],
  signalCursor: 0,
  visibleCursor: 0,
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
    mountCleanupSlots: [],
    optimizedRoot: false,
    parentId,
    prefersEffectOnlyLocalSignalWrites: false,
    props: {},
    projectionSlots: null,
    rawProps: null,
    renderEffectCleanupSlot: createCleanupSlot(),
    reuseExistingDomOnActivate: true,
    reuseProjectionSlotDomOnActivate: false,
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol,
    suspensePromise: null,
    visibleCount: 0,
    watchCount: 0,
  }
  container.components.set(id, component)
  return component
}

const resetComponentForSymbolChange = (
  container: RuntimeContainer,
  component: ComponentState,
  meta: ComponentMeta,
) => {
  disposeComponentMountCleanups(component)
  disposeCleanupSlot(component.renderEffectCleanupSlot)
  component.renderEffectCleanupSlot = createCleanupSlot()
  component.didMount = false
  component.optimizedRoot = meta.optimizedRoot === true
  component.prefersEffectOnlyLocalSignalWrites = false
  component.projectionSlots = meta.projectionSlots ?? null
  component.rawProps = null
  component.scopeId = registerScope(container, meta.captures())
  component.signalIds = []
  component.suspensePromise = null
  pruneComponentVisibles(container, component, 0)
  pruneComponentWatches(container, component, 0)
}

const createWatchId = (componentId: string, watchIndex: number) => `${componentId}:w${watchIndex}`
const createVisibleId = (componentId: string, visibleIndex: number) =>
  `${componentId}:v${visibleIndex}`

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
    cleanupSlot: createCleanupSlot(),
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
      disposeCleanupSlot(watch.cleanupSlot)
      const module = await loadSymbol(container, watch.symbol)
      const scope = materializeScope(container, watch.scopeId)
      await withClientContainer(container, () => {
        if (watch.mode === 'dynamic') {
          collectTrackedDependencies(effect, () => {
            withCleanupSlot(watch.cleanupSlot, () => {
              module.default(scope)
            })
          })
          return
        }
        collectTrackedDependencies(effect, () => {
          module.default(scope, 'track')
        })
        withCleanupSlot(watch.cleanupSlot, () => {
          module.default(scope, 'run')
        })
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

const getOrCreateVisibleState = (
  container: RuntimeContainer,
  id: string,
  componentId: string,
): VisibleState => {
  const existing = container.visibles.get(id)
  if (existing) {
    existing.componentId = componentId
    return existing
  }

  const visible: VisibleState = {
    cleanupSlot: createCleanupSlot(),
    componentId,
    done: false,
    id,
    pending: null,
    run: null,
    scopeId: registerScope(container, []),
    symbol: '',
  }
  container.visibles.set(id, visible)
  return visible
}

const clearComponentSubscriptions = (container: RuntimeContainer, componentId: string) => {
  for (const record of container.signals.values()) {
    record.subscribers.delete(componentId)
  }
}

const disposeComponentMountCleanups = (component: ComponentState) => {
  disposeCleanupSlot(component.renderEffectCleanupSlot)
  component.renderEffectCleanupSlot = createCleanupSlot()
  const cleanupSlots = [...component.mountCleanupSlots].reverse()
  component.mountCleanupSlots = []
  for (const cleanupSlot of cleanupSlots) {
    disposeCleanupSlot(cleanupSlot)
  }
}

const removeWatchState = (container: RuntimeContainer, watchId: string) => {
  const watch = container.watches.get(watchId)
  if (!watch) {
    return
  }
  disposeCleanupSlot(watch.cleanupSlot)
  clearEffectSignals(watch.effect)
  container.watches.delete(watchId)
}

const removeVisibleState = (container: RuntimeContainer, visibleId: string) => {
  const visible = container.visibles.get(visibleId)
  if (visible) {
    disposeCleanupSlot(visible.cleanupSlot)
  }
  container.visibles.delete(visibleId)
}

const resetVisibleState = (visible: VisibleState) => {
  disposeCleanupSlot(visible.cleanupSlot)
  visible.cleanupSlot = createCleanupSlot()
  visible.done = false
  visible.pending = null
}

const resetComponentVisibleStates = (container: RuntimeContainer, componentId: string) => {
  const targetIds = new Set<string>([componentId, ...collectDescendantIds(container, componentId)])

  for (const visible of container.visibles.values()) {
    if (!targetIds.has(visible.componentId)) {
      continue
    }
    resetVisibleState(visible)
  }
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

const pruneComponentVisibles = (
  container: RuntimeContainer,
  component: ComponentState,
  nextCount: number,
) => {
  for (let index = nextCount; index < component.visibleCount; index++) {
    removeVisibleState(container, createVisibleId(component.id, index))
  }
  component.visibleCount = nextCount
}

const isDescendantOf = (parentId: string, candidateId: string) =>
  candidateId.startsWith(`${parentId}.`)

const collectDescendantIds = (container: RuntimeContainer, componentId: string) =>
  [...container.components.keys()].filter((candidate) => isDescendantOf(componentId, candidate))

const expandComponentIdsToDescendants = (
  container: RuntimeContainer,
  componentIds: Iterable<string>,
) => {
  const expanded = new Set<string>()

  for (const componentId of componentIds) {
    if (expanded.has(componentId)) {
      continue
    }
    expanded.add(componentId)
    for (const descendantId of collectDescendantIds(container, componentId)) {
      expanded.add(descendantId)
    }
  }

  return expanded
}

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
      disposeComponentMountCleanups(descendant)
      pruneComponentVisibles(container, descendant, 0)
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

const scheduleInteractivePrefetchCheck = (container: RuntimeContainer) => {
  if (
    container.interactivePrefetchCheckQueued ||
    !container.doc ||
    typeof container.doc.querySelectorAll !== 'function'
  ) {
    return
  }

  container.interactivePrefetchCheckQueued = true
  scheduleMicrotask(() => {
    container.interactivePrefetchCheckQueued = false
    const doc = container.doc
    if (!doc || typeof doc.querySelectorAll !== 'function') {
      return
    }

    for (const element of doc.querySelectorAll(INTERACTIVE_PREFETCH_SELECTOR)) {
      if (!isElementNode(element)) {
        continue
      }
      prefetchElementSymbols(container, element, INTERACTIVE_PREFETCH_EVENT_NAMES)
    }
  })
}

const scheduleVisibleCallbacksCheck = (container: RuntimeContainer) => {
  scheduleInteractivePrefetchCheck(container)
  if (container.visibilityCheckQueued || container.visibles.size === 0 || !container.doc) {
    return
  }

  ensureVisibilityListeners(container)
  container.visibilityCheckQueued = true
  const run = () => {
    container.visibilityCheckQueued = false
    void flushVisibleCallbacks(container)
  }

  const view = container.doc.defaultView
  if (view && typeof view.requestAnimationFrame === 'function') {
    view.requestAnimationFrame(() => run())
    return
  }

  scheduleMicrotask(run)
}

const rectIntersectsViewport = (
  view: { innerHeight?: number; innerWidth?: number },
  rect: { bottom: number; left: number; right: number; top: number },
) => {
  const viewportHeight = view.innerHeight ?? 0
  const viewportWidth = view.innerWidth ?? 0
  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth
}

const isBoundaryVisible = (doc: Document, start: Comment, end: Comment) => {
  const view = doc.defaultView
  if (typeof doc.createRange !== 'function' || !view) {
    return false
  }

  const range = doc.createRange()
  range.setStartAfter(start)
  range.setEndBefore(end)

  const rects = range.getClientRects()
  if (rects.length === 0) {
    return rectIntersectsViewport(view, range.getBoundingClientRect())
  }

  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index]
    if (rectIntersectsViewport(view, rect)) {
      return true
    }
  }
  return false
}

const runVisibleCallback = async (container: RuntimeContainer, visible: VisibleState) => {
  if (visible.done) {
    return
  }

  visible.done = true
  const pending = Promise.resolve()
    .then(async () => {
      if (visible.run) {
        await withClientContainer(container, async () => {
          await withCleanupSlot(visible.cleanupSlot, () => visible.run?.())
        })
      } else {
        const module = await loadSymbol(container, visible.symbol)
        await withClientContainer(container, async () => {
          await withCleanupSlot(visible.cleanupSlot, () =>
            module.default(materializeScope(container, visible.scopeId)),
          )
        })
      }
      await flushDirtyComponents(container)
      scheduleVisibleCallbacksCheck(container)
    })
    .finally(() => {
      if (visible.pending === pending) {
        visible.pending = null
      }
    })

  visible.pending = pending
  await pending
}

const flushVisibleCallbacks = async (container: RuntimeContainer) => {
  if (!container.doc || container.visibles.size === 0) {
    return
  }

  for (const visible of Array.from(container.visibles.values())) {
    if (visible.done || visible.pending) {
      continue
    }

    const component = container.components.get(visible.componentId)
    if (!component?.start || !component.end) {
      continue
    }

    if (!isBoundaryVisible(container.doc, component.start, component.end)) {
      continue
    }

    await runVisibleCallback(container, visible)
  }
}

const ensureVisibilityListeners = (container: RuntimeContainer) => {
  if (container.visibilityListenersCleanup || !container.doc) {
    return
  }

  const doc = container.doc
  const onVisibilityChange = () => {
    scheduleVisibleCallbacksCheck(container)
  }

  doc.addEventListener('scroll', onVisibilityChange, true)
  doc.defaultView?.addEventListener('resize', onVisibilityChange)

  container.visibilityListenersCleanup = () => {
    doc.removeEventListener('scroll', onVisibilityChange, true)
    doc.defaultView?.removeEventListener('resize', onVisibilityChange)
    container.visibilityListenersCleanup = null
  }
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
        const cleanupSlot = createCleanupSlot()
        component.mountCleanupSlots.push(cleanupSlot)
        withCleanupSlot(cleanupSlot, callback)
      }
    })
      .then(() => flushDirtyComponents(container))
      .then(() => {
        scheduleVisibleCallbacksCheck(container)
      })
  })
}

const collectProjectionSlotRanges = (roots: Node[]) => {
  const starts = new Map<string, Comment>()
  const ranges = new Map<string, { end: Comment; start: Comment }>()

  const visit = (node: Node) => {
    if (typeof Comment !== 'undefined' ? node instanceof Comment : (node as Node).nodeType === 8) {
      const commentNode = node as Comment
      const marker = parseProjectionSlotMarker(commentNode.data)
      if (marker) {
        if (marker.kind === 'start') {
          starts.set(marker.key, commentNode)
        } else {
          const startNode = starts.get(marker.key)
          if (startNode) {
            ranges.set(marker.key, { end: commentNode, start: startNode })
          }
        }
      }
    }
    for (const child of Array.from((node.childNodes ?? []) as unknown as Iterable<Node>)) {
      visit(child)
    }
  }

  for (const root of roots) {
    visit(root)
  }

  return ranges
}

const collectComponentBoundaryIds = (roots: Node[]) => {
  const ids = new Set<string>()
  const visit = (node: Node) => {
    if (typeof Comment !== 'undefined' ? node instanceof Comment : (node as Node).nodeType === 8) {
      const matched = (node as Comment).data.match(/^ec:c:(.+):(start|end)$/)
      if (matched) {
        ids.add(matched[1]!)
      }
    }
    for (const child of Array.from((node.childNodes ?? []) as unknown as Iterable<Node>)) {
      visit(child)
    }
  }

  for (const root of roots) {
    visit(root)
  }

  return ids
}

const collectComponentBoundaryRanges = (roots: Node[]) => {
  const starts = new Map<string, Comment>()
  const ranges = new Map<string, { end: Comment; start: Comment }>()

  const visit = (node: Node) => {
    if (typeof Comment !== 'undefined' ? node instanceof Comment : (node as Node).nodeType === 8) {
      const commentNode = node as Comment
      const marker = parseComponentBoundaryMarker(commentNode.data)
      if (marker) {
        if (marker.kind === 'start') {
          starts.set(marker.id, commentNode)
        } else {
          const startNode = starts.get(marker.id)
          if (startNode) {
            ranges.set(marker.id, { end: commentNode, start: startNode })
          }
        }
      }
    }
    for (const child of Array.from((node.childNodes ?? []) as unknown as Iterable<Node>)) {
      visit(child)
    }
  }

  for (const root of roots) {
    visit(root)
  }

  return ranges
}

const collectKeyedRangeRanges = (roots: Node[]) => {
  const starts = new Map<string, Comment>()
  const ranges = new Map<string, { end: Comment; start: Comment }>()

  const visit = (node: Node) => {
    if (typeof Comment !== 'undefined' ? node instanceof Comment : (node as Node).nodeType === 8) {
      const commentNode = node as Comment
      const marker = parseKeyedRangeMarker(commentNode.data)
      if (marker) {
        if (marker.kind === 'start') {
          starts.set(marker.key, commentNode)
        } else {
          const startNode = starts.get(marker.key)
          if (startNode) {
            ranges.set(marker.key, { end: commentNode, start: startNode })
          }
        }
      }
    }
    for (const child of Array.from((node.childNodes ?? []) as unknown as Iterable<Node>)) {
      visit(child)
    }
  }

  for (const root of roots) {
    visit(root)
  }

  return ranges
}

const collectBoundaryRangeNodes = (start: Comment, end: Comment) => {
  const nodes: Node[] = [start]
  let cursor: Node | null = start.nextSibling
  while (cursor) {
    nodes.push(cursor)
    if (cursor === end) {
      return nodes
    }
    cursor = cursor.nextSibling
  }
  return []
}

const preserveComponentBoundaryContentsInRoots = (currentRoots: Node[], nextRoots: Node[]) => {
  const currentRanges = collectComponentBoundaryRanges(currentRoots)
  const nextRanges = collectComponentBoundaryRanges(nextRoots)
  const preservedComponentIds = new Set<string>()

  for (const [id, nextRange] of nextRanges) {
    const boundaryChanged = Boolean(
      (
        nextRange.start as Comment & {
          [COMPONENT_BOUNDARY_PROPS_CHANGED]?: boolean
          [COMPONENT_BOUNDARY_SYMBOL_CHANGED]?: boolean
        }
      )[COMPONENT_BOUNDARY_SYMBOL_CHANGED] ||
      (
        nextRange.start as Comment & {
          [COMPONENT_BOUNDARY_PROPS_CHANGED]?: boolean
          [COMPONENT_BOUNDARY_SYMBOL_CHANGED]?: boolean
        }
      )[COMPONENT_BOUNDARY_PROPS_CHANGED],
    )
    if (boundaryChanged) {
      continue
    }
    const currentRange = currentRanges.get(id)
    if (!currentRange) {
      continue
    }

    const movedRoots = collectBoundaryRangeNodes(currentRange.start, currentRange.end)
    if (movedRoots.length === 0) {
      continue
    }

    const replacementParent = nextRange.start.parentNode
    if (!replacementParent) {
      continue
    }

    for (const node of movedRoots) {
      replacementParent.insertBefore(node, nextRange.start)
    }

    let cursor: Node | null = nextRange.start
    while (cursor) {
      const nextSibling: Node | null = cursor.nextSibling
      if (typeof (cursor as Node & { remove?: () => void }).remove === 'function') {
        ;(cursor as Node & { remove: () => void }).remove()
      } else {
        cursor.parentNode?.removeChild(cursor)
      }
      if (cursor === nextRange.end) {
        break
      }
      cursor = nextSibling
    }

    preservedComponentIds.add(id)
    for (const componentId of collectComponentBoundaryIds(movedRoots)) {
      preservedComponentIds.add(componentId)
    }
  }

  return preservedComponentIds
}

const preserveProjectionSlotContentsInRoots = (currentRoots: Node[], nextRoots: Node[]) => {
  const currentRanges = collectProjectionSlotRanges(currentRoots)
  const nextRanges = collectProjectionSlotRanges(nextRoots)
  const preservedComponentIds = new Set<string>()

  const isPlaceholderProjectionBody = (nodes: Node[]) => {
    if (nodes.length === 0) {
      return true
    }

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]!
      const token = getPatchOpaqueRangeToken(node, 'start')
      if (!token) {
        return false
      }

      let endIndex = index + 1
      while (endIndex < nodes.length) {
        const endToken = getPatchOpaqueRangeToken(nodes[endIndex]!, 'end')
        if (endToken && endToken.rangeKind === token.rangeKind && endToken.token === token.token) {
          break
        }
        endIndex += 1
      }

      if (endIndex >= nodes.length || endIndex !== index + 1) {
        return false
      }

      index = endIndex
    }

    return true
  }

  for (const [key, nextRange] of nextRanges) {
    const currentRange = currentRanges.get(key)
    if (!currentRange) {
      continue
    }

    const nextBodyNodes = getBoundaryChildren(nextRange.start, nextRange.end)
    if (!isPlaceholderProjectionBody(nextBodyNodes)) {
      continue
    }

    const movedRoots: Node[] = []
    let cursor = currentRange.start.nextSibling
    while (cursor && cursor !== currentRange.end) {
      const nextSibling = cursor.nextSibling
      movedRoots.push(cursor)
      cursor = nextSibling
    }

    if (movedRoots.length === 0) {
      continue
    }

    let nextBodyCursor = nextRange.start.nextSibling
    while (nextBodyCursor && nextBodyCursor !== nextRange.end) {
      const nextSibling = nextBodyCursor.nextSibling
      if (typeof (nextBodyCursor as Node & { remove?: () => void }).remove === 'function') {
        ;(nextBodyCursor as Node & { remove: () => void }).remove()
      } else {
        nextBodyCursor.parentNode?.removeChild(nextBodyCursor)
      }
      nextBodyCursor = nextSibling
    }

    for (const node of movedRoots) {
      nextRange.end.parentNode?.insertBefore(node, nextRange.end)
    }

    for (const componentId of collectComponentBoundaryIds(movedRoots)) {
      preservedComponentIds.add(componentId)
    }
  }

  return preservedComponentIds
}

const preserveKeyedRangeContentsInRoots = (currentRoots: Node[], nextRoots: Node[]) => {
  const preservedComponentIds = new Set<string>()
  const currentRanges = collectKeyedRangeRanges(currentRoots)
  const nextRanges = collectKeyedRangeRanges(nextRoots)

  for (const [key, nextRange] of nextRanges) {
    const currentRange = currentRanges.get(key)
    if (!currentRange) {
      continue
    }

    const movedRoots = collectBoundaryRangeNodes(currentRange.start, currentRange.end)
    if (movedRoots.length === 0) {
      continue
    }

    const replacementParent = nextRange.start.parentNode
    if (!replacementParent) {
      continue
    }

    for (const node of movedRoots) {
      replacementParent.insertBefore(node, nextRange.start)
    }

    let cursor: Node | null = nextRange.start
    while (cursor) {
      const nextSibling: Node | null = cursor.nextSibling
      if (typeof (cursor as Node & { remove?: () => void }).remove === 'function') {
        ;(cursor as Node & { remove: () => void }).remove()
      } else {
        cursor.parentNode?.removeChild(cursor)
      }
      if (cursor === nextRange.end) {
        break
      }
      cursor = nextSibling
    }

    for (const componentId of collectComponentBoundaryIds(movedRoots)) {
      preservedComponentIds.add(componentId)
    }
  }

  return preservedComponentIds
}

const canMatchReusableRoot = (current: Node, next: Node) => {
  if (current.nodeType !== next.nodeType) {
    return false
  }

  if (
    (typeof Comment !== 'undefined' ? current instanceof Comment : current.nodeType === 8) &&
    (typeof Comment !== 'undefined' ? next instanceof Comment : next.nodeType === 8)
  ) {
    return (current as Comment).data === (next as Comment).data
  }

  if (current.nodeType === DOM_TEXT_NODE && next.nodeType === DOM_TEXT_NODE) {
    return true
  }

  return isElementNode(current) && isElementNode(next) && current.tagName === next.tagName
}

const preserveInsertMarkerContentsInRoots = (currentRoots: Node[], nextRoots: Node[]) => {
  const preservedComponentIds = new Set<string>()

  const preserveLists = (currentChildren: Node[], nextChildren: Node[]) => {
    let currentIndex = 0

    for (const nextChild of nextChildren) {
      const nextInsertMarker = (
        typeof Comment !== 'undefined' ? nextChild instanceof Comment : nextChild.nodeType === 8
      )
        ? parseInsertMarker((nextChild as Comment).data)
        : null
      if (nextInsertMarker) {
        let markerIndex = -1
        for (let index = currentIndex; index < currentChildren.length; index += 1) {
          const currentChild = currentChildren[index]!
          if (
            !(typeof Comment !== 'undefined'
              ? currentChild instanceof Comment
              : currentChild.nodeType === 8)
          ) {
            continue
          }
          const currentInsertMarker = parseInsertMarker((currentChild as Comment).data)
          if (currentInsertMarker?.key === nextInsertMarker.key) {
            markerIndex = index
            break
          }
        }
        if (markerIndex < 0) {
          continue
        }

        const currentMarker = currentChildren[markerIndex]! as Comment
        const explicitCount = insertMarkerNodeCounts.get(currentMarker)
        if (explicitCount === undefined) {
          currentIndex = markerIndex + 1
          continue
        }
        const ownedStartIndex =
          explicitCount >= 0 && markerIndex - explicitCount >= currentIndex
            ? markerIndex - explicitCount
            : currentIndex
        const movedRoots = currentChildren.slice(ownedStartIndex, markerIndex)
        if (collectComponentBoundaryIds(movedRoots).size > 0) {
          currentIndex = markerIndex + 1
          continue
        }

        for (const node of movedRoots) {
          nextChild.parentNode?.insertBefore(node, nextChild)
        }
        insertMarkerNodeCounts.set(nextChild as Comment, movedRoots.length)

        for (const componentId of collectComponentBoundaryIds(movedRoots)) {
          preservedComponentIds.add(componentId)
        }

        currentIndex = markerIndex + 1
        continue
      }

      let matchedIndex = -1
      for (let index = currentIndex; index < currentChildren.length; index += 1) {
        if (canMatchReusableRoot(currentChildren[index]!, nextChild)) {
          matchedIndex = index
          break
        }
      }
      if (matchedIndex < 0) {
        continue
      }

      const currentChild = currentChildren[matchedIndex]!
      if (isElementNode(currentChild) && isElementNode(nextChild)) {
        preserveLists(Array.from(currentChild.childNodes), Array.from(nextChild.childNodes))
      }
      currentIndex = matchedIndex + 1
    }
  }

  preserveLists(currentRoots, nextRoots)

  return preservedComponentIds
}

export const preserveReusableContentInRoots = (
  currentRoots: Node[],
  nextRoots: Node[],
  options?: {
    preserveProjectionSlots?: boolean
  },
) => {
  const preservedComponentIds = preserveComponentBoundaryContentsInRoots(currentRoots, nextRoots)

  if (options?.preserveProjectionSlots ?? true) {
    for (const componentId of preserveProjectionSlotContentsInRoots(currentRoots, nextRoots)) {
      preservedComponentIds.add(componentId)
    }
  }

  for (const componentId of preserveKeyedRangeContentsInRoots(currentRoots, nextRoots)) {
    preservedComponentIds.add(componentId)
  }

  for (const componentId of preserveInsertMarkerContentsInRoots(currentRoots, nextRoots)) {
    preservedComponentIds.add(componentId)
  }

  return preservedComponentIds
}

const replaceProjectionSlotContents = (start: Comment, end: Comment, nodes: Node[]) => {
  let cursor = start.nextSibling
  while (cursor && cursor !== end) {
    const next = cursor.nextSibling
    cursor.remove()
    cursor = next
  }
  for (const node of nodes) {
    end.parentNode?.insertBefore(node, end)
  }
  rememberManagedAttributesForNodes(nodes)
}

const replaceBoundaryContents = (
  start: Comment,
  end: Comment,
  nodes: Node[],
  options?: {
    preserveProjectionSlots?: boolean
  },
) => {
  const preservedComponentIds = preserveReusableContentInRoots(
    getBoundaryChildren(start, end),
    nodes,
    {
      preserveProjectionSlots: options?.preserveProjectionSlots ?? true,
    },
  )
  let cursor = start.nextSibling
  while (cursor && cursor !== end) {
    const next = cursor.nextSibling
    cursor.remove()
    cursor = next
  }
  for (const node of nodes) {
    end.parentNode?.insertBefore(node, end)
  }
  rememberManagedAttributesForNodes(nodes)

  return preservedComponentIds
}

export const syncManagedElementAttributes = (current: Element, next: Element) => {
  const nextNames = new Set(next.getAttributeNames())
  const previousNames = getManagedAttributeSnapshot(current) ?? new Set<string>()

  for (const name of previousNames) {
    if (!nextNames.has(name)) {
      current.removeAttribute(name)
    }
  }

  for (const name of nextNames) {
    const nextValue = next.getAttribute(name)
    if (nextValue !== null && current.getAttribute(name) !== nextValue) {
      current.setAttribute(name, nextValue)
    }
  }

  replaceManagedAttributeSnapshot(current, nextNames)

  if (isHTMLInputElementNode(current) && isHTMLInputElementNode(next)) {
    if (current.checked !== next.checked) {
      current.checked = next.checked
    }
  }
  if ('value' in current && 'value' in next && current.value !== next.value) {
    if (current.value !== next.value) {
      current.value = next.value
    }
  }
}

export const tryPatchElementShellInPlace = (current: Element, next: Element) => {
  if (current.tagName !== next.tagName) {
    return false
  }

  syncManagedElementAttributes(current, next)
  preserveReusableContentInRoots(Array.from(current.childNodes), Array.from(next.childNodes))
  while (current.firstChild) {
    current.firstChild.remove()
  }
  while (next.firstChild) {
    current.appendChild(next.firstChild)
  }
  rememberManagedAttributesForNodes(Array.from(current.childNodes))
  return true
}

const collectInsertRangeOwnedNodes = (marker: Comment, ownedNodeCount: number) => {
  if (!marker.parentNode || ownedNodeCount === 0) {
    return [] as Node[]
  }

  const nodes: Node[] = []
  let cursor: Node | null = marker.previousSibling
  while (cursor && nodes.length < ownedNodeCount) {
    nodes.unshift(cursor)
    cursor = cursor.previousSibling
  }

  return nodes.length === ownedNodeCount ? nodes : []
}

const replaceInsertRangeOwnedNodes = (
  currentMarker: Comment,
  currentOwnedNodes: Node[],
  nextOwnedNodes: Node[],
) => {
  const parent = currentMarker.parentNode
  if (!parent) {
    return false
  }

  preserveReusableContentInRoots(currentOwnedNodes, nextOwnedNodes)

  for (const node of currentOwnedNodes) {
    if (typeof (node as Node & { remove?: () => void }).remove === 'function') {
      ;(node as Node & { remove: () => void }).remove()
      continue
    }
    node.parentNode?.removeChild(node)
  }
  for (const node of nextOwnedNodes) {
    parent.insertBefore(node, currentMarker)
  }

  rememberManagedAttributesForNodes(parent.childNodes)
  insertMarkerNodeCounts.set(currentMarker, nextOwnedNodes.length)
  return true
}

type PatchSequenceUnit =
  | { kind: 'node'; node: Node; nodeCount: number }
  | {
      bodyNodes: Node[]
      end: Comment
      kind: 'opaque-range'
      nodeCount: number
      rangeKind: 'component-boundary' | 'keyed' | 'projection-slot'
      start: Comment
      token: string
    }
  | {
      kind: 'insert-range'
      marker: Comment
      nodeCount: number
      token: string
    }

const getPatchOpaqueRangeToken = (node: Node, kind: 'start' | 'end') => {
  if (!(typeof Comment !== 'undefined' ? node instanceof Comment : node.nodeType === 8)) {
    return null
  }

  const comment = node as Comment
  const boundary = parseComponentBoundaryMarker(comment.data)
  if (boundary?.kind === kind) {
    return {
      rangeKind: 'component-boundary' as const,
      token: `component-boundary:${boundary.id}`,
    }
  }

  const projectionSlot = parseProjectionSlotMarker(comment.data)
  if (projectionSlot?.kind === kind) {
    return {
      rangeKind: 'projection-slot' as const,
      token: `projection-slot:${projectionSlot.key}`,
    }
  }

  const keyedRange = parseKeyedRangeMarker(comment.data)
  if (keyedRange?.kind === kind) {
    return {
      rangeKind: 'keyed' as const,
      token: `keyed:${keyedRange.key}`,
    }
  }

  return null
}

const collectPatchSequenceUnits = (nodes: Node[]): PatchSequenceUnit[] | null => {
  const units: PatchSequenceUnit[] = []

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    const token = getPatchOpaqueRangeToken(node, 'start')
    if (!token) {
      const insertMarker =
        (typeof Comment !== 'undefined' ? node instanceof Comment : node.nodeType === 8) &&
        parseInsertMarker((node as Comment).data)
      if (!insertMarker) {
        units.push({ kind: 'node', node, nodeCount: 1 })
        continue
      }

      const ownedNodeCount = insertMarkerNodeCounts.get(node as Comment) ?? 0
      let remaining = ownedNodeCount
      while (remaining > 0) {
        const previous = units[units.length - 1]
        if (!previous || previous.nodeCount > remaining) {
          return null
        }
        remaining -= previous.nodeCount
        units.pop()
      }

      units.push({
        kind: 'insert-range',
        marker: node as Comment,
        nodeCount: ownedNodeCount + 1,
        token: `insert:${insertMarker.key}`,
      })
      continue
    }

    let endIndex = index + 1
    while (endIndex < nodes.length) {
      const endToken = getPatchOpaqueRangeToken(nodes[endIndex]!, 'end')
      if (endToken && endToken.rangeKind === token.rangeKind && endToken.token === token.token) {
        break
      }
      endIndex += 1
    }
    if (endIndex >= nodes.length) {
      units.push({ kind: 'node', node, nodeCount: 1 })
      continue
    }

    units.push({
      bodyNodes: nodes.slice(index + 1, endIndex),
      end: nodes[endIndex]! as Comment,
      kind: 'opaque-range',
      nodeCount: endIndex - index + 1,
      rangeKind: token.rangeKind,
      start: node as Comment,
      token: token.token,
    })
    index = endIndex
  }

  return units
}

const hasStructuredPatchUnits = (nodes: Node[]) => {
  const units = collectPatchSequenceUnits(nodes)
  if (!units) {
    return true
  }
  return units.some((unit) => unit.kind !== 'node')
}

export const tryPatchNodeSequenceInPlace = (currentNodes: Node[], nextNodes: Node[]) => {
  const currentUnits = collectPatchSequenceUnits(currentNodes)
  const nextUnits = collectPatchSequenceUnits(nextNodes)
  if (!currentUnits || !nextUnits || currentUnits.length !== nextUnits.length) {
    return false
  }

  for (let index = 0; index < currentUnits.length; index += 1) {
    const currentUnit = currentUnits[index]!
    const nextUnit = nextUnits[index]!
    if (currentUnit.kind !== nextUnit.kind) {
      return false
    }
    if (currentUnit.kind === 'insert-range' && nextUnit.kind === 'insert-range') {
      const currentOwnedNodes = collectInsertRangeOwnedNodes(
        currentUnit.marker,
        currentUnit.nodeCount - 1,
      )
      const nextOwnedNodes = collectInsertRangeOwnedNodes(nextUnit.marker, nextUnit.nodeCount - 1)
      if (
        currentUnit.token !== nextUnit.token &&
        (hasStructuredPatchUnits(currentOwnedNodes) || hasStructuredPatchUnits(nextOwnedNodes))
      ) {
        return false
      }
      if (
        currentOwnedNodes.length > 0 ||
        nextOwnedNodes.length > 0 ||
        currentUnit.nodeCount !== nextUnit.nodeCount
      ) {
        if (!tryPatchNodeSequenceInPlace(currentOwnedNodes, nextOwnedNodes)) {
          if (
            !replaceInsertRangeOwnedNodes(currentUnit.marker, currentOwnedNodes, nextOwnedNodes)
          ) {
            return false
          }
        } else {
          insertMarkerNodeCounts.set(currentUnit.marker, nextOwnedNodes.length)
        }
      }
      continue
    }
    if (currentUnit.kind === 'opaque-range' && nextUnit.kind === 'opaque-range') {
      if (currentUnit.token !== nextUnit.token || currentUnit.rangeKind !== nextUnit.rangeKind) {
        return false
      }
      if (currentUnit.rangeKind === 'component-boundary') {
        const symbolChanged = Boolean(
          (
            nextUnit.start as Comment & {
              [COMPONENT_BOUNDARY_SYMBOL_CHANGED]?: boolean
            }
          )[COMPONENT_BOUNDARY_SYMBOL_CHANGED],
        )
        if (symbolChanged) {
          return false
        }
        const propsChanged = Boolean(
          (
            nextUnit.start as Comment & {
              [COMPONENT_BOUNDARY_PROPS_CHANGED]?: boolean
            }
          )[COMPONENT_BOUNDARY_PROPS_CHANGED],
        )
        if (propsChanged) {
          const nextRangeNodes = nextUnit.bodyNodes
          if (
            !tryPatchBoundaryContentsInPlace(currentUnit.start, currentUnit.end, nextRangeNodes)
          ) {
            replaceBoundaryContents(currentUnit.start, currentUnit.end, nextRangeNodes)
          }
        }
      } else if (currentUnit.rangeKind === 'keyed') {
        const nextRangeNodes = nextUnit.bodyNodes
        if (!tryPatchNodeSequenceInPlace(currentUnit.bodyNodes, nextRangeNodes)) {
          replaceBoundaryContents(currentUnit.start, currentUnit.end, nextRangeNodes)
        }
      }
      continue
    }
    if (currentUnit.kind !== 'node' || nextUnit.kind !== 'node') {
      return false
    }
    if (!patchNodeInPlace(currentUnit.node, nextUnit.node)) {
      return false
    }
  }

  return true
}

const patchNodeInPlace = (current: Node, next: Node): boolean => {
  if (current.nodeType !== next.nodeType) {
    return false
  }

  if (current.nodeType === DOM_TEXT_NODE && next.nodeType === DOM_TEXT_NODE) {
    if (current.textContent !== next.textContent) {
      current.textContent = next.textContent
    }
    return true
  }

  if (current.nodeType === DOM_COMMENT_NODE && next.nodeType === DOM_COMMENT_NODE) {
    const currentComment = current as Comment
    const nextComment = next as Comment
    const currentIsProjectionSlot = !!parseProjectionSlotMarker(currentComment.data)
    const nextIsProjectionSlot = !!parseProjectionSlotMarker(nextComment.data)
    const currentIsBoundaryMarker = !!parseComponentBoundaryMarker(currentComment.data)
    const nextIsBoundaryMarker = !!parseComponentBoundaryMarker(nextComment.data)
    const currentIsInsertMarker = !!parseInsertMarker(currentComment.data)
    const nextIsInsertMarker = !!parseInsertMarker(nextComment.data)
    if (
      currentIsProjectionSlot ||
      nextIsProjectionSlot ||
      currentIsBoundaryMarker ||
      nextIsBoundaryMarker ||
      currentIsInsertMarker ||
      nextIsInsertMarker
    ) {
      return currentComment.data === nextComment.data
    }
    if (currentComment.data !== nextComment.data) {
      currentComment.data = nextComment.data
    }
    return true
  }

  if (!isElementNode(current) || !isElementNode(next) || current.tagName !== next.tagName) {
    return false
  }

  if (tryPatchNodeSequenceInPlace(Array.from(current.childNodes), Array.from(next.childNodes))) {
    syncManagedElementAttributes(current, next)
    return true
  }

  return tryPatchElementShellInPlace(current, next)
}

export const tryPatchBoundaryContentsInPlace = (
  start: Comment,
  end: Comment,
  nextNodes: Node[],
) => {
  const currentNodes = getBoundaryChildren(start, end)
  return tryPatchNodeSequenceInPlace(currentNodes, nextNodes)
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

const collectMountedBoundaryDescendants = (component: ComponentState) =>
  component.start && component.end
    ? collectComponentBoundaryIds(getBoundaryChildren(component.start, component.end))
    : new Set<string>()

const collectMountedDescendantComponentIds = (
  container: RuntimeContainer,
  component: ComponentState,
) => expandComponentIdsToDescendants(container, collectMountedBoundaryDescendants(component))

const collectProjectionSlotComponentIds = (roots: Node[]) => {
  const preserved = new Set<string>()
  for (const range of collectProjectionSlotRanges(roots).values()) {
    for (const componentId of collectComponentBoundaryIds(
      getBoundaryChildren(range.start, range.end),
    )) {
      preserved.add(componentId)
    }
  }
  return preserved
}

const collectPreservedProjectionSlotComponentIds = (
  container: RuntimeContainer,
  start: Comment,
  end: Comment,
) =>
  expandComponentIdsToDescendants(
    container,
    collectProjectionSlotComponentIds(getBoundaryChildren(start, end)),
  )

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
    const childNodes: NodeListOf<ChildNode> | Node[] | undefined = cursor
      ? ((cursor.childNodes as NodeListOf<ChildNode>) ?? undefined)
      : undefined
    cursor =
      (childNodes &&
        ('item' in childNodes
          ? (childNodes.item(index) as Node | null)
          : ((childNodes as unknown as Node[])[index] ?? null))) ??
      null
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
    const children: HTMLCollection | Element[] | undefined = cursor
      ? ((cursor.children as HTMLCollection) ?? undefined)
      : undefined
    cursor =
      (children &&
        ('item' in children
          ? (children.item(index) as Element | null)
          : ((children as unknown as Element[])[index] ?? null))) ??
      null
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
  if (!isHTMLElementNode(activeElement)) {
    return null
  }

  const topLevelNodes = getBoundaryChildren(start, end)
  for (let i = 0; i < topLevelNodes.length; i++) {
    const candidate = topLevelNodes[i]
    if (
      candidate !== activeElement &&
      (!isElementNode(candidate) || !candidate.contains(activeElement))
    ) {
      continue
    }

    const innerPath = getNodePath(candidate, activeElement)
    if (!innerPath) {
      continue
    }

    return {
      path: [i, ...innerPath],
      selectionDirection: isTextEntryElement(activeElement)
        ? activeElement.selectionDirection
        : null,
      selectionEnd: isTextEntryElement(activeElement) ? activeElement.selectionEnd : null,
      selectionStart: isTextEntryElement(activeElement) ? activeElement.selectionStart : null,
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
  if (!isHTMLElementNode(nextActive)) {
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
      isTextEntryElement(nextActive) &&
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
  const candidate = isHTMLElementNode(focusSource)
    ? focusSource
    : isHTMLElementNode(doc.activeElement)
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
    selectionDirection: isTextEntryElement(candidate) ? candidate.selectionDirection : null,
    selectionEnd: isTextEntryElement(candidate) ? candidate.selectionEnd : null,
    selectionStart: isTextEntryElement(candidate) ? candidate.selectionStart : null,
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

const shouldSkipPendingFocusRestore = (
  container: RuntimeContainer,
  pending: PendingFocusRestore,
) => {
  if (!container.doc) {
    return false
  }

  const activeElement = container.doc.activeElement
  if (!isHTMLElementNode(activeElement)) {
    return false
  }
  if (
    activeElement === container.doc.body ||
    !activeElement.isConnected ||
    !container.doc.body.contains(activeElement)
  ) {
    return false
  }

  const activePath = getElementPath(container.doc.body, activeElement)
  if (!activePath) {
    return false
  }

  if (activePath.length !== pending.snapshot.path.length) {
    return true
  }

  return activePath.some((index, position) => index !== pending.snapshot.path[position])
}

const restorePendingFocus = (container: RuntimeContainer, pending: PendingFocusRestore | null) => {
  if (!pending || !container.doc) {
    return
  }
  if (shouldSkipPendingFocusRestore(container, pending)) {
    return
  }

  const nextActive = getElementByPath(container.doc.body, pending.snapshot.path)
  if (!isHTMLElementNode(nextActive)) {
    return
  }

  restoreFocusTarget(container.doc, nextActive, pending.snapshot)
}

const EVENT_PROP_REGEX = /^on([A-Z].+)$/
const DANGEROUSLY_SET_INNER_HTML_PROP = 'dangerouslySetInnerHTML'

const resolveDangerouslySetInnerHTML = (value: unknown) =>
  value === false || value === undefined || value === null ? null : String(value)

const toEventName = (propName: string) => {
  const matched = propName.match(EVENT_PROP_REGEX)
  if (!matched) {
    return null
  }
  const [first, ...rest] = matched[1]
  return `${first.toLowerCase()}${rest.join('')}`
}

const TEXT_ESCAPE_REGEX = /[&<>]/
const ATTR_ESCAPE_REGEX = /[&<>'"]/

const escapeString = (value: string, mode: 'text' | 'attr') => {
  const escapePattern = mode === 'attr' ? ATTR_ESCAPE_REGEX : TEXT_ESCAPE_REGEX
  const firstMatch = value.search(escapePattern)
  if (firstMatch < 0) {
    return value
  }

  let output = ''
  let lastIndex = 0
  for (let index = firstMatch; index < value.length; index += 1) {
    let escaped: string | null = null
    switch (value.charCodeAt(index)) {
      case 34:
        escaped = mode === 'attr' ? '&quot;' : null
        break
      case 38:
        escaped = '&amp;'
        break
      case 39:
        escaped = mode === 'attr' ? '&#39;' : null
        break
      case 60:
        escaped = '&lt;'
        break
      case 62:
        escaped = '&gt;'
        break
    }
    if (!escaped) {
      continue
    }
    output += value.slice(lastIndex, index)
    output += escaped
    lastIndex = index + 1
  }
  return output + value.slice(lastIndex)
}

const escapeText = (value: string) => escapeString(value, 'text')

const escapeAttr = (value: string) => escapeString(value, 'attr')

export const renderSSRAttr = (name: string, value: unknown) => {
  if (name === 'key') {
    return ''
  }
  if (value === false || value === undefined || value === null) {
    return ''
  }
  if (value === true) {
    return ` ${name}`
  }
  return ` ${name}="${escapeAttr(String(value))}"`
}

const renderStringArray = (values: readonly (JSX.Element | JSX.Element[])[]) => {
  let output = ''
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (Array.isArray(value)) {
      output += renderStringArray(value)
      continue
    }
    if (value === false || value === null || value === undefined) {
      continue
    }
    if (typeof value === 'string') {
      output += escapeText(value)
      continue
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      output += escapeText(String(value))
      continue
    }
    if (isSSRRawValue(value)) {
      output += value.value
      continue
    }
    if (isSSRTemplate(value)) {
      output += renderSSRTemplateNode(value)
      continue
    }
    if (isProjectionSlot(value)) {
      output += renderProjectionSlotToString(value)
      continue
    }
    if (isRouteSlot(value)) {
      const routeElement = resolveRouteSlot(getCurrentContainer(), value)
      if (routeElement) {
        output += renderStringNode(routeElement as JSX.Element)
      }
      continue
    }
    output += renderStringNode(value as JSX.Element)
  }
  return output
}

export const renderSSRValue = (value: unknown): string => {
  if (value === false || value === null || value === undefined) {
    return ''
  }
  if (Array.isArray(value)) {
    return renderStringArray(value as readonly (JSX.Element | JSX.Element[])[])
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return escapeText(String(value))
  }
  if (isSSRRawValue(value)) {
    return value.value
  }
  if (isSSRTemplate(value)) {
    return renderSSRTemplateNode(value)
  }
  if (isProjectionSlot(value)) {
    return renderProjectionSlotToString(value)
  }
  if (isRouteSlot(value)) {
    const routeElement = resolveRouteSlot(getCurrentContainer(), value)
    return routeElement ? renderStringNode(routeElement as JSX.Element) : ''
  }
  return renderStringNode(value as JSX.Element)
}

export const renderSSRMap = <T>(
  value: readonly T[] | { map: (callback: (item: T, index: number) => string) => { join: (separator: string) => string } },
  renderItem: (item: T, index: number) => string,
): string => {
  if (Array.isArray(value)) {
    let output = ''
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        continue
      }
      output += renderItem(value[index] as T, index)
    }
    return output
  }
  return value.map(renderItem).join('')
}

const renderSSRTemplateNode = (template: JSX.SSRTemplate) => {
  let output = template.strings[0] ?? ''
  for (let index = 0; index < template.values.length; index += 1) {
    const value = template.values[index]
    output += isSSRAttrValue(value)
      ? renderSSRAttr(value.name, value.value)
      : renderSSRValue(value)
    output += template.strings[index + 1] ?? ''
  }
  return output
}

const resolveRenderable = (value: JSX.Element): JSX.Element => {
  let current = value
  while (
    typeof current === 'function' &&
    !getLazyMeta(current) &&
    !getComponentMeta(current) &&
    !getContextProviderMeta(current)
  ) {
    current = current()
  }
  return current
}

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

const getRuntimeEventDescriptor = (value: unknown): EventDescriptor | LazyMeta | null =>
  getEventMeta(value) ?? getLazyMeta(value)

const isForValue = (value: unknown): value is ForValue =>
  !!value && typeof value === 'object' && (value as ForValue).__e_for === true

const isShowValue = (value: unknown): value is ShowValue =>
  !!value && typeof value === 'object' && (value as ShowValue).__e_show === true

export const bindRuntimeEvent = (element: Element, eventName: string, value: unknown): boolean => {
  const descriptor = getRuntimeEventDescriptor(value)
  if (!descriptor) {
    return false
  }

  const container = getCurrentContainer()
  if (!container) {
    return false
  }

  element.setAttribute('data-eid', `e${container.nextElementId++}`)
  element.setAttribute(`data-e-on${eventName}`, registerEventBinding(container, descriptor))
  syncManagedAttributeSnapshot(element, 'data-eid')
  syncManagedAttributeSnapshot(element, `data-e-on${eventName}`)
  return true
}

const renderProjectionSlotToString = (slot: ProjectionSlotValue) => {
  const frame = getCurrentFrame()
  const start = createProjectionSlotMarker(slot.componentId, slot.name, slot.occurrence, 'start')
  const end = createProjectionSlotMarker(slot.componentId, slot.name, slot.occurrence, 'end')
  if (frame?.component.id === slot.componentId && frame.projectionState.reuseExistingDom) {
    return `<!--${start}--><!--${end}-->`
  }
  return `<!--${start}-->${renderStringNode(slot.source as JSX.Element)}<!--${end}-->`
}

const wrapStringWithKeyedRange = (value: string, key: string | number | symbol) => {
  const start = createKeyedRangeMarker(key, 'start')
  const end = createKeyedRangeMarker(key, 'end')
  return `<!--${start}-->${value}<!--${end}-->`
}

const resolveForItemKey = <T>(
  value: ForValue<T>,
  item: T,
  index: number,
): string | number | symbol =>
  value.key
    ? value.key(item, index)
    : typeof item === 'string' || typeof item === 'number' || typeof item === 'symbol'
      ? item
      : index

const stripForChildRootKey = (value: JSX.Element): JSX.Element => {
  const resolved = resolveRenderable(value)
  if (!isRenderObject(resolved) || resolved.key === null || resolved.key === undefined) {
    return resolved
  }
  return {
    ...resolved,
    key: undefined,
  }
}

const resolveShowBranch = <T>(value: ShowValue<T>): JSX.Element => {
  const branch = !value.when ? (value.fallback ?? null) : value.children
  return typeof branch === 'function'
    ? (branch as (nextValue: T) => JSX.Element)(value.when)
    : branch
}

const renderForValueToString = <T>(value: ForValue<T>): string => {
  if (value.arr.length === 0) {
    return renderStringNode((value.fallback ?? null) as JSX.Element)
  }

  let output = ''
  for (let index = 0; index < value.arr.length; index += 1) {
    const item = value.arr[index]!
    output += wrapStringWithKeyedRange(
      renderStringNode(stripForChildRootKey(value.fn(item, index))),
      resolveForItemKey(value, item, index),
    )
  }
  return output
}

const renderProjectionSlotToNodes = (slot: ProjectionSlotValue, container: RuntimeContainer) => {
  if (!container.doc) {
    throw new Error('Client rendering requires a document.')
  }
  const frame = getCurrentFrame()

  const start = container.doc.createComment(
    createProjectionSlotMarker(slot.componentId, slot.name, slot.occurrence, 'start'),
  )
  const end = container.doc.createComment(
    createProjectionSlotMarker(slot.componentId, slot.name, slot.occurrence, 'end'),
  )
  if (frame?.component.id === slot.componentId && frame.projectionState.reuseExistingDom) {
    return [start, end]
  }
  return [start, ...renderClientInsertable(slot.source, container), end]
}

const renderContextProviderToString = (
  token: RuntimeContextToken,
  props: Record<string, unknown>,
) =>
  withRuntimeContextValue(token, props.value, () =>
    renderStringNode((props.children ?? null) as JSX.Element | JSX.Element[]),
  )

const renderContextProviderToNodes = (
  token: RuntimeContextToken,
  props: Record<string, unknown>,
  container: RuntimeContainer,
) =>
  withRuntimeContextValue(token, props.value, () =>
    renderClientNodes((props.children ?? null) as JSX.Element | JSX.Element[], container),
  )

const renderStringNode = (inputElementLike: JSX.Element | JSX.Element[]): string => {
  if (Array.isArray(inputElementLike)) {
    return renderStringArray(inputElementLike)
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
  if (isSSRRawValue(resolved)) {
    return resolved.value
  }
  if (isShowValue(resolved)) {
    return renderStringNode(resolveShowBranch(resolved))
  }
  if (isForValue(resolved)) {
    return renderForValueToString(resolved)
  }
  if (isSSRTemplate(resolved)) {
    return renderSSRTemplateNode(resolved)
  }
  if (isProjectionSlot(resolved)) {
    return renderProjectionSlotToString(resolved)
  }
  if (isRouteSlot(resolved)) {
    const routeElement = resolveRouteSlot(getCurrentContainer(), resolved)
    return routeElement ? renderStringNode(routeElement as JSX.Element) : ''
  }
  if (!isRenderObject(resolved)) {
    return ''
  }

  if (isSuspenseType(resolved.type)) {
    const rendered = renderSuspenseComponentToString(resolved.props as SuspenseProps)
    return resolved.key === null || resolved.key === undefined
      ? rendered
      : wrapStringWithKeyedRange(rendered, resolved.key)
  }

  if (typeof resolved.type === 'function') {
    const providerMeta = getContextProviderMeta(resolved.type)
    if (providerMeta) {
      return renderContextProviderToString(providerMeta.token, evaluateProps(resolved.props))
    }

    const container = getCurrentContainer()
    const componentFn = resolved.type as Component
    const meta = getComponentMeta(componentFn)
    if (!meta || !container) {
      const rendered = renderStringNode(componentFn(resolved.props))
      return resolved.key === null || resolved.key === undefined
        ? rendered
        : wrapStringWithKeyedRange(rendered, resolved.key)
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
    component.optimizedRoot = meta.optimizedRoot === true
    component.props = evaluatedProps
    component.projectionSlots = meta.projectionSlots ?? null
    const frame = createFrame(container, component, 'ssr')
    clearComponentSubscriptions(container, component.id)
    const renderProps = createRenderProps(componentId, meta, resolved.props)

    const body = pushFrame(frame, () => renderStringNode(componentFn(renderProps)))
    pruneComponentVisibles(container, component, frame.visibleCursor)
    pruneComponentWatches(container, component, frame.watchCursor)
    const rendered = `<!--ec:c:${componentId}:start-->${renderFrameScopedStylesToString(frame)}${body}<!--ec:c:${componentId}:end-->`
    return resolved.key === null || resolved.key === undefined
      ? rendered
      : wrapStringWithKeyedRange(rendered, resolved.key)
  }

  const attrParts: string[] = []
  const container = getCurrentContainer()
  const frame = getCurrentFrame()
  let hasInnerHTML = false
  let innerHTML: string | null = null

  if (frame && hasScopedStyles(frame) && resolved.type !== 'style') {
    attrParts.push(`${SCOPED_STYLE_ATTR}="${escapeAttr(frame.component.scopeId)}"`)
  }

  for (const name in resolved.props) {
    if (!Object.hasOwn(resolved.props, name)) {
      continue
    }
    if (name === 'children') {
      continue
    }
    if (name === 'key') {
      continue
    }

    const eventName = toEventName(name)
    const value = resolved.props[name]

    if (name === BIND_VALUE_PROP) {
      const signalId = getBindableSignalId(value)
      if (!signalId) {
        continue
      }
      attrParts.push(`${BIND_VALUE_ATTR}="${escapeAttr(signalId)}"`)
      const currentValue = readBindableSignalValue(value)
      if (currentValue !== undefined && currentValue !== null) {
        attrParts.push(`value="${escapeAttr(String(currentValue))}"`)
      }
      continue
    }

    if (name === BIND_CHECKED_PROP) {
      const signalId = getBindableSignalId(value)
      if (!signalId) {
        continue
      }
      attrParts.push(`${BIND_CHECKED_ATTR}="${escapeAttr(signalId)}"`)
      if (readBindableSignalValue(value)) {
        attrParts.push('checked')
      }
      continue
    }

    if (eventName) {
      const eventMeta = getRuntimeEventDescriptor(value)
      if (!eventMeta || !container) {
        continue
      }
      attrParts.push(`data-eid="e${container.nextElementId++}"`)
      attrParts.push(
        `data-e-on${eventName}="${escapeAttr(registerEventBinding(container, eventMeta))}"`,
      )
      continue
    }

    if (name === 'ref') {
      const signalId = getRefSignalId(value)
      if (signalId) {
        attrParts.push(`${REF_SIGNAL_ATTR}="${escapeAttr(signalId)}"`)
      }
      continue
    }

    if (name === DANGEROUSLY_SET_INNER_HTML_PROP) {
      hasInnerHTML = true
      innerHTML = resolveDangerouslySetInnerHTML(value)
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

  let childrenText = innerHTML ?? ''
  if (!hasInnerHTML) {
    const children = resolved.props.children
    if (Array.isArray(children)) {
      for (const child of children) {
        childrenText += renderStringNode(child)
      }
    } else {
      childrenText += renderStringNode(children as JSX.Element)
    }
  }

  const rendered =
    resolved.type === FRAGMENT
      ? childrenText
      : `<${resolved.type}${attrParts.length > 0 ? ` ${attrParts.join(' ')}` : ''}>${childrenText}</${
          resolved.type
        }>`
  return resolved.key === null || resolved.key === undefined
    ? rendered
    : wrapStringWithKeyedRange(rendered, resolved.key)
}

const createElementNode = (doc: Document, tagName: string) => doc.createElement(tagName)

const renderComponentToNodes = (
  componentFn: Component,
  props: Record<string, unknown>,
  container: RuntimeContainer,
  mode: RenderFrame['mode'],
  rawProps?: Record<string, unknown>,
): Node[] => {
  if (!container.doc) {
    throw new Error('Client rendering requires a document.')
  }
  const meta = getComponentMeta(componentFn)
  if (!meta) {
    return renderClientNodes(componentFn((rawProps ?? props) as Record<string, unknown>), container)
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
  const wasActive = component.active
  const previousRenderProps =
    ((component.rawProps ?? component.props) as Record<string, unknown> | null) ?? null
  component.active = mode === 'client'
  if (!existing || symbolChanged) {
    resetComponentForSymbolChange(container, component, meta)
  }
  component.optimizedRoot = meta.optimizedRoot === true
  component.props = props
  component.rawProps = rawProps ?? null
  component.projectionSlots = meta.projectionSlots ?? null
  const parentFrame = getCurrentFrame()
  const shouldReuseProjectionSlotDom = parentFrame?.projectionState.reuseProjectionSlotDom ?? false
  const previousStart = component.start
  const previousEnd = component.end
  const propsChanged =
    symbolChanged ||
    !areShallowEqualRenderProps(
      previousRenderProps,
      ((rawProps ?? props) as Record<string, unknown> | null) ?? null,
    )
  const boundaryContentsChanged = propsChanged || (!wasActive && !!previousStart && !!previousEnd)
  if (mode === 'client' && wasActive && previousStart && previousEnd && !boundaryContentsChanged) {
    const start = container.doc.createComment(`ec:c:${componentId}:start`)
    const end = container.doc.createComment(`ec:c:${componentId}:end`)
    ;(
      start as Comment & {
        [COMPONENT_BOUNDARY_PROPS_CHANGED]?: boolean
        [COMPONENT_BOUNDARY_SYMBOL_CHANGED]?: boolean
      }
    )[COMPONENT_BOUNDARY_PROPS_CHANGED] = false
    ;(
      start as Comment & {
        [COMPONENT_BOUNDARY_PROPS_CHANGED]?: boolean
        [COMPONENT_BOUNDARY_SYMBOL_CHANGED]?: boolean
      }
    )[COMPONENT_BOUNDARY_SYMBOL_CHANGED] = false

    if (parentFrame) {
      for (const descendantId of expandComponentIdsToDescendants(container, [componentId])) {
        parentFrame.visitedDescendants.add(descendantId)
      }
    }

    return [start, end]
  }
  const speculativeEffectCleanupSlot =
    !previousStart || !previousEnd ? null : boundaryContentsChanged ? null : createCleanupSlot()
  if (!speculativeEffectCleanupSlot) {
    resetComponentRenderEffects(component)
  }
  const frame = createFrame(container, component, mode, {
    effectCleanupSlot: speculativeEffectCleanupSlot ?? component.renderEffectCleanupSlot,
    reuseExistingDom: shouldReuseProjectionSlotDom,
    reuseProjectionSlotDom: shouldReuseProjectionSlotDom,
  })
  clearComponentSubscriptions(container, componentId)
  const oldDescendants = collectDescendantIds(container, componentId)
  const start = container.doc.createComment(`ec:c:${componentId}:start`)
  const end = container.doc.createComment(`ec:c:${componentId}:end`)
  ;(
    start as Comment & {
      [COMPONENT_BOUNDARY_PROPS_CHANGED]?: boolean
      [COMPONENT_BOUNDARY_SYMBOL_CHANGED]?: boolean
    }
  )[COMPONENT_BOUNDARY_PROPS_CHANGED] = boundaryContentsChanged
  ;(
    start as Comment & {
      [COMPONENT_BOUNDARY_PROPS_CHANGED]?: boolean
      [COMPONENT_BOUNDARY_SYMBOL_CHANGED]?: boolean
    }
  )[COMPONENT_BOUNDARY_SYMBOL_CHANGED] = symbolChanged
  if (!previousStart || !previousEnd) {
    component.start = start
    component.end = end
  }
  const renderProps = createRenderProps(componentId, meta, rawProps ?? props)
  let rendered: Node[]
  try {
    rendered = pushFrame(frame, () => toMountedNodes(componentFn(renderProps), container))
  } catch (error) {
    disposeCleanupSlot(speculativeEffectCleanupSlot)
    if (isPendingSignalError(error) && parentFrame) {
      parentFrame.visitedDescendants.add(componentId)
      for (const descendantId of frame.visitedDescendants) {
        parentFrame.visitedDescendants.add(descendantId)
      }
    }
    throw error
  }
  disposeCleanupSlot(speculativeEffectCleanupSlot)
  pruneComponentVisibles(container, component, frame.visibleCursor)
  pruneComponentWatches(container, component, frame.watchCursor)
  const preservedDescendants =
    frame.projectionState.reuseExistingDom && previousStart && previousEnd
      ? collectPreservedProjectionSlotComponentIds(container, previousStart, previousEnd)
      : new Set<string>()
  const keptDescendants = new Set([
    ...frame.visitedDescendants,
    ...preservedDescendants,
    ...collectMountedDescendantComponentIds(container, component),
  ])
  pruneRemovedComponents(container, componentId, keptDescendants)

  for (const descendantId of oldDescendants) {
    if (keptDescendants.has(descendantId)) {
      continue
    }
    clearComponentSubscriptions(container, descendantId)
  }

  if (parentFrame) {
    parentFrame.visitedDescendants.add(componentId)
    for (const descendantId of keptDescendants) {
      parentFrame.visitedDescendants.add(descendantId)
    }
  }

  scheduleMountCallbacks(container, component, frame.mountCallbacks)
  scheduleVisibleCallbacksCheck(container)
  syncEffectOnlyLocalSignalPreference(component)

  return [start, ...renderFrameScopedStylesToNodes(frame, container), ...rendered, end]
}

const wrapNodesWithKeyedRange = (
  doc: Document,
  nodes: Node[],
  key: string | number | symbol,
): Node[] => [
  doc.createComment(createKeyedRangeMarker(key, 'start')),
  ...nodes,
  doc.createComment(createKeyedRangeMarker(key, 'end')),
]

const renderForValueToNodes = <T>(value: ForValue<T>, container: RuntimeContainer): Node[] => {
  if (value.arr.length === 0) {
    return renderClientNodes((value.fallback ?? null) as JSX.Element, container)
  }

  const nodes: Node[] = []
  for (let index = 0; index < value.arr.length; index += 1) {
    const item = value.arr[index]!
    nodes.push(
      ...wrapNodesWithKeyedRange(
        container.doc!,
        renderClientNodes(stripForChildRootKey(value.fn(item, index)), container),
        resolveForItemKey(value, item, index),
      ),
    )
  }
  return nodes
}

const applyElementProp = (
  element: HTMLElement,
  name: string,
  value: unknown,
  container: RuntimeContainer,
) => {
  if (name === BIND_VALUE_PROP) {
    const signalId = getBindableSignalId(value)
    if (signalId) {
      element.setAttribute(BIND_VALUE_ATTR, signalId)
    }
    if ('value' in element) {
      ;(element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = String(
        readBindableSignalValue(value) ?? '',
      )
    }
    return
  }

  if (name === BIND_CHECKED_PROP) {
    const signalId = getBindableSignalId(value)
    if (signalId) {
      element.setAttribute(BIND_CHECKED_ATTR, signalId)
    }
    if (isHTMLInputElementNode(element)) {
      element.checked = Boolean(readBindableSignalValue(value))
    }
    return
  }

  const eventName = toEventName(name)
  if (eventName) {
    const eventMeta = getRuntimeEventDescriptor(value)
    if (!eventMeta) {
      return
    }
    element.setAttribute('data-eid', `e${container.nextElementId++}`)
    element.setAttribute(`data-e-on${eventName}`, registerEventBinding(container, eventMeta))
    return
  }

  if (name === 'ref') {
    syncRuntimeRefMarker(element, value)
    assignRuntimeRef(value, element, container)
    return
  }

  if (name === DANGEROUSLY_SET_INNER_HTML_PROP) {
    const html = resolveDangerouslySetInnerHTML(value)
    if (html !== null) {
      element.innerHTML = html
    }
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
  if (name === 'checked' && isHTMLInputElementNode(element)) {
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
  if (isShowValue(resolved)) {
    return renderClientNodes(resolveShowBranch(resolved), container)
  }
  if (isForValue(resolved)) {
    return renderForValueToNodes(resolved, container)
  }
  if (typeof Node !== 'undefined' && resolved instanceof Node) {
    rememberManagedAttributesForNode(resolved)
    return [resolved]
  }
  if (isProjectionSlot(resolved)) {
    return renderProjectionSlotToNodes(resolved, container)
  }
  if (isRouteSlot(resolved)) {
    const routeElement = resolveRouteSlot(container, resolved)
    return routeElement ? renderClientNodes(routeElement as JSX.Element, container) : []
  }
  if (!isRenderObject(resolved)) {
    return []
  }

  let nodes: Node[]

  if (isSuspenseType(resolved.type)) {
    nodes = renderSuspenseComponentToNodes(resolved.props as SuspenseProps, container, 'client')
  } else if (typeof resolved.type === 'function') {
    const providerMeta = getContextProviderMeta(resolved.type)
    if (providerMeta) {
      nodes = renderContextProviderToNodes(
        providerMeta.token,
        evaluateProps(resolved.props),
        container,
      )
    } else {
      const componentFn = resolved.type as Component
      if (getComponentMeta(resolved.type)) {
        nodes = withoutTrackedEffect(() =>
          renderComponentToNodes(
            componentFn,
            evaluateProps(resolved.props),
            container,
            'client',
            resolved.props,
          ),
        )
      } else {
        nodes = renderComponentToNodes(
          componentFn,
          resolved.props as Record<string, unknown>,
          container,
          'client',
          resolved.props,
        )
      }
    }
  } else if (resolved.type === FRAGMENT) {
    const children = resolved.props.children
    nodes = Array.isArray(children)
      ? children.flatMap((child: JSX.Element) => renderClientNodes(child, container))
      : renderClientNodes(children as JSX.Element, container)
  } else {
    const element = createElementNode(container.doc, resolved.type)
    const frame = getCurrentFrame()
    if (frame && hasScopedStyles(frame) && resolved.type !== 'style') {
      element.setAttribute(SCOPED_STYLE_ATTR, frame.component.scopeId)
    }
    let hasInnerHTML = false
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
      if (name === DANGEROUSLY_SET_INNER_HTML_PROP) {
        hasInnerHTML = true
      }
      applyElementProp(element, name, value, container)
    }

    if (hasInnerHTML) {
      rememberManagedAttributesForNode(element)
      nodes = [element]
    } else {
      const children = resolved.props.children
      const childNodes = Array.isArray(children)
        ? children.flatMap((child: JSX.Element) => renderClientNodes(child, container))
        : renderClientNodes(children as JSX.Element, container)
      for (const child of childNodes) {
        element.appendChild(child)
      }

      rememberManagedAttributesForNode(element)
      nodes = [element]
    }
  }

  return resolved.key === null || resolved.key === undefined
    ? nodes
    : wrapNodesWithKeyedRange(container.doc, nodes, resolved.key)
}

const scanComponentBoundaries = (
  root: ParentNode & { ownerDocument: Document },
): Map<string, { end?: Comment; start?: Comment }> => {
  const walker = root.ownerDocument.createTreeWalker(root, DOM_SHOW_COMMENT)
  const boundaries = new Map<string, { end?: Comment; start?: Comment }>()

  while (walker.nextNode()) {
    const node = walker.currentNode
    const isCommentNode =
      node.nodeType === DOM_COMMENT_NODE ||
      (typeof Comment !== 'undefined' && node instanceof Comment)
    if (!isCommentNode) {
      continue
    }
    const matched = (node as Comment).data.match(/^ec:c:(.+):(start|end)$/)
    if (!matched) {
      continue
    }
    const [, id, edge] = matched
    const boundary = boundaries.get(id) ?? {}
    if (edge === 'start') {
      boundary.start = node as Comment
    } else {
      boundary.end = node as Comment
    }
    boundaries.set(id, boundary)
  }

  return boundaries
}

const loadSymbol = async (
  container: RuntimeContainer,
  symbolId: string,
): Promise<RuntimeSymbolModule> => {
  const resolved = getResolvedRuntimeSymbols(container).get(symbolId)
  if (resolved) {
    return resolved
  }
  const existing = container.imports.get(symbolId)
  if (existing) {
    const module = await existing
    getResolvedRuntimeSymbols(container).set(symbolId, module)
    return module
  }

  const url = container.symbols.get(symbolId)
  if (!url) {
    throw new Error(`Missing symbol URL for ${symbolId}.`)
  }

  const loaded = (import(/* @vite-ignore */ url) as Promise<RuntimeSymbolModule>).then((module) => {
    getResolvedRuntimeSymbols(container).set(symbolId, module)
    return module
  })
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
  if (typeof Node !== 'undefined' && resolved instanceof Node) {
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

export const captureClientInsertOwner = (
  container: RuntimeContainer | null,
  siteKey?: string | null,
): ClientInsertOwner | null => {
  const frame = getCurrentFrame()
  if (!container || !frame || frame.container !== container) {
    return null
  }

  const ownerComponentId =
    typeof siteKey === 'string' && siteKey !== ''
      ? `${frame.component.id}.$i${siteKey}`
      : `${frame.component.id}.$i${frame.insertCursor++}`
  getOrCreateComponentState(
    container,
    ownerComponentId,
    CLIENT_INSERT_OWNER_SYMBOL,
    frame.component.id,
  )
  frame.visitedDescendants.add(ownerComponentId)
  return {
    childIndex: 0,
    componentId: ownerComponentId,
    projectionCounters: [...frame.projectionState.counters.entries()],
  }
}

export const createDetachedClientInsertOwner = (container: RuntimeContainer): ClientInsertOwner => {
  const componentId = `${CLIENT_INSERT_OWNER_ID_PREFIX}${container.nextComponentId++}`
  getOrCreateComponentState(container, componentId, CLIENT_INSERT_OWNER_SYMBOL, ROOT_COMPONENT_ID)
  return {
    childIndex: 0,
    componentId,
    projectionCounters: [],
  }
}

const inferClientInsertOwnerParentId = (componentId: string) => {
  if (componentId.startsWith(CLIENT_INSERT_OWNER_ID_PREFIX)) {
    return ROOT_COMPONENT_ID
  }

  const lastDotIndex = componentId.lastIndexOf('.')
  if (lastDotIndex < 0) {
    return ROOT_COMPONENT_ID
  }

  return componentId.slice(0, lastDotIndex)
}

export const renderClientInsertableForOwner = (
  value: Insertable,
  container: RuntimeContainer,
  owner: ClientInsertOwner | null,
) => {
  if (!owner) {
    return renderClientInsertable(value, container)
  }

  const component =
    container.components.get(owner.componentId) ??
    getOrCreateComponentState(
      container,
      owner.componentId,
      CLIENT_INSERT_OWNER_SYMBOL,
      inferClientInsertOwnerParentId(owner.componentId),
    )

  const parentFrame = getCurrentFrame()
  const oldDescendants = collectDescendantIds(container, owner.componentId)
  const frame = createFrame(container, component, 'client', {
    reuseExistingDom: false,
    reuseProjectionSlotDom: false,
  })
  frame.childCursor = owner.childIndex
  frame.projectionState.counters = new Map(owner.projectionCounters)
  const nodes = pushContainer(container, () =>
    pushFrame(frame, () => renderClientInsertable(value, container)),
  )
  const keptDescendants = expandComponentIdsToDescendants(container, [
    ...frame.visitedDescendants,
    ...collectComponentBoundaryIds(nodes),
  ])
  pruneRemovedComponents(container, owner.componentId, keptDescendants)
  for (const descendantId of oldDescendants) {
    if (keptDescendants.has(descendantId)) {
      continue
    }
    clearComponentSubscriptions(container, descendantId)
  }
  if (parentFrame && parentFrame !== frame) {
    parentFrame.visitedDescendants.add(owner.componentId)
    for (const descendantId of keptDescendants) {
      parentFrame.visitedDescendants.add(descendantId)
    }
  }
  return nodes
}

export const serializeContainerValue = (
  container: RuntimeContainer | null,
  value: unknown,
): SerializedValue =>
  container ? serializeRuntimeValue(container, value) : serializePublicValue(value)

export const deserializeContainerValue = (
  container: RuntimeContainer | null,
  value: SerializedValue,
): unknown =>
  container ? deserializeRuntimeValue(container, value) : deserializePublicValue(value)

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
  if (typeof Node !== 'undefined' && resolved instanceof Node) {
    rememberManagedAttributesForNode(resolved)
    return [resolved]
  }
  if (
    typeof resolved === 'string' ||
    typeof resolved === 'number' ||
    typeof resolved === 'boolean'
  ) {
    return [doc.createTextNode(String(resolved))]
  }
  if (isShowValue(resolved)) {
    return renderClientInsertable(resolveShowBranch(resolved), container)
  }
  if (isForValue(resolved)) {
    return container
      ? renderForValueToNodes(resolved, container)
      : resolved.arr.flatMap((item, index) =>
          renderClientInsertable(resolved.fn(item, index), container),
        )
  }
  if (isProjectionSlot(resolved)) {
    return container
      ? renderProjectionSlotToNodes(resolved, container)
      : renderClientInsertable(resolved.source, container)
  }
  if (isRouteSlot(resolved)) {
    const routeElement = resolveRouteSlot(container, resolved)
    return routeElement
      ? renderClientInsertable(routeElement, container)
      : [doc.createComment('eclipsa-empty')]
  }
  if (container) {
    return renderClientNodes(resolved as JSX.Element | JSX.Element[], container)
  }
  return [doc.createTextNode(String(resolved))]
}

const resetContainerForRouteRender = (container: RuntimeContainer) => {
  for (const component of container.components.values()) {
    disposeComponentMountCleanups(component)
    pruneComponentVisibles(container, component, 0)
    pruneComponentWatches(container, component, 0)
  }

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
  container.visibles.clear()
  container.watches.clear()

  for (const [id, record] of Array.from(container.signals.entries())) {
    for (const effect of Array.from(record.effects)) {
      clearEffectSignals(effect)
    }
    record.effects.clear()
    record.subscribers.clear()
    if (!isRouterSignalId(id) && !isAtomSignalId(id)) {
      container.signals.delete(id)
    }
  }
}

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
  const route =
    slot[ROUTE_SLOT_ROUTE_KEY] ??
    container?.router?.loadedRoutes.get(routeCacheKey(slot.pathname, 'page'))
  if (!route) {
    return null
  }
  return createRouteElement(route, slot.startLayoutIndex)
}

const createRouteElement = (route: LoadedRoute, startLayoutIndex = 0) => {
  const createRouteProps = (props: Record<string, unknown>) => {
    const nextProps = {
      ...props,
    }
    Object.defineProperty(nextProps, ROUTE_PARAMS_PROP, {
      configurable: true,
      enumerable: false,
      value: route.params,
      writable: true,
    })
    Object.defineProperty(nextProps, ROUTE_ERROR_PROP, {
      configurable: true,
      enumerable: false,
      value: route.error,
      writable: true,
    })
    return nextProps
  }

  if (startLayoutIndex >= route.layouts.length) {
    return jsxDEV(route.page.renderer as unknown as JSX.Type, createRouteProps({}), null, false, {})
  }

  let children: unknown = null
  for (let index = route.layouts.length - 1; index >= startLayoutIndex; index -= 1) {
    const layout = route.layouts[index]!
    children = jsxDEV(
      layout.renderer as unknown as JSX.Type,
      createRouteProps({
        children: createRouteSlot(route, index + 1),
      }),
      null,
      false,
      {},
    )
  }
  return children
}

const trackSuspenseBoundaryPromise = (
  container: RuntimeContainer,
  componentId: string,
  promise: Promise<unknown>,
) => {
  const component = container.components.get(componentId)
  if (!component) {
    return
  }
  component.suspensePromise = promise
  promise.finally(() => {
    const current = container.components.get(componentId)
    if (!current || current.suspensePromise !== promise) {
      return
    }
    current.suspensePromise = null
    current.active = false
    container.dirty.add(componentId)
    void flushDirtyComponents(container)
  })
}

const renderSuspenseContentToString = (
  props: SuspenseProps,
  container: RuntimeContainer,
  componentId: string,
) => {
  try {
    const rendered =
      typeof props.children === 'function' ? props.children() : (props.children ?? null)
    return renderStringNode(rendered as JSX.Element | JSX.Element[])
  } catch (error) {
    if (!isPendingSignalError(error)) {
      throw error
    }
    container.pendingSuspensePromises.add(error.promise)
    const component = container.components.get(componentId)
    if (component) {
      component.suspensePromise = error.promise
    }
    return renderStringNode((props.fallback ?? null) as JSX.Element | JSX.Element[])
  }
}

export const collectPendingSuspenseBoundaryIds = (container: RuntimeContainer) =>
  [...container.components.values()]
    .filter(
      (component) => component.symbol === SUSPENSE_COMPONENT_SYMBOL && !!component.suspensePromise,
    )
    .map((component) => component.id)
    .sort((left, right) => left.split('.').length - right.split('.').length)

export const renderResolvedSuspenseBoundaryToString = (
  container: RuntimeContainer,
  componentId: string,
) => {
  const component = container.components.get(componentId)
  if (!component || component.symbol !== SUSPENSE_COMPONENT_SYMBOL) {
    throw new Error(`Missing suspense boundary ${componentId}.`)
  }

  pruneRemovedComponents(container, componentId, new Set())
  clearComponentSubscriptions(container, component.id)
  component.suspensePromise = null
  const frame = createFrame(container, component, 'ssr')
  return pushContainer(container, () =>
    pushFrame(frame, () =>
      renderSuspenseContentToString(component.props as SuspenseProps, container, componentId),
    ),
  )
}

const renderSuspenseContentToNodes = (
  props: SuspenseProps,
  container: RuntimeContainer,
  componentId: string,
) => {
  try {
    const rendered =
      typeof props.children === 'function' ? props.children() : (props.children ?? null)
    return toMountedNodes(rendered as JSX.Element | JSX.Element[], container)
  } catch (error) {
    if (!isPendingSignalError(error)) {
      throw error
    }
    trackSuspenseBoundaryPromise(container, componentId, error.promise)
    const fallback = props.fallback ?? null
    return toMountedNodes(fallback as JSX.Element | JSX.Element[], container)
  }
}

const renderSuspenseComponentToString = (props: SuspenseProps) => {
  const container = getCurrentContainer()
  if (!container) {
    return renderStringNode((props.children ?? null) as JSX.Element | JSX.Element[])
  }
  const parentFrame = getCurrentFrame()
  if (!parentFrame) {
    return renderSuspenseContentToString(props, container, ROOT_COMPONENT_ID)
  }

  const position = nextComponentPosition(container)
  const componentId = createComponentId(container, position.parentId, position.childIndex)
  const component = getOrCreateComponentState(
    container,
    componentId,
    SUSPENSE_COMPONENT_SYMBOL,
    position.parentId,
  )
  component.props = {
    children: props.children,
    fallback: props.fallback,
  }
  component.projectionSlots = null
  const frame = createFrame(container, component, 'ssr')
  clearComponentSubscriptions(container, component.id)
  const body = pushFrame(frame, () =>
    renderSuspenseContentToString(component.props as SuspenseProps, container, componentId),
  )
  pruneComponentVisibles(container, component, frame.visibleCursor)
  pruneComponentWatches(container, component, frame.watchCursor)
  return `<!--ec:c:${componentId}:start-->${body}<!--ec:c:${componentId}:end-->`
}

const renderSuspenseComponentToNodes = (
  props: SuspenseProps,
  container: RuntimeContainer,
  mode: RenderFrame['mode'],
) => {
  const parentFrame = getCurrentFrame()
  if (!parentFrame) {
    return renderSuspenseContentToNodes(props, container, ROOT_COMPONENT_ID)
  }

  const position = nextComponentPosition(container)
  const componentId = createComponentId(container, position.parentId, position.childIndex)
  const component = getOrCreateComponentState(
    container,
    componentId,
    SUSPENSE_COMPONENT_SYMBOL,
    position.parentId,
  )
  component.props = {
    children: props.children,
    fallback: props.fallback,
  }
  component.projectionSlots = null
  component.active = true
  component.start = undefined
  component.end = undefined

  const frame = createFrame(container, component, mode)
  clearComponentSubscriptions(container, component.id)
  const bodyNodes = pushFrame(frame, () =>
    renderSuspenseContentToNodes(component.props as SuspenseProps, container, componentId),
  )
  pruneComponentVisibles(container, component, frame.visibleCursor)
  pruneComponentWatches(container, component, frame.watchCursor)
  parentFrame.visitedDescendants.add(componentId)
  for (const descendantId of frame.visitedDescendants) {
    parentFrame.visitedDescendants.add(descendantId)
  }
  scheduleMountCallbacks(container, component, frame.mountCallbacks)
  scheduleVisibleCallbacksCheck(container)

  if (!container.doc) {
    return bodyNodes
  }
  const start = container.doc.createComment(`ec:c:${componentId}:start`)
  const end = container.doc.createComment(`ec:c:${componentId}:end`)
  if (!component.start || !component.end) {
    component.start = start
    component.end = end
  }
  return [start, ...bodyNodes, end]
}

const renderRouteIntoRoot = (container: RuntimeContainer, Page: RouteRenderer) => {
  if (!container.doc || !container.rootElement) {
    throw new Error('Client route rendering requires a document root.')
  }

  resetContainerForRouteRender(container)
  const nodes = pushContainer(container, () => toMountedNodes(Page({}), container))

  const root = container.rootElement
  while (root.firstChild) {
    root.firstChild.remove()
  }
  for (const node of nodes) {
    root.appendChild(node)
  }
  rememberManagedAttributesForNode(root)
  restoreSignalRefs(container, root)
  bindRouterLinks(container, root)
  scheduleVisibleCallbacksCheck(container)
}

const getRouteModuleImportUrl = (router: RouterState, url: string) => {
  const token = router.routeModuleBusts.get(url)
  if (token == null) {
    return url
  }

  const baseUrl = typeof window === 'undefined' ? 'http://localhost' : window.location.href
  const nextUrl = new URL(url, baseUrl)
  nextUrl.searchParams.set('t', token.toString())
  if (/^[a-z]+:\/\//i.test(url)) {
    return nextUrl.href
  }
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

const loadRouteModule = async (router: RouterState, url: string): Promise<LoadedRouteModule> => {
  const module = (await import(/* @vite-ignore */ getRouteModuleImportUrl(router, url))) as {
    default?: RouteRenderer
    metadata?: RouteMetadataExport
  }
  if (typeof module.default !== 'function') {
    throw new TypeError(`Route module ${url} does not export a default component.`)
  }

  return {
    metadata: module.metadata ?? null,
    renderer: module.default,
    symbol: getComponentMeta(module.default)?.symbol ?? null,
    url,
  }
}

const createManagedHeadElement = (doc: Document, tagName: 'link' | 'meta') => {
  const element = doc.createElement(tagName)
  element.setAttribute(ROUTE_METADATA_HEAD_ATTR, '')
  return element
}

const applyRouteMetadata = (doc: Document, route: LoadedRoute, url: URL, defaultTitle: string) => {
  for (const element of doc.head.querySelectorAll(`[${ROUTE_METADATA_HEAD_ATTR}]`)) {
    element.remove()
  }

  const metadata = composeRouteMetadata(
    [...route.layouts.map((layout) => layout.metadata ?? null), route.page.metadata ?? null],
    {
      params: route.params,
      url,
    },
  )

  doc.title = metadata?.title ?? defaultTitle

  const appendMeta = (name: string, content: string, attr: 'name' | 'property') => {
    const meta = createManagedHeadElement(doc, 'meta')
    meta.setAttribute(attr, name)
    meta.setAttribute('content', content)
    doc.head.appendChild(meta)
  }

  if (metadata?.description) {
    appendMeta('description', metadata.description, 'name')
  }
  if (metadata?.canonical) {
    const link = createManagedHeadElement(doc, 'link')
    link.setAttribute('href', metadata.canonical)
    link.setAttribute('rel', 'canonical')
    doc.head.appendChild(link)
  }
  if (metadata?.openGraph?.title) {
    appendMeta('og:title', metadata.openGraph.title, 'property')
  }
  if (metadata?.openGraph?.description) {
    appendMeta('og:description', metadata.openGraph.description, 'property')
  }
  if (metadata?.openGraph?.type) {
    appendMeta('og:type', metadata.openGraph.type, 'property')
  }
  if (metadata?.openGraph?.url) {
    appendMeta('og:url', metadata.openGraph.url, 'property')
  }
  for (const image of metadata?.openGraph?.images ?? []) {
    appendMeta('og:image', image, 'property')
  }
  if (metadata?.twitter?.card) {
    appendMeta('twitter:card', metadata.twitter.card, 'name')
  }
  if (metadata?.twitter?.title) {
    appendMeta('twitter:title', metadata.twitter.title, 'name')
  }
  if (metadata?.twitter?.description) {
    appendMeta('twitter:description', metadata.twitter.description, 'name')
  }
  for (const image of metadata?.twitter?.images ?? []) {
    appendMeta('twitter:image', image, 'name')
  }
}

const loadResolvedRoute = async (
  container: RuntimeContainer,
  matched: {
    entry: RouteModuleManifest
    params: RouteParams
    pathname: string
  },
  variant: 'page' | 'loading' | 'error' | 'not-found' = 'page',
) => {
  const router = ensureRouterState(container)
  const normalizedPath = normalizeRoutePath(matched.pathname)
  const cacheKey = routeCacheKey(normalizedPath, variant)
  const existing = router.loadedRoutes.get(cacheKey)
  if (existing) {
    return existing
  }

  const moduleUrl =
    variant === 'page'
      ? matched.entry.page
      : variant === 'loading'
        ? matched.entry.loading
        : variant === 'error'
          ? matched.entry.error
          : matched.entry.notFound
  if (!moduleUrl) {
    return null
  }

  const [page, ...layouts] = await Promise.all([
    loadRouteModule(router, moduleUrl),
    ...matched.entry.layouts.map((layoutUrl) => loadRouteModule(router, layoutUrl)),
  ])
  let route!: LoadedRoute
  route = {
    entry: matched.entry,
    error: undefined,
    layouts,
    params: matched.params,
    pathname: normalizedPath,
    page,
    render: () => createRouteElement(route),
  }

  router.loadedRoutes.set(cacheKey, route)
  return route
}

const loadResolvedRouteFromSpecial = async (
  container: RuntimeContainer,
  pathname: string,
  kind: 'error' | 'notFound',
) => {
  const matched = findSpecialManifestEntry(ensureRouterState(container).manifest, pathname, kind)
  if (!matched) {
    return null
  }
  return loadResolvedRoute(container, matched, kind === 'error' ? 'error' : 'not-found')
}

const loadRouteComponent = async (container: RuntimeContainer, pathname: string) => {
  const matched = matchRouteManifest(ensureRouterState(container).manifest, pathname)
  if (!matched || !matched.entry.page) {
    return null
  }
  return loadResolvedRoute(container, matched, 'page')
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
      if (
        !component.start ||
        !component.end ||
        !component.start.parentNode ||
        !component.end.parentNode ||
        component.symbol !== symbol
      ) {
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
    if (chain) {
      return chain.slice(0, route.layouts.length)
    }
  }

  return findRouteComponentChain(container, symbols)
}

const getComponentIdDepth = (componentId: string) => componentId.split('.').length

const parseDirectChildIndex = (parentId: string, childId: string) => {
  if (!childId.startsWith(`${parentId}.`)) {
    return null
  }
  const remainder = childId.slice(parentId.length + 1)
  if (remainder.length === 0 || remainder.includes('.')) {
    return null
  }
  const parsed = Number(remainder)
  return Number.isInteger(parsed) ? parsed : null
}

type SharedLayoutRouteRoot =
  | {
      childIndex: number
      kind: 'direct'
      rootId: string
    }
  | {
      kind: 'owner'
      ownerId: string
      rootId: string
    }

const resolveSharedLayoutRouteRoot = (
  container: RuntimeContainer,
  boundaryId: string,
  slotRange: { start: Comment; end: Comment },
): SharedLayoutRouteRoot | null => {
  const candidateIds = [
    ...collectComponentBoundaryIds(getBoundaryChildren(slotRange.start, slotRange.end)),
  ].sort((left, right) => getComponentIdDepth(left) - getComponentIdDepth(right))

  for (const candidateId of candidateIds) {
    const childIndex = parseDirectChildIndex(boundaryId, candidateId)
    if (childIndex !== null) {
      return {
        childIndex,
        kind: 'direct',
        rootId: candidateId,
      }
    }
  }

  for (const candidateId of candidateIds) {
    const component = container.components.get(candidateId)
    if (!component?.parentId) {
      continue
    }
    const owner = container.components.get(component.parentId)
    if (!owner || owner.symbol !== CLIENT_INSERT_OWNER_SYMBOL || owner.parentId !== boundaryId) {
      continue
    }
    return {
      kind: 'owner',
      ownerId: owner.id,
      rootId: candidateId,
    }
  }

  return null
}

const renderRouteSubtreeForProjectionSlot = (
  container: RuntimeContainer,
  boundary: ComponentState,
  childIndex: number,
  source: unknown,
) => {
  const frame = createFrame(container, boundary, 'client', {
    reuseExistingDom: false,
    reuseProjectionSlotDom: false,
  })
  frame.childCursor = childIndex
  const nodes = pushContainer(container, () =>
    pushFrame(frame, () => renderClientInsertable(source, container)),
  )
  return {
    nodes,
    visitedDescendants: frame.visitedDescendants,
  }
}

const renderRouteSubtreeForProjectionSlotOwner = (
  container: RuntimeContainer,
  ownerId: string,
  source: unknown,
) => {
  const nodes = renderClientInsertableForOwner(source as Insertable, container, {
    childIndex: 0,
    componentId: ownerId,
    projectionCounters: [],
  })
  return {
    nodes,
    visitedDescendants: expandComponentIdsToDescendants(container, [ownerId]),
  }
}

const clearSharedLayoutDescendantDirtyStates = (
  container: RuntimeContainer,
  boundaryId: string,
  excludedRootId: string | null,
) => {
  for (const componentId of Array.from(container.dirty)) {
    if (!isDescendantOf(boundaryId, componentId)) {
      continue
    }
    if (
      excludedRootId &&
      (componentId === excludedRootId || isDescendantOf(excludedRootId, componentId))
    ) {
      continue
    }
    container.dirty.delete(componentId)
    const component = container.components.get(componentId)
    if (!component) {
      continue
    }
    component.activateModeOnFlush = undefined
    component.reuseExistingDomOnActivate = true
    component.reuseProjectionSlotDomOnActivate = false
  }
}

const deactivateComponentSubtree = (container: RuntimeContainer, rootId: string) => {
  const root = container.components.get(rootId)
  if (root) {
    root.active = false
  }
  for (const componentId of collectDescendantIds(container, rootId)) {
    const component = container.components.get(componentId)
    if (component) {
      component.active = false
    }
  }
}

const withUpdatedComponentChildren = (props: Record<string, unknown> | null, children: unknown) => {
  const next = {}
  if (props) {
    Object.defineProperties(next, Object.getOwnPropertyDescriptors(props))
  }
  Object.defineProperty(next, 'children', {
    configurable: true,
    enumerable: true,
    value: children,
    writable: true,
  })
  return next as Record<string, unknown>
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
  if (!boundary?.start || !boundary.end) {
    return false
  }

  const nextChildren = createRouteElement(next, sharedLayoutCount)
  const rerenderSharedLayoutBoundary = async () => {
    const focusSnapshot = captureBoundaryFocus(container.doc!, boundary.start!, boundary.end!)
    const boundaryProps =
      boundary.props && typeof boundary.props === 'object'
        ? (boundary.props as Record<string, unknown>)
        : null
    const boundaryRawProps =
      boundary.rawProps && typeof boundary.rawProps === 'object' ? boundary.rawProps : boundaryProps
    boundary.props = withUpdatedComponentChildren(boundaryProps, nextChildren)
    boundary.rawProps = withUpdatedComponentChildren(boundaryRawProps, nextChildren)
    boundary.active = false
    boundary.activateModeOnFlush = 'replace'
    boundary.reuseExistingDomOnActivate = false
    boundary.reuseProjectionSlotDomOnActivate = false
    container.dirty.add(boundaryId)
    if (boundary.start?.parentNode && 'querySelectorAll' in boundary.start.parentNode) {
      bindRouterLinks(container, boundary.start.parentNode as ParentNode)
    }
    if (container.dirty.size > 0) {
      await flushDirtyComponents(container)
    }
    if (boundary.start && boundary.end) {
      restoreBoundaryFocus(container.doc!, boundary.start, boundary.end, focusSnapshot)
    }
    return true
  }

  if ((boundary.projectionSlots?.children ?? 0) !== 1) {
    return rerenderSharedLayoutBoundary()
  }

  const slotRanges = collectProjectionSlotRanges(getBoundaryChildren(boundary.start, boundary.end))
  const slotRange = slotRanges.get(`${boundaryId}:${encodeProjectionSlotName('children')}:0`)
  if (!slotRange) {
    return rerenderSharedLayoutBoundary()
  }
  const routeRoot = resolveSharedLayoutRouteRoot(container, boundaryId, slotRange)
  if (!routeRoot) {
    return rerenderSharedLayoutBoundary()
  }
  if (routeRoot.kind === 'owner') {
    deactivateComponentSubtree(container, routeRoot.rootId)
    const focusSnapshot = captureBoundaryFocus(container.doc!, slotRange.start, slotRange.end)
    const { nodes } = renderRouteSubtreeForProjectionSlotOwner(
      container,
      routeRoot.ownerId,
      nextChildren,
    )
    replaceProjectionSlotContents(slotRange.start, slotRange.end, nodes)
    restoreBoundaryFocus(container.doc!, slotRange.start, slotRange.end, focusSnapshot)
    const boundaryProps =
      boundary.props && typeof boundary.props === 'object'
        ? (boundary.props as Record<string, unknown>)
        : null
    const boundaryRawProps =
      boundary.rawProps && typeof boundary.rawProps === 'object' ? boundary.rawProps : boundaryProps
    boundary.props = withUpdatedComponentChildren(boundaryProps, nextChildren)
    boundary.rawProps = withUpdatedComponentChildren(boundaryRawProps, nextChildren)
    container.dirty.delete(boundaryId)
    clearSharedLayoutDescendantDirtyStates(container, boundaryId, routeRoot.ownerId)
    boundary.active = false
    boundary.activateModeOnFlush = 'patch'
    boundary.reuseExistingDomOnActivate = true
    boundary.reuseProjectionSlotDomOnActivate = true
    container.dirty.add(boundaryId)
    if (boundary.start.parentNode && 'querySelectorAll' in boundary.start.parentNode) {
      bindRouterLinks(container, boundary.start.parentNode as ParentNode)
    }
    if (container.dirty.size > 0) {
      await flushDirtyComponents(container)
    }
    return true
  }

  const currentRouteRoot = container.components.get(routeRoot.rootId) ?? null
  const needsFullBoundaryRerender =
    (currentRouteRoot?.watchCount ?? 0) > 0 || (currentRouteRoot?.visibleCount ?? 0) > 0

  if (needsFullBoundaryRerender) {
    deactivateComponentSubtree(container, routeRoot.rootId)
    return rerenderSharedLayoutBoundary()
  }

  boundary.props = {
    children: nextChildren,
  }
  deactivateComponentSubtree(container, routeRoot.rootId)
  const focusSnapshot = captureBoundaryFocus(container.doc!, slotRange.start, slotRange.end)
  const { nodes, visitedDescendants } = renderRouteSubtreeForProjectionSlot(
    container,
    boundary,
    routeRoot.childIndex,
    nextChildren,
  )
  replaceProjectionSlotContents(slotRange.start, slotRange.end, nodes)
  restoreBoundaryFocus(container.doc!, slotRange.start, slotRange.end, focusSnapshot)
  pruneRemovedComponents(container, routeRoot.rootId, visitedDescendants)
  boundary.active = false
  boundary.activateModeOnFlush = 'patch'
  boundary.reuseExistingDomOnActivate = true
  boundary.reuseProjectionSlotDomOnActivate = true
  container.dirty.add(boundaryId)
  if (boundary.start.parentNode && 'querySelectorAll' in boundary.start.parentNode) {
    bindRouterLinks(container, boundary.start.parentNode as ParentNode)
  }
  if (container.dirty.size > 0) {
    await flushDirtyComponents(container)
  }
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

const cachePrefetchedLoaders = (
  container: RuntimeContainer,
  url: URL,
  loaders: Record<string, ResumeLoaderPayload>,
) => {
  const router = ensureRouterState(container)
  const snapshots = new Map<string, LoaderSnapshot>()
  for (const [id, loaderPayload] of Object.entries(loaders)) {
    snapshots.set(id, {
      data: deserializeRuntimeValue(container, loaderPayload.data),
      error: deserializeRuntimeValue(container, loaderPayload.error),
      loaded: loaderPayload.loaded,
    })
  }
  router.prefetchedLoaders.set(routePrefetchKey(url), snapshots)
}

const applyPrefetchedLoaders = (container: RuntimeContainer, url: URL) => {
  const router = ensureRouterState(container)
  const prefetchedLoaders = router.prefetchedLoaders.get(routePrefetchKey(url))
  if (!prefetchedLoaders) {
    return
  }
  for (const [id, snapshot] of prefetchedLoaders) {
    container.loaderStates.set(id, {
      data: snapshot.data,
      error: snapshot.error,
      loaded: snapshot.loaded,
    })
  }
}

const isRouteDataSuccess = (body: RouteDataResponse): body is RouteDataSuccess =>
  body.ok === true &&
  typeof body.finalHref === 'string' &&
  typeof body.finalPathname === 'string' &&
  (body.kind === 'page' || body.kind === 'not-found') &&
  !!body.loaders &&
  typeof body.loaders === 'object'

const extractScriptTextById = (html: string, id: string) => {
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  const idPattern = /\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/i

  for (const match of html.matchAll(scriptPattern)) {
    const attrs = match[1] ?? ''
    const idMatch = attrs.match(idPattern)
    if (!idMatch) {
      continue
    }
    if ((idMatch[1] ?? idMatch[2]) === id) {
      return match[2] ?? ''
    }
  }

  return null
}

const parseRouteDataFromHtml = (
  container: RuntimeContainer,
  requestUrl: URL,
  response: {
    url?: string
  },
  html: string,
): RouteDataResponse => {
  const finalUrl = new URL(response.url || requestUrl.href, requestUrl.href)
  if (finalUrl.origin !== requestUrl.origin) {
    return {
      location: finalUrl.href,
      ok: false,
    }
  }

  const payloadText =
    extractScriptTextById(html, RESUME_FINAL_STATE_ELEMENT_ID) ??
    extractScriptTextById(html, RESUME_STATE_ELEMENT_ID)
  if (!payloadText) {
    return {
      document: true,
      ok: false,
    }
  }

  let payload: ResumePayload
  try {
    payload = JSON.parse(payloadText) as ResumePayload
  } catch {
    return {
      document: true,
      ok: false,
    }
  }

  const finalPathname = normalizeRoutePath(finalUrl.pathname)
  const router = ensureRouterState(container)
  const matched = matchRouteManifest(router.manifest, finalPathname)
  const notFoundMatched = !matched
    ? findSpecialManifestEntry(router.manifest, finalPathname, 'notFound')
    : null
  if (!matched?.entry.page && !notFoundMatched?.entry.notFound) {
    return {
      document: true,
      ok: false,
    }
  }

  return {
    finalHref: finalUrl.href,
    finalPathname,
    kind: matched?.entry.page ? 'page' : 'not-found',
    loaders: payload.loaders ?? {},
    ok: true,
  }
}

const requestRouteData = async (
  container: RuntimeContainer,
  href: string,
): Promise<RouteDataResponse> => {
  const baseUrl = typeof window === 'undefined' ? 'http://localhost' : window.location.href
  const requestUrl = new URL(href, baseUrl)

  try {
    const endpointUrl = new URL(ROUTE_DATA_ENDPOINT, requestUrl)
    endpointUrl.searchParams.set('href', requestUrl.href)
    const response = await fetch(endpointUrl.href)
    if (response.status >= 200 && response.status < 300) {
      const body = (await response.json()) as RouteDataResponse
      if (!body || typeof body !== 'object' || typeof body.ok !== 'boolean') {
        return {
          document: true,
          ok: false,
        }
      }
      if (isRouteDataSuccess(body)) {
        return body
      }
      if ('location' in body && typeof body.location === 'string') {
        return body
      }
    }
  } catch {}

  try {
    const response = await fetch(requestUrl.href)
    const html = await response.text()
    return parseRouteDataFromHtml(container, requestUrl, response, html)
  } catch {}

  return {
    document: true,
    ok: false,
  }
}

const resetRouteLoaderState = (container: RuntimeContainer) => {
  container.loaders.clear()
  container.loaderStates.clear()

  for (const [id, record] of Array.from(container.signals.entries())) {
    if (!isLoaderSignalId(id)) {
      continue
    }
    for (const effect of Array.from(record.effects)) {
      clearEffectSignals(effect)
    }
    record.effects.clear()
    record.subscribers.clear()
    container.signals.delete(id)
  }
}

const requestRoutePreflight = async (href: string): Promise<RoutePreflightResult> => {
  try {
    const requestUrl = new URL(
      href,
      typeof window === 'undefined' ? 'http://localhost' : window.location.href,
    )
    const response = await fetch(requestUrl.href, {
      headers: {
        [ROUTE_PREFLIGHT_REQUEST_HEADER]: '1',
      },
    })
    if (response.status < 200 || response.status >= 300) {
      return {
        document: true,
        ok: false,
      }
    }
    const finalUrl = new URL(response.url || requestUrl.href, requestUrl.href)
    if (
      finalUrl.origin !== requestUrl.origin ||
      finalUrl.pathname !== requestUrl.pathname ||
      finalUrl.search !== requestUrl.search
    ) {
      return {
        location: finalUrl.href,
        ok: false,
      }
    }
    return {
      ok: true,
    }
  } catch {
    return {
      document: true,
      ok: false,
    }
  }
}

const prefetchResolvedRouteModules = async (
  container: RuntimeContainer,
  pathname: string,
  finalUrl: URL,
) => {
  const router = ensureRouterState(container)
  const matched = matchRouteManifest(router.manifest, pathname)
  if (matched?.entry.page) {
    await loadResolvedRoute(container, matched)
    return
  }
  const notFoundMatched = findSpecialManifestEntry(router.manifest, pathname, 'notFound')
  if (notFoundMatched?.entry.notFound) {
    await loadResolvedRoute(container, notFoundMatched, 'not-found')
  }
  if (finalUrl.pathname !== pathname) {
    const redirectedPath = normalizeRoutePath(finalUrl.pathname)
    const redirectedMatched = matchRouteManifest(router.manifest, redirectedPath)
    if (redirectedMatched?.entry.page) {
      await loadResolvedRoute(container, redirectedMatched)
    }
  }
}

const prefetchRoute = async (container: RuntimeContainer, href: string) => {
  const doc = container.doc
  if (!doc) {
    return
  }

  const requestUrl = new URL(href, doc.location.href)
  if (requestUrl.origin !== doc.location.origin) {
    return
  }
  const key = routePrefetchKey(requestUrl)
  const router = ensureRouterState(container)
  const existing = router.routePrefetches.get(key)
  if (existing) {
    await existing
    return
  }

  const pathname = normalizeRoutePath(requestUrl.pathname)
  const matched = matchRouteManifest(router.manifest, pathname)
  const specialRoute = !matched
    ? findSpecialManifestEntry(router.manifest, pathname, 'notFound')
    : null
  if (!matched?.entry.page && !specialRoute?.entry.notFound) {
    return
  }

  const prefetchPromise = (async () => {
    try {
      const result = await requestRouteData(container, requestUrl.href)
      if (!result.ok) {
        return result
      }

      const finalUrl = new URL(result.finalHref, requestUrl.href)
      if (finalUrl.origin !== requestUrl.origin) {
        return {
          document: true,
          ok: false,
        } satisfies RoutePrefetchResult
      }

      await prefetchResolvedRouteModules(container, result.finalPathname, finalUrl)
      cachePrefetchedLoaders(container, finalUrl, result.loaders)
      return result
    } catch {
      return {
        document: true,
        ok: false,
      } satisfies RoutePrefetchResult
    }
  })()

  router.routePrefetches.set(key, prefetchPromise)
  await prefetchPromise
}

const navigateContainer = async (
  container: RuntimeContainer,
  href: string,
  options?: {
    force?: boolean
    redirectDepth?: number
    mode?: NavigationMode
  },
) => {
  const doc = container.doc
  if (!doc) {
    return
  }

  await waitForPendingDirtyFlush()

  const mode = options?.mode ?? 'push'
  const force = options?.force ?? false
  const redirectDepth = options?.redirectDepth ?? 0
  const url = new URL(href, doc.location.href)
  if (url.origin !== doc.location.origin) {
    fallbackDocumentNavigation(doc, url, mode)
    return
  }
  const pathname = normalizeRoutePath(url.pathname)
  const router = ensureRouterState(container)
  const matched = matchRouteManifest(router.manifest, pathname)
  const specialPreflightTarget = !matched
    ? findSpecialManifestEntry(router.manifest, pathname, 'notFound')
    : null

  const currentRouteUrl = new URL(router.currentUrl.value, doc.location.href)
  const currentHref = `${currentRouteUrl.pathname}${currentRouteUrl.search}${currentRouteUrl.hash}`
  const nextHref = `${url.pathname}${url.search}${url.hash}`
  if (!force && nextHref === currentHref) {
    return
  }

  const prefetchKey = routePrefetchKey(url)
  let pendingPrefetch = router.routePrefetches.get(prefetchKey)
  if (!pendingPrefetch && (matched?.entry.page || specialPreflightTarget?.entry.notFound)) {
    await prefetchRoute(container, url.href)
    pendingPrefetch = router.routePrefetches.get(prefetchKey)
  }
  const prefetched = pendingPrefetch ? await pendingPrefetch : null
  if (prefetched && !prefetched.ok) {
    if ('location' in prefetched) {
      if (redirectDepth >= 8) {
        fallbackDocumentNavigation(doc, new URL(prefetched.location, doc.location.href), mode)
        return
      }
      const redirectUrl = new URL(prefetched.location, doc.location.href)
      if (redirectUrl.origin !== doc.location.origin) {
        fallbackDocumentNavigation(doc, redirectUrl, mode)
        return
      }
      await navigateContainer(container, redirectUrl.href, {
        mode,
        redirectDepth: redirectDepth + 1,
      })
      return
    }
    fallbackDocumentNavigation(doc, url, mode)
    return
  }

  const shouldPreflight =
    (matched?.entry.page && matched.entry.hasMiddleware) ||
    (!!specialPreflightTarget?.entry.notFound && specialPreflightTarget.entry.hasMiddleware)
  if (shouldPreflight && !prefetched) {
    const preflight = await requestRoutePreflight(url.href)
    if (!preflight.ok) {
      if ('location' in preflight) {
        if (redirectDepth >= 8) {
          fallbackDocumentNavigation(doc, new URL(preflight.location, doc.location.href), mode)
          return
        }
        const redirectUrl = new URL(preflight.location, doc.location.href)
        if (redirectUrl.origin !== doc.location.origin) {
          fallbackDocumentNavigation(doc, redirectUrl, mode)
          return
        }
        await navigateContainer(container, redirectUrl.href, {
          mode,
          redirectDepth: redirectDepth + 1,
        })
        return
      }
      fallbackDocumentNavigation(doc, url, mode)
      return
    }
  }

  if (!matched || !matched.entry.page) {
    const notFoundRoute = !matched
      ? await loadResolvedRouteFromSpecial(container, pathname, 'notFound')
      : null
    if (notFoundRoute) {
      resetRouteLoaderState(container)
      renderRouteIntoRoot(container, notFoundRoute.render)
      router.currentRoute = notFoundRoute
      applyRouteMetadata(doc, notFoundRoute, url, router.defaultTitle)
      commitBrowserNavigation(doc, url, mode)
      writeRouterLocation(router, url)
      return
    }
    fallbackDocumentNavigation(doc, url, mode)
    return
  }

  if (!force && pathname === router.currentPath.value) {
    if (nextHref !== currentHref) {
      commitBrowserNavigation(doc, url, mode)
      writeRouterLocation(router, url)
    }
    return
  }

  resetRouteLoaderState(container)
  applyPrefetchedLoaders(
    container,
    prefetched?.ok ? new URL(prefetched.finalHref, doc.location.href) : url,
  )
  const sequence = ++router.sequence
  router.isNavigating.value = true

  try {
    const nextRoutePromise = loadResolvedRoute(container, matched)
    if (matched.entry.loading) {
      let settled = false
      nextRoutePromise.finally(() => {
        settled = true
      })
      await Promise.resolve()
      if (!settled) {
        const loadingRoute = await loadResolvedRoute(container, matched, 'loading')
        if (loadingRoute) {
          renderRouteIntoRoot(container, loadingRoute.render)
          router.currentRoute = loadingRoute
        }
      }
    }
    const [currentRoute, nextRoute] = await Promise.all([
      router.currentRoute
        ? Promise.resolve(router.currentRoute)
        : loadRouteComponent(container, router.currentPath.value),
      nextRoutePromise,
    ])
    if (!nextRoute) {
      fallbackDocumentNavigation(doc, url, mode)
      return
    }
    if (sequence !== router.sequence) {
      return
    }

    router.currentRoute = nextRoute
    writeRouterLocation(router, url)

    const sharedLayoutCount = countSharedLayouts(currentRoute, nextRoute)
    const reusedLayout =
      currentRoute && sharedLayoutCount > 0
        ? await updateSharedLayoutBoundary(container, currentRoute, nextRoute, sharedLayoutCount)
        : false

    if (!reusedLayout) {
      renderRouteIntoRoot(container, nextRoute.render)
    }

    applyRouteMetadata(doc, nextRoute, url, router.defaultTitle)
    commitBrowserNavigation(doc, url, mode)
  } catch (error) {
    if (sequence === router.sequence) {
      const fallbackRoute = isRouteNotFoundError(error)
        ? await loadResolvedRouteFromSpecial(container, pathname, 'notFound')
        : await loadResolvedRoute(container, matched, 'error')
      if (fallbackRoute) {
        renderRouteIntoRoot(container, fallbackRoute.render)
        router.currentRoute = fallbackRoute
        applyRouteMetadata(doc, fallbackRoute, url, router.defaultTitle)
        commitBrowserNavigation(doc, url, mode)
        writeRouterLocation(router, url)
        return
      }
      fallbackDocumentNavigation(doc, url, mode)
    }
  } finally {
    if (sequence === router.sequence) {
      router.isNavigating.value = false
    }
  }
}

export const refreshRouteContainer = async (container: RuntimeContainer) => {
  const doc = container.doc
  if (!doc) {
    return false
  }
  const url = new URL(doc.location.href)
  const router = ensureRouterState(container)
  const key = routePrefetchKey(url)
  router.prefetchedLoaders.delete(key)
  router.routePrefetches.delete(key)
  await prefetchRoute(container, url.href)
  await navigateContainer(container, url.href, {
    force: true,
    mode: 'replace',
  })
  return true
}

const routeEntryReferencesModuleUrl = (entry: RouteModuleManifest, fileUrl: string) =>
  entry.page === fileUrl ||
  entry.loading === fileUrl ||
  entry.error === fileUrl ||
  entry.notFound === fileUrl ||
  entry.layouts.includes(fileUrl)

const routeReferencesModuleUrl = (route: LoadedRoute, fileUrl: string) =>
  route.page.url === fileUrl ||
  route.layouts.some((layout) => layout.url === fileUrl) ||
  routeEntryReferencesModuleUrl(route.entry, fileUrl)

const resolveCurrentRouteManifestEntry = (router: RouterState) => {
  const currentPath = normalizeRoutePath(router.currentPath.value)
  const matched = matchRouteManifest(router.manifest, currentPath)
  if (matched?.entry.page) {
    return matched.entry
  }
  return findSpecialManifestEntry(router.manifest, currentPath, 'notFound')?.entry ?? null
}

export const invalidateRouteModulesForHmr = (
  container: RuntimeContainer,
  fileUrl: string,
  bustToken = Date.now(),
) => {
  const router = container.router
  if (!router) {
    return false
  }

  let invalidated = false
  for (const [cacheKey, route] of Array.from(router.loadedRoutes.entries())) {
    if (!routeReferencesModuleUrl(route, fileUrl)) {
      continue
    }
    router.loadedRoutes.delete(cacheKey)
    invalidated = true
  }

  if (router.currentRoute && routeReferencesModuleUrl(router.currentRoute, fileUrl)) {
    router.currentRoute = null
    invalidated = true
  }

  const currentEntry = resolveCurrentRouteManifestEntry(router)
  if (currentEntry && routeEntryReferencesModuleUrl(currentEntry, fileUrl)) {
    invalidated = true
  }

  if (!invalidated) {
    return false
  }

  router.routeModuleBusts.set(fileUrl, bustToken)

  if (container.doc) {
    const currentUrl = new URL(container.doc.location.href)
    const currentKey = routePrefetchKey(currentUrl)
    router.prefetchedLoaders.delete(currentKey)
    router.routePrefetches.delete(currentKey)
  }

  return true
}

export const refreshRouteContainerForHmr = async (
  container: RuntimeContainer,
  fileUrl: string,
  bustToken = Date.now(),
) => {
  const doc = container.doc
  if (!doc || !invalidateRouteModulesForHmr(container, fileUrl, bustToken)) {
    return false
  }

  const router = ensureRouterState(container)
  const pathname = normalizeRoutePath(router.currentPath.value)

  try {
    const nextRoute =
      (await loadRouteComponent(container, pathname)) ??
      (await loadResolvedRouteFromSpecial(container, pathname, 'notFound'))
    if (!nextRoute) {
      await refreshRouteContainer(container)
      return true
    }

    renderRouteIntoRoot(container, nextRoute.render)
    router.currentRoute = nextRoute
    applyRouteMetadata(doc, nextRoute, new URL(doc.location.href), router.defaultTitle)
    return true
  } catch {
    await refreshRouteContainer(container)
    return true
  }
}

export const refreshRegisteredRouteContainers = async () => {
  for (const container of getResumeContainers()) {
    await refreshRouteContainer(container)
  }
}

const activateComponent = async (container: RuntimeContainer, componentId: string) => {
  const component = container.components.get(componentId)
  if (!component?.start || !component.end || component.active) {
    return false
  }
  const activateSymbol = component.symbol
  const activateMode = component.activateModeOnFlush ?? 'replace'
  component.activateModeOnFlush = undefined

  if (component.symbol === SUSPENSE_COMPONENT_SYMBOL) {
    clearComponentSubscriptions(container, componentId)
    const oldDescendants = collectDescendantIds(container, componentId)
    const suspenseSpeculativeEffectCleanupSlot = component.reuseProjectionSlotDomOnActivate
      ? createCleanupSlot()
      : null
    if (!suspenseSpeculativeEffectCleanupSlot) {
      resetComponentRenderEffects(component)
    }
    const frame = createFrame(container, component, 'client', {
      effectCleanupSlot: suspenseSpeculativeEffectCleanupSlot ?? component.renderEffectCleanupSlot,
      reuseExistingDom: component.reuseExistingDomOnActivate ?? true,
      reuseProjectionSlotDom: component.reuseProjectionSlotDomOnActivate ?? false,
    })
    component.reuseExistingDomOnActivate = true
    component.reuseProjectionSlotDomOnActivate = false
    const parentRoot = component.start.parentNode
    const focusSnapshot = captureBoundaryFocus(container.doc!, component.start, component.end)
    let nodes: Node[]
    try {
      nodes = pushContainer(container, () =>
        pushFrame(frame, () =>
          renderSuspenseContentToNodes(component.props as SuspenseProps, container, componentId),
        ),
      )
    } catch (error) {
      disposeCleanupSlot(suspenseSpeculativeEffectCleanupSlot)
      throw error
    }
    disposeCleanupSlot(suspenseSpeculativeEffectCleanupSlot)
    pruneComponentVisibles(container, component, frame.visibleCursor)
    pruneComponentWatches(container, component, frame.watchCursor)
    const patched =
      activateMode === 'patch' &&
      tryPatchBoundaryContentsInPlace(component.start, component.end, nodes)
    const preservedDescendants = expandComponentIdsToDescendants(
      container,
      patched
        ? frame.projectionState.reuseExistingDom
          ? collectPreservedProjectionSlotComponentIds(container, component.start, component.end)
          : new Set<string>()
        : replaceBoundaryContents(component.start, component.end, nodes, {
            preserveProjectionSlots: frame.projectionState.reuseExistingDom,
          }),
    )
    restoreBoundaryFocus(container.doc!, component.start, component.end, focusSnapshot)
    if (parentRoot) {
      bindComponentBoundaries(container, parentRoot)
      restoreSignalRefs(container, parentRoot)
    }
    component.active = true
    const keptDescendants = new Set([
      ...frame.visitedDescendants,
      ...preservedDescendants,
      ...collectMountedDescendantComponentIds(container, component),
    ])
    pruneRemovedComponents(container, componentId, keptDescendants)
    for (const descendantId of oldDescendants) {
      if (keptDescendants.has(descendantId)) {
        continue
      }
      clearComponentSubscriptions(container, descendantId)
    }
    syncEffectOnlyLocalSignalPreference(component)
    return patched
  }

  clearComponentSubscriptions(container, componentId)
  const oldDescendants = collectDescendantIds(container, componentId)
  const scope = materializeScope(container, component.scopeId)
  await preloadResumableValue(container, scope)
  const module = await loadSymbol(container, activateSymbol)
  const rawProps =
    component.rawProps && typeof component.rawProps === 'object' ? component.rawProps : null
  if (rawProps) {
    component.props = evaluateProps(rawProps)
  }
  await preloadComponentProps(
    container,
    {
      captures: () => [],
      projectionSlots: component.projectionSlots ?? undefined,
      symbol: component.symbol,
    },
    component.props,
  )
  const speculativeEffectCleanupSlot = component.reuseProjectionSlotDomOnActivate
    ? createCleanupSlot()
    : null
  if (!speculativeEffectCleanupSlot) {
    resetComponentRenderEffects(component)
  }
  const frame = createFrame(container, component, 'client', {
    effectCleanupSlot: speculativeEffectCleanupSlot ?? component.renderEffectCleanupSlot,
    reuseExistingDom: component.reuseExistingDomOnActivate ?? true,
    reuseProjectionSlotDom: component.reuseProjectionSlotDomOnActivate ?? false,
  })
  component.reuseExistingDomOnActivate = true
  component.reuseProjectionSlotDomOnActivate = false
  const parentRoot = component.start.parentNode
  const focusSnapshot = captureBoundaryFocus(container.doc!, component.start, component.end)
  let nodes: Node[]
  try {
    nodes = pushContainer(container, () =>
      pushFrame(frame, () => {
        const renderProps = rawProps
          ? createRenderProps(
              component.id,
              {
                captures: () => [],
                projectionSlots: component.projectionSlots ?? undefined,
                symbol: activateSymbol,
              },
              rawProps,
            )
          : component.props && typeof component.props === 'object'
            ? createRenderProps(
                component.id,
                {
                  captures: () => [],
                  projectionSlots: component.projectionSlots ?? undefined,
                  symbol: activateSymbol,
                },
                component.props as Record<string, unknown>,
              )
            : component.props
        const rendered = module.default(scope, renderProps)
        return toMountedNodes(rendered, container)
      }),
    )
  } catch (error) {
    disposeCleanupSlot(speculativeEffectCleanupSlot)
    throw wrapGeneratedScopeReferenceError(error, {
      componentId,
      phase: 'rerendering',
      symbolId: activateSymbol,
    })
  }
  disposeCleanupSlot(speculativeEffectCleanupSlot)
  pruneComponentVisibles(container, component, frame.visibleCursor)
  pruneComponentWatches(container, component, frame.watchCursor)
  const patched =
    activateMode === 'patch' &&
    tryPatchBoundaryContentsInPlace(component.start, component.end, nodes)
  const preservedDescendants = expandComponentIdsToDescendants(
    container,
    patched
      ? frame.projectionState.reuseExistingDom
        ? collectPreservedProjectionSlotComponentIds(container, component.start, component.end)
        : new Set<string>()
      : replaceBoundaryContents(component.start, component.end, nodes, {
          preserveProjectionSlots: frame.projectionState.reuseExistingDom,
        }),
  )
  if (component.start.parentNode && 'querySelectorAll' in component.start.parentNode) {
    bindRouterLinks(container, component.start.parentNode as ParentNode)
  }
  restoreBoundaryFocus(container.doc!, component.start, component.end, focusSnapshot)
  if (parentRoot) {
    bindComponentBoundaries(container, parentRoot)
    restoreSignalRefs(container, parentRoot)
  }

  component.active = true

  const keptDescendants = new Set([
    ...frame.visitedDescendants,
    ...preservedDescendants,
    ...collectMountedDescendantComponentIds(container, component),
  ])
  pruneRemovedComponents(container, componentId, keptDescendants)

  for (const descendantId of oldDescendants) {
    if (keptDescendants.has(descendantId)) {
      continue
    }
    clearComponentSubscriptions(container, descendantId)
  }
  scheduleMountCallbacks(container, component, frame.mountCallbacks)
  scheduleVisibleCallbacksCheck(container)
  syncEffectOnlyLocalSignalPreference(component)
  return patched
}

const sortDirtyComponents = (ids: Iterable<string>) =>
  [...ids].sort((a, b) => a.split('.').length - b.split('.').length)

const parseSymbolIdFromUrl = (url: string) => {
  const parsed = new URL(url, 'http://localhost')
  return parsed.searchParams.get('eclipsa-symbol')
}

export const resolveResumeHmrBoundarySymbols = (payload: ResumeHmrUpdatePayload) => {
  const symbolIds = new Set([...payload.rerenderComponentSymbols, ...payload.rerenderOwnerSymbols])

  for (const symbolId of symbolIds) {
    const replacementUrl = payload.symbolUrlReplacements[symbolId]
    if (!replacementUrl) {
      continue
    }
    const replacementSymbolId = parseSymbolIdFromUrl(replacementUrl)
    if (replacementSymbolId) {
      symbolIds.add(replacementSymbolId)
    }
  }

  return [...symbolIds]
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
    }
    invalidateRuntimeSymbolCaches(container, affectedIds)

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

    for (const visible of container.visibles.values()) {
      if (affectedIds.has(visible.symbol)) {
        visible.symbol = nextSymbolId
      }
    }

    container.symbols.set(nextSymbolId, url)
    invalidateRuntimeSymbolCaches(container, [nextSymbolId])
  }
}

export const markResumeHmrBoundaryDirty = (container: RuntimeContainer, boundaryId: string) => {
  const component = container.components.get(boundaryId)
  if (!component) {
    return false
  }
  resetComponentVisibleStates(container, boundaryId)
  component.active = false
  component.activateModeOnFlush = 'replace'
  component.reuseExistingDomOnActivate = false
  component.reuseProjectionSlotDomOnActivate = false
  container.dirty.add(boundaryId)
  return true
}

export const applyResumeHmrUpdate = async (
  container: RuntimeContainer,
  payload: ResumeHmrUpdatePayload,
) => {
  if (payload.fullReload) {
    return 'reload' as const
  }

  const rerenderSymbolIds = resolveResumeHmrBoundarySymbols(payload)
  const boundaryIds = collectResumeHmrBoundaryIds(container, rerenderSymbolIds)
  if (boundaryIds === null || (rerenderSymbolIds.length > 0 && boundaryIds.length === 0)) {
    return 'reload' as const
  }

  applyResumeHmrSymbolReplacements(container, payload.symbolUrlReplacements)
  const invalidatedSymbolIds = rerenderSymbolIds.filter((symbolId) => {
    if (Object.hasOwn(payload.symbolUrlReplacements, symbolId)) {
      return true
    }
    const currentUrl = container.symbols.get(symbolId)
    return !!currentUrl && canBustRuntimeSymbolUrl(currentUrl)
  })
  bustRuntimeSymbolUrls(container, invalidatedSymbolIds, Date.now())
  invalidateRuntimeSymbolCaches(container, invalidatedSymbolIds)

  for (const boundaryId of boundaryIds) {
    markResumeHmrBoundaryDirty(container, boundaryId)
  }

  if (container.dirty.size > 0) {
    await flushDirtyComponents(container)
  }

  return 'updated' as const
}

export const applyResumeHmrUpdateToRegisteredContainers = async (
  payload: ResumeHmrUpdatePayload,
) => {
  const routeRefreshBustToken = Date.now()
  let handled = false
  for (const container of getResumeContainers()) {
    const refreshed = await refreshRouteContainerForHmr(
      container,
      payload.fileUrl,
      routeRefreshBustToken,
    )
    if (refreshed) {
      handled = true
      continue
    }
    const result = await applyResumeHmrUpdate(container, payload)
    if (result === 'updated') {
      handled = true
    }
  }

  return handled ? ('updated' as const) : ('reload' as const)
}

export const flushDirtyComponents = async (container: RuntimeContainer) => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  while (true) {
    const existing = globalRecord[DIRTY_FLUSH_PROMISE_KEY]
    if (existing instanceof Promise) {
      await existing
      if (container.dirty.size === 0) {
        return
      }
      continue
    }

    if (container.dirty.size === 0) {
      return
    }

    const pendingFocus = capturePendingFocusRestore(container, container.doc?.activeElement)

    const flushing = (async () => {
      while (container.dirty.size > 0) {
        const batch = sortDirtyComponents(container.dirty)
        container.dirty.clear()
        const patchedAncestors = new Set<string>()
        const rerendered = new Set<string>()
        for (const componentId of batch) {
          const rerenderedParent = [...rerendered].find(
            (parentId) => componentId === parentId || isDescendantOf(parentId, componentId),
          )
          if (rerenderedParent) {
            const component = container.components.get(componentId)
            if (
              patchedAncestors.has(rerenderedParent) &&
              component?.start?.parentNode &&
              component.end?.parentNode
            ) {
              component.active = false
              container.dirty.add(componentId)
            }
            continue
          }
          const component = container.components.get(componentId)
          if (component?.active) {
            continue
          }
          const preservesProjectionSlotDom =
            (component?.activateModeOnFlush ?? 'replace') === 'patch' &&
            (component?.reuseProjectionSlotDomOnActivate ?? false)
          const patched = await activateComponent(container, componentId)
          rerendered.add(componentId)
          if (preservesProjectionSlotDom && patched) {
            patchedAncestors.add(componentId)
          }
        }
      }
    })()

    globalRecord[DIRTY_FLUSH_PROMISE_KEY] = flushing
    try {
      await flushing
    } finally {
      if (globalRecord[DIRTY_FLUSH_PROMISE_KEY] === flushing) {
        delete globalRecord[DIRTY_FLUSH_PROMISE_KEY]
      }
    }

    restorePendingFocus(container, pendingFocus)

    if (container.dirty.size === 0) {
      return
    }
  }
}

const waitForPendingDirtyFlush = async () => {
  const existing = (globalThis as Record<PropertyKey, unknown>)[DIRTY_FLUSH_PROMISE_KEY]
  if (existing instanceof Promise) {
    await existing
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
    mountCleanupSlots: [],
    parentId: null,
    props: {},
    projectionSlots: null,
    rawProps: null,
    renderEffectCleanupSlot: createCleanupSlot(),
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol: ROOT_COMPONENT_ID,
    suspensePromise: null,
    visibleCount: 0,
    watchCount: 0,
  }

  const rootFrame = createFrame(container, rootComponent, 'ssr')
  const result = pushContainer(container, () => pushFrame(rootFrame, render))
  return {
    container,
    result,
  }
}

export const beginAsyncSSRContainer = async <T>(
  symbols: Record<string, string>,
  render: () => T,
  prepare?: (container: RuntimeContainer) => void | Promise<void>,
  options?: {
    asyncSignalSnapshotCache?: Map<string, unknown>
  },
): Promise<{
  container: RuntimeContainer
  result: T
}> => {
  const container = createContainer(symbols, undefined, options?.asyncSignalSnapshotCache)
  const rootComponent: ComponentState = {
    active: false,
    didMount: false,
    id: ROOT_COMPONENT_ID,
    mountCleanupSlots: [],
    parentId: null,
    props: {},
    projectionSlots: null,
    rawProps: null,
    renderEffectCleanupSlot: createCleanupSlot(),
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol: ROOT_COMPONENT_ID,
    suspensePromise: null,
    visibleCount: 0,
    watchCount: 0,
  }

  const rootFrame = createFrame(container, rootComponent, 'ssr')
  await prepare?.(container)
  const result = pushContainer(container, () => pushFrame(rootFrame, render))
  return {
    container,
    result,
  }
}

const createResumePayload = (
  container: RuntimeContainer,
  componentIds?: Iterable<string>,
): ResumePayload => {
  const keepComponents = componentIds ? new Set(componentIds) : null
  const componentEntries = [...container.components.entries()].filter(
    ([id]) => !keepComponents || keepComponents.has(id),
  )
  const keepSignals = new Set(componentEntries.flatMap(([, component]) => component.signalIds))
  if (keepComponents) {
    for (const [id, record] of container.signals.entries()) {
      if ([...record.subscribers].some((componentId) => keepComponents.has(componentId))) {
        keepSignals.add(id)
      }
    }
  }

  return {
    actions: Object.fromEntries(
      [...container.actionStates.entries()].map(([id, action]) => [
        id,
        {
          error: serializeRuntimeValue(container, action.error),
          input: serializeRuntimeValue(container, action.input),
          result: serializeRuntimeValue(container, action.result),
        } satisfies ResumeActionPayload,
      ]),
    ),
    components: Object.fromEntries(
      componentEntries.map(([id, component]) => [
        id,
        {
          ...(component.optimizedRoot ? { optimizedRoot: true } : {}),
          props: serializeRuntimeValue(container, component.props),
          ...(component.projectionSlots
            ? { projectionSlots: { ...component.projectionSlots } }
            : {}),
          scope: component.scopeId,
          signalIds: [...component.signalIds],
          symbol: component.symbol,
          visibleCount: component.visibleCount,
          watchCount: component.watchCount,
        } satisfies ResumeComponentPayload,
      ]),
    ),
    loaders: Object.fromEntries(
      [...container.loaderStates.entries()].map(([id, loader]) => [
        id,
        {
          data: serializeRuntimeValue(container, loader.data),
          error: serializeRuntimeValue(container, loader.error),
          loaded: loader.loaded,
        } satisfies ResumeLoaderPayload,
      ]),
    ),
    scopes: Object.fromEntries(container.scopes.entries()),
    signals: Object.fromEntries(
      [...container.signals.entries()]
        .filter(([id]) => !keepComponents || keepSignals.has(id))
        .map(([id, record]) => [id, serializeRuntimeValue(container, record.value)]),
    ),
    subscriptions: Object.fromEntries(
      [...container.signals.entries()]
        .filter(([id]) => !keepComponents || keepSignals.has(id))
        .map(([id, record]) => [
          id,
          [...record.subscribers].filter(
            (componentId) => !keepComponents || keepComponents.has(componentId),
          ),
        ]),
    ),
    symbols: Object.fromEntries(container.symbols.entries()),
    visibles: Object.fromEntries(
      [...container.visibles.entries()]
        .filter(([, visible]) => !keepComponents || keepComponents.has(visible.componentId))
        .map(([id, visible]) => [
          id,
          {
            componentId: visible.componentId,
            scope: visible.scopeId,
            symbol: visible.symbol,
          } satisfies ResumeVisiblePayload,
        ]),
    ),
    watches: Object.fromEntries(
      [...container.watches.entries()]
        .filter(([, watch]) => !keepComponents || keepComponents.has(watch.componentId))
        .map(([id, watch]) => [
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
  }
}

export const toResumePayload = (container: RuntimeContainer): ResumePayload =>
  createResumePayload(container)

export const toResumePayloadSubset = (
  container: RuntimeContainer,
  componentIds: Iterable<string>,
): ResumePayload => createResumePayload(container, componentIds)

const bindComponentBoundaries = (container: RuntimeContainer, root: ParentNode) => {
  if (!hasOwnerDocument(root)) {
    return
  }
  for (const [id, boundary] of scanComponentBoundaries(root)) {
    const component = container.components.get(id)
    if (!component) {
      continue
    }
    component.start = boundary.start
    component.end = boundary.end
  }
}

export const mergeResumePayload = (container: RuntimeContainer, payload: ResumePayload) => {
  for (const [id, actionPayload] of Object.entries(payload.actions ?? {})) {
    container.actionStates.set(id, {
      error: deserializeRuntimeValue(container, actionPayload.error),
      input: deserializeRuntimeValue(container, actionPayload.input),
      result: deserializeRuntimeValue(container, actionPayload.result),
    })
  }

  for (const [id, encodedValue] of Object.entries(payload.signals)) {
    const decodedValue = deserializeRuntimeValue(container, encodedValue)
    const record = ensureSignalRecord(container, id, decodedValue)
    record.value = decodedValue
  }

  for (const [id, loaderPayload] of Object.entries(payload.loaders ?? {})) {
    container.loaderStates.set(id, {
      data: deserializeRuntimeValue(container, loaderPayload.data),
      error: deserializeRuntimeValue(container, loaderPayload.error),
      loaded: loaderPayload.loaded,
    })
  }

  for (const [id, slots] of Object.entries(payload.scopes)) {
    container.scopes.set(id, slots)
  }
  container.nextScopeId = findNextNumericId(container.scopes.keys(), 'sc')

  for (const [id, componentPayload] of Object.entries(payload.components)) {
    container.components.set(id, {
      active: false,
      didMount: false,
      id,
      mountCleanupSlots: [],
      optimizedRoot: componentPayload.optimizedRoot === true,
      parentId: id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : ROOT_COMPONENT_ID,
      prefersEffectOnlyLocalSignalWrites: false,
      props: deserializeRuntimeValue(container, componentPayload.props),
      projectionSlots: componentPayload.projectionSlots
        ? { ...componentPayload.projectionSlots }
        : null,
      rawProps: null,
      renderEffectCleanupSlot: createCleanupSlot(),
      scopeId: componentPayload.scope,
      signalIds: [...componentPayload.signalIds],
      symbol: componentPayload.symbol,
      suspensePromise: null,
      visibleCount: componentPayload.visibleCount ?? 0,
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
  container.nextSignalId = findNextNumericId(container.signals.keys(), 's')
  container.nextAtomId = findNextNumericId(container.signals.keys(), 'a')

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

  for (const [id, visiblePayload] of Object.entries(payload.visibles ?? {})) {
    const visible = getOrCreateVisibleState(container, id, visiblePayload.componentId)
    visible.done = false
    visible.pending = null
    visible.run = null
    visible.scopeId = visiblePayload.scope
    visible.symbol = visiblePayload.symbol
  }
}

const pruneStreamedBoundaryDescendants = (
  container: RuntimeContainer,
  boundaryId: string,
  payload: ResumePayload,
) => {
  const keep = new Set(
    Object.keys(payload.components).filter((candidate) => isDescendantOf(boundaryId, candidate)),
  )
  pruneRemovedComponents(container, boundaryId, keep)
}

const applyStreamedSuspenseBoundary = (
  container: RuntimeContainer,
  chunk: StreamedSuspenseChunk,
) => {
  const doc = container.doc
  if (!doc) {
    return
  }
  const component = container.components.get(chunk.boundaryId)
  if (!component?.start || !component.end) {
    return
  }
  const template = doc.getElementById(chunk.templateId)
  const payloadScript = doc.getElementById(chunk.payloadScriptId)
  if (!(template instanceof HTMLTemplateElement) || !payloadScript?.textContent) {
    return
  }

  const payload = JSON.parse(payloadScript.textContent) as ResumePayload
  const focusSnapshot = captureBoundaryFocus(doc, component.start, component.end)
  const fragment = template.content.cloneNode(true) as DocumentFragment
  const nodes = [...fragment.childNodes]
  replaceBoundaryContents(component.start, component.end, nodes)
  pruneStreamedBoundaryDescendants(container, chunk.boundaryId, payload)
  mergeResumePayload(container, payload)
  component.suspensePromise = null

  const parentRoot = component.start.parentNode
  if (parentRoot) {
    bindComponentBoundaries(container, parentRoot)
    restoreSignalRefs(container, parentRoot)
    if ('querySelectorAll' in parentRoot) {
      bindRouterLinks(container, parentRoot)
    }
  }

  restoreBoundaryFocus(doc, component.start, component.end, focusSnapshot)
  scheduleVisibleCallbacksCheck(container)
  template.remove()
  payloadScript.remove()
}

const getStreamState = (): StreamState => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[STREAM_STATE_KEY]
  if (existing && typeof existing === 'object' && 'enqueue' in existing && 'pending' in existing) {
    return existing as StreamState
  }
  const created: StreamState = {
    enqueue(chunk) {
      created.pending.push(chunk)
      void created.process?.()
    },
    pending: [],
    processing: null,
  }
  globalRecord[STREAM_STATE_KEY] = created
  return created
}

export const getStreamingResumeBootstrapScriptContent = () =>
  `(()=>{const streamKey="${STREAM_STATE_KEY}";const stream=window[streamKey]??={pending:[]};stream.enqueue=stream.enqueue??function(chunk){this.pending.push(chunk);if(this.process){void this.process();}};const navKey="${PENDING_RESUME_LINK_KEY}";document.addEventListener("click",(event)=>{if(document.body?.getAttribute("data-e-resume")!=="paused")return;if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;let element=event.target instanceof Element?event.target:event.target instanceof Node?event.target.parentElement:null;while(element&&!(element instanceof HTMLAnchorElement)){element=element.parentElement;}if(!element||!element.hasAttribute("${ROUTE_LINK_ATTR}")||element.hasAttribute("download"))return;if(element.target&&element.target!=="_self")return;const href=element.getAttribute("href");if(!href)return;const url=new URL(href,window.location.href);if(url.origin!==window.location.origin)return;event.preventDefault();window[navKey]={href:url.href,replace:element.getAttribute("${ROUTE_REPLACE_ATTR}")==="true"};},{capture:true});})();`

const takePendingResumeLinkNavigation = (): PendingResumeLinkNavigation | null => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const pending = globalRecord[PENDING_RESUME_LINK_KEY]
  if (
    !pending ||
    typeof pending !== 'object' ||
    typeof (pending as { href?: unknown }).href !== 'string'
  ) {
    return null
  }
  delete globalRecord[PENDING_RESUME_LINK_KEY]
  return {
    href: (pending as { href: string }).href,
    replace: (pending as { replace?: unknown }).replace === true,
  }
}

const installStreamedSuspenseController = (container: RuntimeContainer) => {
  const state = getStreamState()
  state.process = async () => {
    if (state.processing) {
      await state.processing
      return
    }
    state.processing = (async () => {
      while (state.pending.length > 0) {
        const chunk = state.pending.shift()
        if (!chunk) {
          continue
        }
        applyStreamedSuspenseBoundary(container, chunk)
      }
    })()
    try {
      await state.processing
    } finally {
      state.processing = null
    }
  }
  if (state.pending.length > 0) {
    void state.process()
  }
}

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

  mergeResumePayload(container, payload)
  rememberManagedAttributesForNode(root as HTMLElement)
  bindComponentBoundaries(container, root as HTMLElement)
  restoreSignalRefs(container, root as HTMLElement)

  restoreRegisteredRpcHandles(container)

  ensureRouterState(container)
  syncRouterLocationSilently(container, doc.location.href)
  scheduleVisibleCallbacksCheck(container)

  return container
}

const canRestoreResumedLocalSignalEffects = (
  container: RuntimeContainer,
  component: ComponentState,
) =>
  !!component.start &&
  !!component.end &&
  !component.active &&
  component.signalIds.length > 0 &&
  (component.symbol === SUSPENSE_COMPONENT_SYMBOL ||
    container.imports.has(component.symbol) ||
    container.symbols.has(component.symbol))

export const restoreResumedLocalSignalEffects = async (container: RuntimeContainer) => {
  let queued = false
  const restoredIds: string[] = []

  for (const componentId of sortDirtyComponents(
    [...container.components.values()]
      .filter((component) => canRestoreResumedLocalSignalEffects(container, component))
      .map((component) => component.id),
  )) {
    const component = container.components.get(componentId)
    if (!component || component.active) {
      continue
    }
    component.active = false
    component.activateModeOnFlush = 'replace'
    component.reuseExistingDomOnActivate = false
    component.reuseProjectionSlotDomOnActivate = false
    container.dirty.add(component.id)
    restoredIds.push(component.id)
    queued = true
  }

  if (queued) {
    await flushDirtyComponents(container)
  }

  for (const componentId of restoredIds) {
    const component = container.components.get(componentId)
    if (!component?.active) {
      continue
    }
    syncEffectOnlyLocalSignalPreference(component)
  }
}

export const restoreRegisteredRpcHandles = (container: RuntimeContainer) => {
  withRuntimeContainer(container, () => {
    for (const id of getRegisteredActionHookIds()) {
      getRegisteredActionHook<() => unknown>(id)?.()
    }
    for (const id of getRegisteredLoaderHookIds()) {
      getRegisteredLoaderHook<() => unknown>(id)?.()
    }
  })
}

export const primeRouteModules = async (container: RuntimeContainer) => {
  const router = ensureRouterState(container)
  const currentRoute = await loadRouteComponent(container, router.currentPath.value)
  if (currentRoute) {
    router.currentRoute = currentRoute
    if (container.doc) {
      applyRouteMetadata(
        container.doc,
        currentRoute,
        new URL(container.doc.location.href),
        router.defaultTitle,
      )
    }
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
  let element = isElementNode(target)
    ? target
    : target instanceof Node
      ? target.parentElement
      : null
  while (element) {
    if (element.hasAttribute(`data-e-on${eventName}`)) {
      return element
    }
    element = element.parentElement
  }
  return null
}

const INTERACTIVE_PREFETCH_EVENT_NAMES = [
  'click',
  'input',
  'change',
  'submit',
  'keydown',
  'compositionstart',
  'compositionend',
] as const
const INTERACTIVE_PREFETCH_SELECTOR = INTERACTIVE_PREFETCH_EVENT_NAMES.map(
  (eventName) => `[data-e-on${eventName}]`,
).join(', ')

const prefetchElementSymbols = (
  container: RuntimeContainer,
  element: Element,
  eventNames: readonly string[],
) => {
  for (const eventName of eventNames) {
    const binding = element.getAttribute(`data-e-on${eventName}`)
    if (!binding) {
      continue
    }
    const { symbolId } = parseBinding(binding)
    void loadSymbol(container, symbolId).catch(() => {})
  }
}

const prefetchInteractiveTargetSymbols = (
  container: RuntimeContainer,
  target: EventTarget | null,
  eventNames: readonly string[],
) => {
  let element = isElementNode(target)
    ? target
    : target instanceof Node
      ? target.parentElement
      : null

  while (element) {
    prefetchElementSymbols(container, element, eventNames)
    element = element.parentElement
  }
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
  const matched = matchRouteManifest(ensureRouterState(container).manifest, pathname)
  if (!matched?.entry.page) {
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

const getLinkPrefetchMode = (link: HTMLAnchorElement): LinkPrefetchMode => {
  const value = link.getAttribute(ROUTE_PREFETCH_ATTR)
  if (value === 'hover' || value === 'focus' || value === 'intent' || value === 'none') {
    return value
  }
  return 'intent'
}

const findRouteLinkTarget = (target: EventTarget | null) => {
  let element = isElementNode(target)
    ? target
    : target instanceof Node
      ? target.parentElement
      : null

  while (element) {
    if (isHTMLAnchorElementNode(element) && element.hasAttribute(ROUTE_LINK_ATTR)) {
      return element
    }
    element = element.parentElement
  }

  return null
}

const bindRouterLinkPrefetch = (container: RuntimeContainer, link: HTMLAnchorElement) => {
  const boundLink = link as HTMLAnchorElement & {
    [ROUTER_LINK_PREFETCH_BOUND_KEY]?: true
  }
  if (boundLink[ROUTER_LINK_PREFETCH_BOUND_KEY]) {
    return
  }

  boundLink[ROUTER_LINK_PREFETCH_BOUND_KEY] = true
  const mode = getLinkPrefetchMode(link)
  if (mode === 'none') {
    return
  }

  const runPrefetch = () => {
    const href = link.getAttribute('href')
    if (!href) {
      return
    }
    void prefetchRoute(container, href)
  }

  const runPointerIntentPrefetch = (event: Event) => {
    if (event instanceof MouseEvent && event.button !== 0) {
      return
    }
    runPrefetch()
  }

  if (mode === 'hover' || mode === 'intent') {
    link.addEventListener('mouseenter', runPrefetch)
  }
  if (mode === 'focus' || mode === 'intent') {
    link.addEventListener('focus', runPrefetch)
  }
  if (mode === 'intent') {
    link.addEventListener('pointerdown', runPointerIntentPrefetch)
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
    if (!isHTMLAnchorElementNode(link)) {
      continue
    }
    bindRouterLinkPrefetch(container, link)
    bindRouterLink(container, link)
  }
}

export const installResumeLinkListeners = (container: RuntimeContainer) => {
  if (!container.doc) {
    return
  }
  bindRouterLinks(container, container.doc)
  const onRouteClick = (event: Event) => {
    const link = findRouteLinkTarget(event.target)
    if (!link) {
      return
    }
    const pendingLink = getPendingLinkNavigationForLink(container, event, link)
    if (!pendingLink || pendingLink.state.userPrevented) {
      return
    }
    void navigateContainer(container, pendingLink.href, {
      mode: pendingLink.replace ? 'replace' : 'push',
    })
  }
  container.doc.addEventListener('click', onRouteClick)
  const pending = takePendingResumeLinkNavigation()
  if (pending) {
    void navigateContainer(container, pending.href, {
      mode: pending.replace ? 'replace' : 'push',
    })
  }
  return () => {
    container.doc?.removeEventListener('click', onRouteClick)
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

export const createDelegatedEvent = (event: Event, currentTarget: Element) =>
  new Proxy(event, {
    get(target, property) {
      if (property === 'currentTarget') {
        return currentTarget
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as Event

const readBoundElementValue = (
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  currentValue: unknown,
) => {
  if (
    isHTMLInputElementNode(element) &&
    typeof currentValue === 'number' &&
    (element.type === 'number' || element.type === 'range') &&
    !Number.isNaN(element.valueAsNumber)
  ) {
    return element.valueAsNumber
  }

  return element.value
}

export const syncBoundElementSignal = (container: RuntimeContainer, target: EventTarget | null) => {
  if (
    !isHTMLInputElementNode(target) &&
    !isHTMLSelectElementNode(target) &&
    !isHTMLTextAreaElementNode(target)
  ) {
    return false
  }

  let didSync = false
  const valueSignalId = target.getAttribute(BIND_VALUE_ATTR)
  if (valueSignalId) {
    const record = container.signals.get(valueSignalId)
    if (record) {
      const nextValue = readBoundElementValue(target, record.value)
      writeSignalValue(container, record, nextValue)
      didSync = true
    }
  }

  if (isHTMLInputElementNode(target)) {
    const checkedSignalId = target.getAttribute(BIND_CHECKED_ATTR)
    if (checkedSignalId) {
      const record = container.signals.get(checkedSignalId)
      if (record) {
        const nextChecked = target.checked
        writeSignalValue(container, record, nextChecked)
        didSync = true
      }
    }
  }

  return didSync
}

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
    try {
      await withClientContainer(container, async () => {
        await module.default(descriptor.captures(), createDelegatedEvent(event, currentTarget))
      })
    } catch (error) {
      throw wrapGeneratedScopeReferenceError(error, {
        phase: 'running a lazy event handler for',
        symbolId: descriptor.symbol,
      })
    }
    await flushDirtyComponents(container)
  }
}

export const dispatchResumeEvent = async (container: RuntimeContainer, event: Event) => {
  const interactiveTarget = findInteractiveTarget(event.target, event.type)
  if (!interactiveTarget) {
    return
  }

  const binding = interactiveTarget.getAttribute(`data-e-on${event.type}`)
  if (!binding) {
    return
  }
  const pendingFocus = capturePendingFocusRestore(container, event.target)

  const { scopeId, symbolId } = parseBinding(binding)
  const module =
    getResolvedRuntimeSymbols(container).get(symbolId) ?? (await loadSymbol(container, symbolId))
  const scope = materializeScope(container, scopeId)
  try {
    await withClientContainer(container, async () => {
      await module.default(scope, createDelegatedEvent(event, interactiveTarget))
    })
  } catch (error) {
    throw wrapGeneratedScopeReferenceError(error, {
      phase: 'running a resumable event handler for',
      symbolId,
    })
  }
  await flushDirtyComponents(container)
  restorePendingFocus(container, pendingFocus)
}

export const dispatchDocumentEvent = async (container: RuntimeContainer, event: Event) => {
  if (container.resumeReadyPromise) {
    await container.resumeReadyPromise
  }
  const didSyncBoundSignal =
    (event.type === 'input' || event.type === 'change') &&
    syncBoundElementSignal(container, event.target)
  const pendingFocus = didSyncBoundSignal
    ? capturePendingFocusRestore(container, event.target)
    : null
  await dispatchResumeEvent(container, event)
  if (didSyncBoundSignal) {
    await flushDirtyComponents(container)
    restorePendingFocus(container, pendingFocus)
  }
  if (event.type === 'submit' && !event.defaultPrevented && isHTMLFormElementNode(event.target)) {
    const actionId = event.target.getAttribute(ACTION_FORM_ATTR)
    if (actionId) {
      const handle = container.actions.get(actionId) as
        | {
            action: (input?: unknown) => Promise<unknown>
          }
        | undefined
      if (handle) {
        event.preventDefault()
        const submitter =
          typeof SubmitEvent !== 'undefined' && event instanceof SubmitEvent
            ? (event.submitter ?? undefined)
            : undefined
        const formData = isHTMLElementNode(submitter)
          ? new FormData(event.target, submitter)
          : new FormData(event.target)
        await handle.action(formData)
        await flushDirtyComponents(container)
      }
    }
  }
}

const enqueueDocumentEvent = (container: RuntimeContainer, event: Event) => {
  if (!container.eventDispatchPromise) {
    const running = dispatchDocumentEvent(container, event)
    const tracked = running.finally(() => {
      if (container.eventDispatchPromise === tracked) {
        container.eventDispatchPromise = null
      }
    })
    container.eventDispatchPromise = tracked
    return tracked
  }

  const previous = container.eventDispatchPromise ?? Promise.resolve()
  const queued = previous
    .catch(() => {})
    .then(async () => {
      await dispatchDocumentEvent(container, event)
    })
  container.eventDispatchPromise = queued.finally(() => {
    if (container.eventDispatchPromise === queued) {
      container.eventDispatchPromise = null
    }
  })
  return container.eventDispatchPromise
}

export const installResumeListeners = (container: RuntimeContainer) => {
  const doc = container.doc
  if (!doc) {
    return () => {}
  }
  const cleanupRouteLinks = installResumeLinkListeners(container)
  installStreamedSuspenseController(container)
  ensureVisibilityListeners(container)
  scheduleVisibleCallbacksCheck(container)
  const listeners = [
    'cancel',
    'click',
    'input',
    'change',
    'submit',
    'keydown',
    'compositionstart',
    'compositionend',
  ] as const
  const onEvent = (event: Event) => {
    void enqueueDocumentEvent(container, event)
  }
  const onIntent = (event: Event) => {
    if (event.type === 'pointerdown') {
      prefetchInteractiveTargetSymbols(container, event.target, ['click', 'submit'])
      return
    }
    prefetchInteractiveTargetSymbols(container, event.target, INTERACTIVE_PREFETCH_EVENT_NAMES)
  }
  const onPopState = () => {
    void navigateContainer(container, doc.location.href, {
      mode: 'pop',
    })
  }

  for (const eventName of listeners) {
    doc.addEventListener(eventName, onEvent, true)
  }
  doc.addEventListener('pointerdown', onIntent, true)
  doc.addEventListener('focusin', onIntent, true)
  doc.defaultView?.addEventListener('popstate', onPopState)

  return () => {
    for (const eventName of listeners) {
      doc.removeEventListener(eventName, onEvent, true)
    }
    doc.removeEventListener('pointerdown', onIntent, true)
    doc.removeEventListener('focusin', onIntent, true)
    doc.defaultView?.removeEventListener('popstate', onPopState)
    cleanupRouteLinks?.()
    container.visibilityListenersCleanup?.()
  }
}

export const renderString = (inputElementLike: JSX.Element | JSX.Element[]) =>
  renderStringNode(inputElementLike)

export const hasActiveRuntimeComponent = () => {
  const frame = getCurrentFrame()
  return !!frame && frame.component.id !== ROOT_COMPONENT_ID
}

export const getRuntimeContextValue = (
  token: RuntimeContextToken,
): {
  found: boolean
  value: unknown
} => {
  const stack = getContextValueStack()
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index]
    if (entry?.token === token) {
      return {
        found: true,
        value: entry.value,
      }
    }
  }
  return {
    found: false,
    value: undefined,
  }
}

export const createStandaloneRuntimeSignal = <T>(fallback: T): { value: T } => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const nextId = ((globalRecord[STANDALONE_SIGNAL_ID_KEY] as number | undefined) ?? 0) + 1
  globalRecord[STANDALONE_SIGNAL_ID_KEY] = nextId
  return ensureSignalRecord(null, `$standalone:${nextId}`, fallback).handle
}

export const useRuntimeSignal = <T>(fallback: T): { value: T } => {
  const container = getCurrentContainer()
  const frame = getCurrentFrame()

  if (!container || !frame || frame.component.id === ROOT_COMPONENT_ID) {
    throw new Error('useSignal() can only be used while rendering a component.')
  }

  const signalIndex = frame.signalCursor++
  const existingId = frame.component.signalIds[signalIndex]
  const signalId = existingId ?? `s${container.nextSignalId++}`
  if (!existingId) {
    frame.component.signalIds.push(signalId)
  }
  return ensureSignalRecord(container, signalId, fallback).handle
}

export const useRuntimeAtom = <T>(atom: object, fallback: T): { value: T } => {
  const container = getCurrentContainer()
  const frame = getCurrentFrame()

  if (!container || !frame || frame.component.id === ROOT_COMPONENT_ID) {
    throw new Error('useAtom() can only be used while rendering a component.')
  }

  const signalIndex = frame.signalCursor++
  const existingId = frame.component.signalIds[signalIndex]
  const mappedId = container.atoms.get(atom)
  const signalId = existingId ?? mappedId ?? `a${container.nextAtomId++}`
  if (!existingId) {
    frame.component.signalIds.push(signalId)
  }
  if (mappedId !== signalId) {
    container.atoms.set(atom, signalId)
  }
  return ensureSignalRecord(container, signalId, fallback).handle
}

export const createDetachedRuntimeSignal = <T>(
  container: RuntimeContainer,
  id: string,
  fallback: T,
): { value: T } => ensureSignalRecord(container, id, fallback).handle

export const getRuntimeComponentId = () => getCurrentFrame()?.component.id ?? null
export const getRuntimeSignalId = (value: unknown) => getSignalMeta(value)?.id ?? null

export const useRuntimeNavigate = (): Navigate => {
  const container = getCurrentContainer()
  if (!container) {
    return createStandaloneNavigate()
  }
  return ensureRouterState(container).navigate
}

export const useRuntimeLocation = (): RouteLocation => {
  const container = getCurrentContainer()
  if (!container) {
    return createStandaloneLocation()
  }
  return ensureRouterState(container).location
}

export const useRuntimeRouteParams = (): RouteParams => {
  const frame = getCurrentFrame()
  if (frame?.component.props && typeof frame.component.props === 'object') {
    const candidate = (frame.component.props as Record<string, unknown>)[ROUTE_PARAMS_PROP]
    if (candidate && typeof candidate === 'object') {
      return candidate as RouteParams
    }
  }
  const container = getCurrentContainer()
  return container?.router?.currentRoute?.params ?? EMPTY_ROUTE_PARAMS
}

export const useRuntimeRouteError = (): unknown => {
  const frame = getCurrentFrame()
  if (frame?.component.props && typeof frame.component.props === 'object') {
    const candidate = (frame.component.props as Record<string, unknown>)[ROUTE_ERROR_PROP]
    if (candidate !== undefined) {
      return candidate
    }
  }
  return getCurrentContainer()?.router?.currentRoute?.error
}

export const notFound = (): never => {
  throw {
    __eclipsa_not_found__: true,
    [ROUTE_NOT_FOUND_KEY]: true,
  }
}

export const isRouteNotFoundError = (error: unknown) =>
  !!error &&
  typeof error === 'object' &&
  ((error as { __eclipsa_not_found__?: boolean }).__eclipsa_not_found__ === true ||
    (error as Record<PropertyKey, unknown>)[ROUTE_NOT_FOUND_KEY] === true)

export const createEffect = (fn: () => void, options?: EffectOptions) => {
  const frame = getCurrentFrame()
  const effect: ReactiveEffect = {
    fn() {
      const dependencies = options?.dependencies
      if (!dependencies) {
        collectTrackedDependencies(effect, fn)
        return
      }

      collectTrackedDependencies(effect, () => {
        trackWatchDependencies(dependencies, options?.errorLabel)
      })

      if (options?.untracked) {
        runWithoutDependencyTracking(fn)
        return
      }

      fn()
    },
    signals: new Set(),
  }

  if (frame && frame.mode === 'client' && frame.component.id !== ROOT_COMPONENT_ID) {
    frame.effectCleanupSlot.callbacks.push(() => {
      clearEffectSignals(effect)
    })
  }

  effect.fn()
}

export const createOnCleanup = (fn: () => void) => {
  if (!currentCleanupSlot) {
    throw new Error(
      'onCleanup() can only be used while running onMount(), onVisible(), or useWatch() callbacks.',
    )
  }
  currentCleanupSlot.callbacks.push(fn)
}

export const createOnMount = (fn: () => void) => {
  const frame = getCurrentFrame()
  if (!frame || frame.component.id === ROOT_COMPONENT_ID || frame.mode !== 'client') {
    return
  }
  frame.mountCallbacks.push(fn)
}

export const createOnVisible = (fn: () => void) => {
  const container = getCurrentContainer()
  const frame = getCurrentFrame()
  const lazyMeta = getLazyMeta(fn)

  if (!container || !frame || frame.component.id === ROOT_COMPONENT_ID) {
    return
  }

  if (!lazyMeta && frame.mode === 'ssr') {
    return
  }

  const visibleIndex = frame.visibleCursor++
  const visibleId = createVisibleId(frame.component.id, visibleIndex)
  const visible = getOrCreateVisibleState(container, visibleId, frame.component.id)
  visible.scopeId = lazyMeta
    ? registerScope(container, lazyMeta.captures())
    : registerScope(container, [])
  visible.symbol = lazyMeta?.symbol ?? ''
  visible.run = lazyMeta ? null : fn

  scheduleVisibleCallbacksCheck(container)
}

export const createWatch = (fn: () => void, dependencies?: WatchDependency[]) => {
  const container = getCurrentContainer()
  const frame = getCurrentFrame()
  const watchMeta = getWatchMeta(fn)

  if (!container || !frame || frame.component.id === ROOT_COMPONENT_ID || !watchMeta) {
    const cleanupSlot = createCleanupSlot()
    const effect: ReactiveEffect = {
      fn() {
        createLocalWatchRunner(effect, cleanupSlot, fn, dependencies)()
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
  watch.run = createLocalWatchRunner(watch.effect, watch.cleanupSlot, fn, dependencies)
  watch.effect.fn()
}

export const getResumePayloadScriptContent = (payload: ResumePayload) =>
  escapeJSONScriptText(JSON.stringify(payload))
