import type { JSX } from '../../jsx/types.ts'
import type { SerializedValue } from '../hooks.ts'
import type { ExternalComponentDescriptor, ExternalComponentMeta } from '../internal.ts'
import type { RouteMetadataExport } from '../metadata.ts'
import type {
  Navigate,
  RouteLocation,
  RouteManifest,
  RouteModuleManifest,
  RouteParams,
} from '../router-shared.ts'
import { PROJECTION_SLOT_TYPE, ROUTE_SLOT_ROUTE_KEY, ROUTE_SLOT_TYPE } from './constants.ts'

export type CleanupCallback = () => void

export type RuntimeContextToken<T = unknown> = symbol & {
  __eclipsa_context_type__?: T
}

export interface RuntimeContextValue {
  token: RuntimeContextToken
  value: unknown
}

export type WatchDependency = { value: unknown } | (() => unknown)

export type EffectOptions = {
  dependencies?: WatchDependency[]
  errorLabel?: string
  runInContainer?: boolean
  untracked?: boolean
}

export type WatchMode = 'dynamic' | 'explicit'
export type RouteRenderer = (props: unknown) => unknown
export type NavigationMode = 'pop' | 'push' | 'replace'

export interface ResumeComponentPayload {
  external?: ExternalComponentDescriptor
  optimizedRoot?: boolean
  props: SerializedValue
  projectionSlots?: Record<string, number>
  scope: string
  signalIds: string[]
  symbol: string
  visibleCount: number
  watchCount: number
}

export interface ResumeWatchPayload {
  componentId: string
  mode: WatchMode
  scope: string
  signals: string[]
  symbol: string
}

export interface ResumeActionPayload {
  error: SerializedValue
  input: SerializedValue
  result: SerializedValue
}

export interface ResumeVisiblePayload {
  componentId: string
  scope: string
  symbol: string
}

export interface ResumeLoaderPayload {
  data: SerializedValue
  error: SerializedValue
  loaded: boolean
}

export interface LoaderSnapshot {
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

export interface StreamedSuspenseChunk {
  boundaryId: string
  payloadScriptId: string
  templateId: string
}

export interface StreamState {
  enqueue: (chunk: StreamedSuspenseChunk) => void
  pending: StreamedSuspenseChunk[]
  process?: () => Promise<void>
  processing?: Promise<void> | null
}

export interface ReactiveEffect {
  collecting: boolean
  container?: RuntimeContainer | null
  fn: () => void
  nextSignal: SignalRecord | null
  nextSignals: Set<SignalRecord> | null
  queued: boolean
  runInContainer?: boolean
  signal: SignalRecord | null
  signals: Set<SignalRecord> | null
}

export interface SignalRecord<T = unknown> {
  effect: ReactiveEffect | null
  effects: Set<ReactiveEffect> | null
  handle: {
    value: T
  }
  id: string
  subscribers: Set<string> | null
  value: T
}

export interface CleanupSlot {
  callbacks: CleanupCallback[] | null
  effects: ReactiveEffect[] | null
}

export interface ComponentState {
  active: boolean
  activateModeOnFlush?: 'patch' | 'replace'
  childComponentIds: Set<string> | null
  didMount: boolean
  end?: Comment
  external?: ExternalComponentDescriptor
  externalSlotHtml?: Map<string, string> | null
  externalSlotDom?: Map<string, Node[]> | null
  externalInstance?: unknown
  externalMeta?: ExternalComponentMeta | null
  id: string
  mountCleanupSlots: CleanupSlot[] | null
  optimizedRoot?: boolean
  parentId: string | null
  prefersEffectOnlyLocalSignalWrites?: boolean
  props: unknown
  projectionSlots: Record<string, number> | null
  rawProps?: Record<string, unknown> | null
  renderEffectCleanupSlot: CleanupSlot | null
  reuseExistingDomOnActivate?: boolean
  reuseProjectionSlotDomOnActivate?: boolean
  scopeId: string | null
  signalIds: string[]
  start?: Comment
  subscribedSignalIds: Set<string> | null
  symbol: string
  suspensePromise?: Promise<unknown> | null
  visibleCount: number
  watchCount: number
}

export interface RenderFrame {
  childCursor: number
  component: ComponentState
  container: RuntimeContainer
  effectCursor: number
  effectCleanupSlot: CleanupSlot | null
  existingRenderEffects: ReactiveEffect[] | null
  insertCursor: number
  keyedRangeCursor: number
  keyedRangeScopeStack: string[] | null
  mountCallbacks: Array<() => void> | null
  nextRenderEffects: ReactiveEffect[] | null
  projectionState: {
    counters: Map<string, number> | null
    reuseExistingDom: boolean
    reuseProjectionSlotDom: boolean
  }
  reuseRenderEffects: boolean
  visitedDescendants: Set<string> | null
  mode: 'client' | 'ssr'
  scopedStyles: ScopedStyleEntry[] | null
  signalCursor: number
  visibleCursor: number
  watchCursor: number
}

export interface ClientInsertOwner {
  childIndex: number
  componentId: string
  keyedRangeCursor: number
  projectionCounters: Array<[string, number]>
}

export interface ScopedStyleEntry {
  attributes: Record<string, unknown>
  cssText: string
}

export interface RouterEventState {
  originalPreventDefault: () => void
  routerPrevented: boolean
  userPrevented: boolean
}

export interface RuntimeSymbolModule {
  default: (scope: unknown[], propsOrArg?: unknown, ...args: unknown[]) => unknown
}

export interface LoadedRouteModule {
  metadata: RouteMetadataExport | null
  renderer: RouteRenderer
  symbol: string | null
  url: string
}

export interface LoadedRoute {
  entry: RouteModuleManifest
  error: unknown
  layouts: LoadedRouteModule[]
  params: RouteParams
  pathname: string
  page: LoadedRouteModule
  render: RouteRenderer
}

export interface RoutePreflightSuccess {
  ok: true
}

export interface RoutePreflightRedirect {
  location: string
  ok: false
}

export interface RoutePreflightDocumentFallback {
  document: true
  ok: false
}

export type RoutePreflightResult =
  | RoutePreflightSuccess
  | RoutePreflightRedirect
  | RoutePreflightDocumentFallback

export interface RouteDataSuccess {
  finalHref: string
  finalPathname: string
  kind: 'page' | 'not-found'
  loaders: Record<string, ResumeLoaderPayload>
  ok: true
}

export interface RouteDataRedirect {
  location: string
  ok: false
}

export interface RouteDataDocumentFallback {
  document: true
  ok: false
}

export type RouteDataResponse = RouteDataSuccess | RouteDataRedirect | RouteDataDocumentFallback
export type RoutePrefetchResult = RouteDataResponse

export interface RouteSlotValue {
  __eclipsa_type: typeof ROUTE_SLOT_TYPE
  pathname: string
  startLayoutIndex: number
}

export interface RouteSlotCarrier extends RouteSlotValue {
  [ROUTE_SLOT_ROUTE_KEY]?: LoadedRoute
}

export interface ProjectionSlotValue {
  __eclipsa_type: typeof PROJECTION_SLOT_TYPE
  componentId: string
  name: string
  occurrence: number
  source: unknown
}

export interface WatchState {
  cleanupSlot: CleanupSlot
  componentId: string
  effect: ReactiveEffect
  id: string
  mode: WatchMode
  pending: Promise<void> | null
  resumed: boolean
  run: (() => void) | null
  scopeId: string
  symbol: string
  track: (() => void) | null
}

export interface VisibleState {
  cleanupSlot: CleanupSlot
  componentId: string
  done: boolean
  id: string
  pending: Promise<void> | null
  run: (() => void | Promise<void>) | null
  scopeId: string
  symbol: string
}

export interface PendingLinkNavigation {
  href: string
  replace: boolean
  state: RouterEventState
}

export interface PendingResumeLinkNavigation {
  href: string
  replace: boolean
}

export type RenderObject = Extract<
  JSX.Element,
  {
    isStatic: boolean
    props: Record<string, unknown>
    type: JSX.Type
  }
>

export interface RenderComponentTypeRef {
  scopeId: string
  symbol: string
}

export interface ForValue<T = unknown> {
  __e_for: true
  arr: readonly T[]
  fallback?: JSX.Element
  fn: (e: T, i: number) => JSX.Element
  key?: (e: T, i: number) => string | number | symbol
  reactiveIndex?: boolean
  reactiveRows?: boolean
}

export interface ShowValue<T = unknown> {
  __e_show: true
  children: JSX.Element | ((value: T) => JSX.Element)
  fallback?: JSX.Element | ((value: T) => JSX.Element)
  when: T
}

export interface RouterState {
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
  eventBindingScopeCache: Map<string, string>
  externalRenderCache: Map<
    string,
    {
      error?: unknown
      html?: string
      pending?: Promise<string>
      status: 'pending' | 'rejected' | 'resolved'
    }
  >
  id: string
  imports: Map<string, Promise<RuntimeSymbolModule>>
  insertMarkerLookup: Map<string, Comment | null>
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
  materializedScopes: Map<
    string,
    {
      slots: SerializedValue[]
      values: unknown[]
    }
  >
  nextComponentId: number
  nextElementId: number
  nextScopeId: number
  nextSignalId: number
  pendingSuspensePromises: Set<Promise<unknown>>
  pendingSignalEffects: ReactiveEffect[]
  resumeReadyPromise: Promise<void> | null
  rootChildComponentIds: Set<string>
  rootChildCursor: number
  rootElement?: HTMLElement
  router: RouterState | null
  asyncSignalStates: Map<string, unknown>
  asyncSignalSnapshotCache: Map<string, unknown>
  atoms: WeakMap<object, string>
  nextAtomId: number
  scopes: Map<string, SerializedValue[]>
  signals: Map<string, SignalRecord>
  signalEffectBatchDepth: number
  signalEffectsFlushing: boolean
  symbols: Map<string, string>
  visibilityListenersCleanup: (() => void) | null
  visibilityCheckQueued: boolean
  visibles: Map<string, VisibleState>
  watches: Map<string, WatchState>
}
