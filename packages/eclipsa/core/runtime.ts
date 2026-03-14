import type { JSX } from '../jsx/types.ts'
import { FRAGMENT } from '../jsx/shared.ts'
import { jsxDEV } from '../jsx/jsx-dev-runtime.ts'
import type { ResumeHmrUpdatePayload } from './resume-hmr.ts'
import {
  deserializeValue,
  escapeJSONScriptText,
  serializeValue,
  type SerializedReference,
  type SerializedValue,
} from './serialize.ts'
import type { Component } from './component.ts'
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
  ROUTE_LINK_ATTR,
  ROUTE_REPLACE_ATTR,
  type Navigate,
  type NavigateOptions,
  type RouteManifest,
  type RouteModuleManifest,
  type RouteParams,
} from './router-shared.ts'

const CONTAINER_STACK_KEY = Symbol.for('eclipsa.container-stack')
const FRAME_STACK_KEY = Symbol.for('eclipsa.frame-stack')
const DIRTY_FLUSH_PROMISE_KEY = Symbol.for('eclipsa.dirty-flush-promise')
const ROUTER_EVENT_STATE_KEY = Symbol.for('eclipsa.router-event-state')
const ROUTER_CURRENT_PATH_SIGNAL_ID = '$router:path'
const ROUTER_IS_NAVIGATING_SIGNAL_ID = '$router:isNavigating'
const ROUTER_LINK_BOUND_KEY = Symbol.for('eclipsa.router-link-bound')
const ROUTE_NOT_FOUND_KEY = Symbol.for('eclipsa.route-not-found')
const ROUTE_PARAMS_PROP = '__eclipsa_route_params'
const ROUTE_SLOT_ROUTE_KEY = Symbol.for('eclipsa.route-slot-route')
const RESUME_CONTAINERS_KEY = Symbol.for('eclipsa.resume-containers')
const ROOT_COMPONENT_ID = '$root'
const ROUTE_SLOT_TYPE = 'route-slot'
const PROJECTION_SLOT_TYPE = 'projection-slot'
const CONTAINER_ID_KEY = Symbol.for('eclipsa.runtime-container-id')
const RENDER_COMPONENT_TYPE_KEY = Symbol.for('eclipsa.render-component-type')
const RENDER_REFERENCE_KIND = 'render'
const REF_SIGNAL_ATTR = 'data-e-ref'

export interface ResumeComponentPayload {
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

interface ResumeVisiblePayload {
  componentId: string
  scope: string
  symbol: string
}

interface ResumeLoaderPayload {
  data: SerializedValue
  error: SerializedValue
  loaded: boolean
}

export interface ResumePayload {
  components: Record<string, ResumeComponentPayload>
  loaders: Record<string, ResumeLoaderPayload>
  scopes: Record<string, SerializedValue[]>
  signals: Record<string, SerializedValue>
  subscriptions: Record<string, string[]>
  symbols: Record<string, string>
  visibles: Record<string, ResumeVisiblePayload>
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

type CleanupCallback = () => void

interface CleanupSlot {
  callbacks: CleanupCallback[]
}

interface ComponentState {
  active: boolean
  didMount: boolean
  end?: Comment
  id: string
  mountCleanupSlots: CleanupSlot[]
  parentId: string | null
  props: unknown
  projectionSlots: Record<string, number> | null
  scopeId: string
  signalIds: string[]
  start?: Comment
  symbol: string
  visibleCount: number
  watchCount: number
}

interface RenderFrame {
  childCursor: number
  component: ComponentState
  container: RuntimeContainer
  mountCallbacks: Array<() => void>
  projectionState: {
    counters: Map<string, number>
    reuseExistingDom: boolean
  }
  visitedDescendants: Set<string>
  mode: 'client' | 'ssr'
  signalCursor: number
  visibleCursor: number
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
  manifest: RouteManifest
  navigate: Navigate
  sequence: number
}

export interface RuntimeContainer {
  actions: Map<string, unknown>
  components: Map<string, ComponentState>
  dirty: Set<string>
  doc?: Document
  id: string
  imports: Map<string, Promise<RuntimeSymbolModule>>
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
  rootChildCursor: number
  rootElement?: HTMLElement
  router: RouterState | null
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

type WatchDependency = { value: unknown } | (() => unknown)
type WatchMode = 'dynamic' | 'explicit'
type RouteRenderer = (props: unknown) => unknown

interface LoadedRouteModule {
  renderer: RouteRenderer
  symbol: string | null
  url: string
}

interface LoadedRoute {
  entry: RouteModuleManifest
  layouts: LoadedRouteModule[]
  params: RouteParams
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

const resolvedRuntimeSymbols = new WeakMap<RuntimeContainer, Map<string, RuntimeSymbolModule>>()

const getResolvedRuntimeSymbols = (container: RuntimeContainer) => {
  const existing = resolvedRuntimeSymbols.get(container)
  if (existing) {
    return existing
  }
  const created = new Map<string, RuntimeSymbolModule>()
  resolvedRuntimeSymbols.set(container, created)
  return created
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
    case 'rest':
      return matchRouteSegments(segments, pathnameSegments, segments.length, pathnameSegments.length, {
        ...params,
        [segment.value]: pathnameSegments.slice(pathIndex),
      })
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
  for (let index = 0; index < entry.segments.length && index < pathnameSegments.length; index += 1) {
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

const routeCacheKey = (pathname: string, variant: 'page' | 'loading' | 'error' | 'not-found' = 'page') =>
  `${normalizeRoutePath(pathname)}::${variant}`

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
  (effect: ReactiveEffect, cleanupSlot: CleanupSlot, fn: () => void, dependencies?: WatchDependency[]) =>
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

const createProjectionSlotMarker = (
  componentId: string,
  name: string,
  occurrence: number,
  kind: 'start' | 'end',
) => `ec:s:${componentId}:${encodeProjectionSlotName(name)}:${occurrence}:${kind}`

const PROJECTION_SLOT_MARKER_REGEX = /^ec:s:([^:]+):([^:]+):(\d+):(start|end)$/

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
  const evaluatedProps = evaluateProps(value.props)
  const key = value.key ?? null
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
        value.isStatic,
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
      value.isStatic,
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
  if (typeof isStaticValue !== 'boolean') {
    throw new TypeError('Render references require a boolean static flag.')
  }

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
      isStatic: isStaticValue,
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
    isStatic: isStaticValue,
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
  serializeValue(value, {
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
      if (isRouteSlot(candidate)) {
        return {
          __eclipsa_type: 'ref',
          data: serializeValue(candidate.startLayoutIndex),
          kind: 'route-slot',
          token: candidate.pathname,
        }
      }
      if (isProjectionSlot(candidate)) {
        return {
          __eclipsa_type: 'ref',
          data: serializeRuntimeValue(container, candidate.source),
          kind: PROJECTION_SLOT_TYPE,
          token: JSON.stringify([
            candidate.componentId,
            candidate.name,
            candidate.occurrence,
          ]),
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
      if (typeof Element !== 'undefined' && candidate instanceof Element) {
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
  deserializeValue(value, {
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
      if (reference.kind === 'route-slot') {
        const startLayoutIndex =
          reference.data === undefined ? 0 : deserializeValue(reference.data)
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
          throw new TypeError('Projection slot references require a component id, name, and occurrence.')
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
    record.value = element
    return true
  }

  signalMeta.set(element)
  return true
}

const restoreSignalRefs = (container: RuntimeContainer, root: HTMLElement) => {
  if (typeof root.getAttribute !== 'function') {
    return
  }

  const assignElement = (element: Element) => {
    const signalId = element.getAttribute(REF_SIGNAL_ATTR)
    if (!signalId) {
      return
    }
    const record = container.signals.get(signalId)
    if (!record) {
      return
    }
    record.value = element
  }

  if (root.getAttribute(REF_SIGNAL_ATTR)) {
    assignElement(root)
  }

  if (!('querySelectorAll' in root)) {
    return
  }

  for (const element of root.querySelectorAll(`[${REF_SIGNAL_ATTR}]`)) {
    assignElement(element)
  }
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

const createRenderProps = (
  componentId: string,
  meta: ComponentMeta,
  props: Record<string, unknown>,
): Record<string, unknown> => {
  if (!meta.projectionSlots || Object.keys(meta.projectionSlots).length === 0) {
    return props
  }

  const nextProps: Record<string, unknown> = {
    ...props,
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
        const current = counters.get(name) ?? 0
        counters.set(name, current + 1)
        const occurrence =
          totalOccurrences > 0 ? current % totalOccurrences : current
        return createProjectionSlot(componentId, name, occurrence, props[name])
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
  if (!props || typeof props !== 'object' || !meta.projectionSlots) {
    await preloadResumableValue(container, props)
    return
  }

  const projectionNames = new Set(Object.keys(meta.projectionSlots))
  const entries: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (projectionNames.has(key)) {
      continue
    }
    entries[key] = value
  }
  await preloadResumableValue(container, entries)
}

const createContainer = (symbols: Record<string, string>, doc?: Document): RuntimeContainer => ({
  actions: new Map(),
  components: new Map(),
  dirty: new Set(),
  doc,
  id: `rt${((globalThis as Record<PropertyKey, unknown>)[CONTAINER_ID_KEY] =
    (((globalThis as Record<PropertyKey, unknown>)[CONTAINER_ID_KEY] as number | undefined) ?? 0) +
    1)}`,
  imports: new Map(),
  loaderStates: new Map(),
  loaders: new Map(),
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
      container.router.manifest = [...manifest]
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
    manifest: [],
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

export const findRuntimeElement = (container: RuntimeContainer, elementId: string): Element | null => {
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
  container.scopes.set(id, values.map((value) => serializeRuntimeValue(container, value)))
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
    reuseExistingDom?: boolean
  },
): RenderFrame => ({
  childCursor: 0,
  component,
  container,
  mountCallbacks: [],
  mode,
  projectionState: {
    counters: new Map(),
    reuseExistingDom: options?.reuseExistingDom ?? false,
  },
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
    parentId,
    props: {},
    projectionSlots: null,
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol,
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
  component.didMount = false
  component.projectionSlots = meta.projectionSlots ?? null
  component.scopeId = registerScope(container, meta.captures())
  component.signalIds = []
  pruneComponentVisibles(container, component, 0)
  pruneComponentWatches(container, component, 0)
}

const createWatchId = (componentId: string, watchIndex: number) => `${componentId}:w${watchIndex}`
const createVisibleId = (componentId: string, visibleIndex: number) => `${componentId}:v${visibleIndex}`

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

const scheduleVisibleCallbacksCheck = (container: RuntimeContainer) => {
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

  for (const visible of [...container.visibles.values()]) {
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

const preserveProjectionSlotContents = (start: Comment, end: Comment, nodes: Node[]) => {
  const currentNodes = getBoundaryChildren(start, end)
  const currentRanges = collectProjectionSlotRanges(currentNodes)
  const nextRanges = collectProjectionSlotRanges(nodes)

  for (const [key, nextRange] of nextRanges) {
    const currentRange = currentRanges.get(key)
    if (!currentRange) {
      continue
    }

    let cursor = currentRange.start.nextSibling
    while (cursor && cursor !== currentRange.end) {
      const nextSibling = cursor.nextSibling
      nextRange.end.parentNode?.insertBefore(cursor, nextRange.end)
      cursor = nextSibling
    }
  }
}

const replaceBoundaryContents = (start: Comment, end: Comment, nodes: Node[]) => {
  preserveProjectionSlotContents(start, end, nodes)
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

const renderProjectionSlotToString = (slot: ProjectionSlotValue) => {
  const frame = getCurrentFrame()
  const start = createProjectionSlotMarker(slot.componentId, slot.name, slot.occurrence, 'start')
  const end = createProjectionSlotMarker(slot.componentId, slot.name, slot.occurrence, 'end')
  if (frame?.component.id === slot.componentId && frame.projectionState.reuseExistingDom) {
    return `<!--${start}--><!--${end}-->`
  }
  return `<!--${start}-->${renderStringNode(slot.source as JSX.Element)}<!--${end}-->`
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
    component.projectionSlots = meta.projectionSlots ?? null
    const frame = createFrame(container, component, 'ssr')
    clearComponentSubscriptions(container, component.id)
    const renderProps = createRenderProps(componentId, meta, evaluatedProps)

    const componentFn = resolved.type as Component
    const body = pushFrame(frame, () => renderStringNode(componentFn(renderProps)))
    pruneComponentVisibles(container, component, frame.visibleCursor)
    pruneComponentWatches(container, component, frame.watchCursor)
    return `<!--ec:c:${componentId}:start-->${body}<!--ec:c:${componentId}:end-->`
  }

  const attrParts: string[] = []
  const descriptors = Object.getOwnPropertyDescriptors(resolved.props)
  const container = getCurrentContainer()
  let hasInnerHTML = false
  let innerHTML: string | null = null

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
  const existing = container.components.get(componentId)
  const symbolChanged = !!existing && existing.symbol !== meta.symbol
  const component = getOrCreateComponentState(
    container,
    componentId,
    meta.symbol,
    position.parentId,
  )
  component.active = mode === 'client'
  if (!existing || symbolChanged) {
    resetComponentForSymbolChange(container, component, meta)
  }
  component.props = props
  component.projectionSlots = meta.projectionSlots ?? null
  const frame = createFrame(container, component, mode)
  clearComponentSubscriptions(container, componentId)
  const oldDescendants = collectDescendantIds(container, componentId)
  const start = container.doc.createComment(`ec:c:${componentId}:start`)
  const end = container.doc.createComment(`ec:c:${componentId}:end`)
  component.start = start
  component.end = end
  const renderProps = createRenderProps(componentId, meta, props)
  const rendered = pushFrame(frame, () => toMountedNodes(componentFn(renderProps), container))
  pruneComponentVisibles(container, component, frame.visibleCursor)
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
  scheduleVisibleCallbacksCheck(container)

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

  if (name === 'ref') {
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
  if (typeof Node !== 'undefined' && resolved instanceof Node) {
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

  if (typeof resolved.type === 'function') {
    const evaluatedProps = evaluateProps(resolved.props)
    const componentFn = resolved.type as Component
    if (getComponentMeta(resolved.type)) {
      return withoutTrackedEffect(() =>
        renderComponentToNodes(componentFn, evaluatedProps, container, 'client'),
      )
    }
    return renderComponentToNodes(componentFn, evaluatedProps, container, 'client')
  }

  if (resolved.type === FRAGMENT) {
    const children = resolved.props.children
    return Array.isArray(children)
      ? children.flatMap((child: JSX.Element) => renderClientNodes(child, container))
      : renderClientNodes(children as JSX.Element, container)
  }

  const element = createElementNode(container.doc, resolved.type)
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
    return [element]
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

export const serializeContainerValue = (
  container: RuntimeContainer | null,
  value: unknown,
): SerializedValue => (container ? serializeRuntimeValue(container, value) : serializeValue(value))

export const deserializeContainerValue = (
  container: RuntimeContainer | null,
  value: SerializedValue,
): unknown => (container ? deserializeRuntimeValue(container, value) : deserializeValue(value))

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
  rootComponent.mountCleanupSlots = []
  rootComponent.props = {}
  rootComponent.scopeId = registerScope(container, getComponentMeta(Page)?.captures() ?? [])
  rootComponent.signalIds = []
  rootComponent.start = undefined
  rootComponent.watchCount = 0
  rootComponent.visibleCount = 0

  clearComponentSubscriptions(container, rootComponent.id)
  const frame = createFrame(container, rootComponent, 'client')
  const nodes = pushContainer(container, () =>
    pushFrame(frame, () => {
      const rendered = Page({})
      return toMountedNodes(rendered, container)
    }),
  )
  pruneComponentVisibles(container, rootComponent, frame.visibleCursor)
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
  scheduleVisibleCallbacksCheck(container)
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
    loadRouteModule(moduleUrl),
    ...matched.entry.layouts.map((layoutUrl) => loadRouteModule(layoutUrl)),
  ])
  let route!: LoadedRoute
  route = {
    entry: matched.entry,
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
  const matched = url.origin === doc.location.origin ? matchRouteManifest(router.manifest, pathname) : null

  if (!matched || !matched.entry.page) {
    const notFoundRoute = !matched ? await loadResolvedRouteFromSpecial(container, pathname, 'notFound') : null
    if (notFoundRoute) {
      renderRouteIntoRoot(container, notFoundRoute.render, `route:${pathname}:not-found`)
      router.currentRoute = notFoundRoute
      commitBrowserNavigation(doc, url, mode)
      router.currentPath.value = pathname
      return
    }
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
          renderRouteIntoRoot(container, loadingRoute.render, `route:${pathname}:loading`)
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
  } catch (error) {
    if (sequence === router.sequence) {
      const fallbackRoute = isRouteNotFoundError(error)
        ? await loadResolvedRouteFromSpecial(container, pathname, 'notFound')
        : await loadResolvedRoute(container, matched, 'error')
      if (fallbackRoute) {
        renderRouteIntoRoot(
          container,
          fallbackRoute.render,
          `route:${pathname}:${isRouteNotFoundError(error) ? 'not-found' : 'error'}`,
        )
        router.currentRoute = fallbackRoute
        commitBrowserNavigation(doc, url, mode)
        router.currentPath.value = pathname
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
  component.projectionSlots = meta.projectionSlots ?? null
  if (!existing || symbolChanged) {
    resetComponentForSymbolChange(container, component, meta)
  }
  component.active = true
  component.start = undefined
  component.end = undefined

  const frame = createFrame(container, component, 'client')
  const oldDescendants = collectDescendantIds(container, componentId)
  clearComponentSubscriptions(container, componentId)
  const renderProps =
    component.props && typeof component.props === 'object'
      ? createRenderProps(componentId, meta, component.props as Record<string, unknown>)
      : component.props
  const rendered = pushFrame(frame, () => componentFn(renderProps as T))
  pruneComponentVisibles(container, component, frame.visibleCursor)
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
  scheduleVisibleCallbacksCheck(container)

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
  await preloadResumableValue(container, scope)
  const module = await loadSymbol(container, component.symbol)
  await preloadComponentProps(
    container,
    {
      captures: () => [],
      projectionSlots: component.projectionSlots ?? undefined,
      symbol: component.symbol,
    },
    component.props,
  )
  const frame = createFrame(container, component, 'client', { reuseExistingDom: true })
  const focusSnapshot = captureBoundaryFocus(container.doc!, component.start, component.end)
  const nodes = pushContainer(container, () =>
    pushFrame(frame, () => {
      const renderProps =
        component.props && typeof component.props === 'object'
          ? createRenderProps(
              component.id,
              {
                captures: () => [],
                projectionSlots: component.projectionSlots ?? undefined,
                symbol: component.symbol,
              },
              component.props as Record<string, unknown>,
            )
          : component.props
      const rendered = module.default(scope, renderProps)
      return toMountedNodes(rendered, container)
    }),
  )
  pruneComponentVisibles(container, component, frame.visibleCursor)
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
  scheduleVisibleCallbacksCheck(container)
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

    for (const visible of container.visibles.values()) {
      if (affectedIds.has(visible.symbol)) {
        visible.symbol = nextSymbolId
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
    resetComponentVisibleStates(container, boundaryId)
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
    mountCleanupSlots: [],
    parentId: null,
    props: {},
    projectionSlots: null,
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol: ROOT_COMPONENT_ID,
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
): Promise<{
  container: RuntimeContainer
  result: T
}> => {
  const container = createContainer(symbols)
  const rootComponent: ComponentState = {
    active: false,
    didMount: false,
    id: ROOT_COMPONENT_ID,
    mountCleanupSlots: [],
    parentId: null,
    props: {},
    projectionSlots: null,
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol: ROOT_COMPONENT_ID,
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

export const toResumePayload = (container: RuntimeContainer): ResumePayload => ({
  components: Object.fromEntries(
    [...container.components.entries()].map(([id, component]) => [
      id,
      {
        props: serializeRuntimeValue(container, component.props),
        ...(component.projectionSlots ? { projectionSlots: { ...component.projectionSlots } } : {}),
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
    [...container.signals.entries()].map(([id, record]) => [
      id,
      serializeRuntimeValue(container, record.value),
    ]),
  ),
  subscriptions: Object.fromEntries(
    [...container.signals.entries()].map(([id, record]) => [id, [...record.subscribers]]),
  ),
  symbols: Object.fromEntries(container.symbols.entries()),
  visibles: Object.fromEntries(
    [...container.visibles.entries()].map(([id, visible]) => [
      id,
      {
        componentId: visible.componentId,
        scope: visible.scopeId,
        symbol: visible.symbol,
      } satisfies ResumeVisiblePayload,
    ]),
  ),
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
      parentId: id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : ROOT_COMPONENT_ID,
      props: deserializeRuntimeValue(container, componentPayload.props),
      projectionSlots: componentPayload.projectionSlots
        ? { ...componentPayload.projectionSlots }
        : null,
      scopeId: componentPayload.scope,
      signalIds: [...componentPayload.signalIds],
      symbol: componentPayload.symbol,
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

  for (const [id, boundary] of scanComponentBoundaries(root as HTMLElement)) {
    const component = container.components.get(id)
    if (!component) {
      continue
    }
    component.start = boundary.start
    component.end = boundary.end
  }

  restoreSignalRefs(container, root as HTMLElement)

  restoreRegisteredRpcHandles(container)

  const router = ensureRouterState(container)
  router.currentPath.value = normalizeRoutePath(doc.location.pathname)
  router.isNavigating.value = false
  scheduleVisibleCallbacksCheck(container)

  return container
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
  ensureVisibilityListeners(container)
  scheduleVisibleCallbacksCheck(container)
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
    container.visibilityListenersCleanup?.()
  }
}

export const renderString = (inputElementLike: JSX.Element | JSX.Element[]) =>
  renderStringNode(inputElementLike)

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
  const record = ensureSignalRecord(container, signalId, fallback)
  recordSignalRead(record)
  return record.handle
}

export const createDetachedRuntimeSignal = <T>(
  container: RuntimeContainer,
  id: string,
  fallback: T,
): { value: T } => ensureSignalRecord(container, id, fallback).handle

export const getRuntimeSignalId = (value: unknown) => getSignalMeta(value)?.id ?? null

export const useRuntimeNavigate = (): Navigate => {
  const container = getCurrentContainer()
  if (!container) {
    return createStandaloneNavigate()
  }
  return ensureRouterState(container).navigate
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

export const createEffect = (fn: () => void) => {
  const effect: ReactiveEffect = {
    fn() {
      collectTrackedDependencies(effect, fn)
    },
    signals: new Set(),
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
  visible.scopeId = lazyMeta ? registerScope(container, lazyMeta.captures()) : registerScope(container, [])
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
