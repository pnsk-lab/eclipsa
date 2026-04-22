import type { JSX } from '../jsx/types.ts'
import { FRAGMENT } from '../jsx/shared.ts'
import { isSSRRawValue, isSSRTemplate } from '../jsx/jsx-dev-runtime.ts'
import {
  createPendingSignalError,
  isPendingSignalError,
  isSuspenseType,
  type SuspenseProps,
} from './suspense.ts'
import type { ResumeHmrUpdatePayload } from './resume-hmr.ts'
import {
  ACTION_CSRF_FIELD,
  ACTION_CSRF_INPUT_ATTR,
  getCurrentActionCsrfToken,
  readActionCsrfTokenFromDocument,
} from './action-csrf.ts'
import { deserializePublicValue, serializePublicValue, type SerializedValue } from './hooks.ts'
import { escapeJSONScriptText } from './serialize.ts'
import type { Component } from './component.ts'
import type { Insertable } from './client/types.ts'
import { getContextProviderMeta } from './context.ts'
import {
  ROUTE_METADATA_HEAD_ATTR,
  composeRouteMetadata,
  type RouteMetadataExport,
} from './metadata.ts'
import {
  getComponentMeta,
  getExternalComponentMeta,
  getEventMeta,
  getRegisteredActionHookIds,
  getRegisteredActionHook,
  getRegisteredLoaderHookIds,
  getRegisteredLoaderHook,
  getLazyMeta,
  resolveCaptureValues,
  resolveEventDescriptorCaptures,
  getSignalMeta,
  getWatchMeta,
  setLazySignalMeta,
  setNavigateMeta,
  setSignalMeta,
  type ComponentMeta,
  type ExternalComponentDescriptor,
  type ExternalComponentMeta,
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
import {
  ACTION_FORM_ATTR,
  BIND_CHECKED_ATTR,
  BIND_CHECKED_PROP,
  BIND_VALUE_ATTR,
  BIND_VALUE_PROP,
  CLIENT_INSERT_OWNER_ID_PREFIX,
  CLIENT_INSERT_OWNER_SYMBOL,
  CONTAINER_ID_KEY,
  DIRTY_FLUSH_PROMISE_KEY,
  DOM_COMMENT_NODE,
  DOM_SHOW_COMMENT,
  DOM_TEXT_NODE,
  EXTERNAL_ROOT_ATTR,
  EXTERNAL_ROOT_COMPONENT_ATTR,
  EXTERNAL_ROOT_KIND_ATTR,
  PENDING_RESUME_LINK_KEY,
  PROJECTION_SLOT_TYPE,
  REF_SIGNAL_ATTR,
  RESUME_FINAL_STATE_ELEMENT_ID,
  RESUME_STATE_ELEMENT_ID,
  ROOT_COMPONENT_ID,
  ROUTE_ERROR_PROP,
  ROUTE_NOT_FOUND_KEY,
  ROUTE_PARAMS_PROP,
  ROUTER_CURRENT_PATH_SIGNAL_ID,
  ROUTER_CURRENT_URL_SIGNAL_ID,
  ROUTER_EVENT_STATE_KEY,
  ROUTER_IS_NAVIGATING_SIGNAL_ID,
  ROUTER_LINK_BOUND_KEY,
  ROUTER_LINK_PREFETCH_BOUND_KEY,
  SCOPED_STYLE_ATTR,
  STANDALONE_SIGNAL_ID_KEY,
  STREAM_STATE_KEY,
  SUSPENSE_COMPONENT_SYMBOL,
  getExternalSlotTag,
} from './runtime/constants.ts'
import {
  captureBoundaryFocus,
  captureDocumentFocus,
  getBoundaryChildren,
  getManagedAttributeSnapshotValues,
  getRememberedInsertMarkerNodeCount,
  hasRememberedManagedAttributesForSubtree,
  hasOwnerDocument,
  isElementNode,
  isHTMLElementNode,
  isHTMLAnchorElementNode,
  isHTMLFormElementNode,
  isHTMLInputElementNode,
  isHTMLSelectElementNode,
  isHTMLTextAreaElementNode,
  listNodeChildren,
  rememberInsertMarkerRange,
  rememberManagedAttributesForNode,
  rememberManagedAttributesForNodes,
  rememberManagedAttributesForSubtree,
  replaceManagedAttributeSnapshot,
  restoreBoundaryFocus,
  restorePendingFocus as restorePendingFocusInDocument,
  setRememberedInsertMarkerNodeCount,
  syncManagedAttributeSnapshot,
  type PendingFocusRestore,
} from './runtime/dom.ts'
import {
  clearAsyncSignalSnapshot as clearGlobalAsyncSignalSnapshot,
  getContainerStack,
  getContextValueStack,
  getCurrentContainer,
  getFrameStack,
  getResumeContainers,
  readAsyncSignalSnapshot as readGlobalAsyncSignalSnapshot,
  writeAsyncSignalSnapshot as writeGlobalAsyncSignalSnapshot,
} from './runtime/globals.ts'
import {
  EMPTY_ROUTE_PARAMS,
  ROUTE_DOCUMENT_FALLBACK,
  createRouteElement,
  createRouterLocation,
  createStandaloneLocation,
  findSpecialManifestEntry,
  getRouteModuleUrl,
  isRouteDataSuccess,
  isLoaderSignalId,
  isRouteSlot,
  matchRouteManifest,
  normalizeRoutePath,
  parseLocationHref,
  resolveCurrentRouteManifestEntry,
  resolveNotFoundRouteMatch,
  resolvePageRouteMatch,
  resolveRoutableMatch,
  resolveRouteSlot,
  routeCacheKey,
  routePrefetchKey,
} from './runtime/routes.ts'
import {
  createSSRRenderer,
  escapeAttr,
  escapeText,
  isDangerouslySetInnerHTMLProp,
  resolveDangerouslySetInnerHTML,
  toEventName,
} from './runtime/ssr.ts'
import {
  createComponentBoundaryHtmlComment,
  createComponentBoundaryPair,
  createKeyedRangeMarker,
  createProjectionSlotRangeKey,
  createProjectionSlotMarker,
  didComponentBoundaryChange,
  didComponentBoundaryPropsChange,
  didComponentBoundarySymbolChange,
  parseComponentBoundaryMarker,
  parseInsertMarker,
  parseKeyedRangeMarker,
  parseProjectionSlotMarker,
} from './runtime/markers.ts'
import { createRuntimeSerialization } from './runtime/serialization.ts'
import type {
  ClientInsertOwner,
  ComponentState,
  CleanupCallback,
  CleanupSlot,
  EffectOptions,
  FixedSignalEffect,
  ForValue,
  LoadedRoute,
  LoadedRouteModule,
  LoaderSnapshot,
  NavigationMode,
  PendingLinkNavigation,
  PendingResumeLinkNavigation,
  ProjectionSlotValue,
  ReactiveEffect,
  RenderFrame,
  RenderEffect,
  RenderObject,
  ResumeActionPayload,
  ResumeComponentPayload,
  ResumeLoaderPayload,
  ResumePayload,
  ResumeVisiblePayload,
  ResumeWatchPayload,
  RouteDataResponse,
  RoutePrefetchResult,
  RoutePreflightResult,
  RouteRenderer,
  RouteSlotCarrier,
  RouterEventState,
  RouterState,
  RuntimeContainer,
  RuntimeContextToken,
  RuntimeSymbolModule,
  ScopedStyleEntry,
  ShowValue,
  SignalRecord,
  StreamedSuspenseChunk,
  StreamState,
  VisibleState,
  WatchDependency,
  WatchState,
} from './runtime/types.ts'
import { isPlainObject } from './shared.ts'

export {
  RESUME_STATE_ELEMENT_ID,
  RESUME_FINAL_STATE_ELEMENT_ID,
  SCOPED_STYLE_ATTR,
} from './runtime/constants.ts'
export {
  getRememberedInsertMarkerNodeCount,
  rememberInsertMarkerRange,
  rememberManagedAttributesForNode,
  rememberManagedAttributesForNodes,
  rememberManagedAttributesForSubtree,
  setRememberedInsertMarkerNodeCount,
  syncManagedAttributeSnapshot,
} from './runtime/dom.ts'
export type {
  ClientInsertOwner,
  ResumeComponentPayload,
  ResumeLoaderPayload,
  ResumePayload,
  RuntimeContainer,
  RuntimeContextToken,
} from './runtime/types.ts'

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

const resolvedRuntimeSymbols = new WeakMap<RuntimeContainer, Map<string, RuntimeSymbolModule>>()
const trackedRuntimeSymbolImports = new WeakSet<Promise<RuntimeSymbolModule>>()

const getResolvedRuntimeSymbols = (container: RuntimeContainer) => {
  const existing = resolvedRuntimeSymbols.get(container)
  if (existing) {
    return existing
  }
  const created = new Map<string, RuntimeSymbolModule>()
  resolvedRuntimeSymbols.set(container, created)
  return created
}

const trackRuntimeSymbolImport = (
  container: RuntimeContainer,
  symbolId: string,
  promise: Promise<RuntimeSymbolModule>,
) => {
  if (trackedRuntimeSymbolImports.has(promise)) {
    return promise
  }

  let tracked!: Promise<RuntimeSymbolModule>
  tracked = promise
    .then((module) => {
      getResolvedRuntimeSymbols(container).set(symbolId, module)
      return module
    })
    .catch((error) => {
      if (
        container.imports.get(symbolId) === tracked ||
        container.imports.get(symbolId) === promise
      ) {
        container.imports.delete(symbolId)
      }
      throw error
    })
  trackedRuntimeSymbolImports.add(tracked)
  return tracked
}

export const invalidateRuntimeSymbolCaches = (
  container: RuntimeContainer,
  symbolIds: Iterable<string>,
) => {
  const resolved = getResolvedRuntimeSymbols(container)
  const warmedRuntimeSymbols = container.warmedRuntimeSymbols
  for (const symbolId of symbolIds) {
    container.imports.delete(symbolId)
    resolved.delete(symbolId)
    warmedRuntimeSymbols?.delete(symbolId)
  }
}

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

export const readAsyncSignalSnapshot = (
  id: string,
  container: RuntimeContainer | null = getCurrentContainer(),
) => readGlobalAsyncSignalSnapshot(id, container)

export const writeAsyncSignalSnapshot = (
  id: string,
  value: unknown,
  container: RuntimeContainer | null = getCurrentContainer(),
) => {
  writeGlobalAsyncSignalSnapshot(id, value, container)
}

export const clearAsyncSignalSnapshot = (
  id: string,
  container: RuntimeContainer | null = getCurrentContainer(),
) => {
  clearGlobalAsyncSignalSnapshot(id, container)
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

const hasScopedStyles = (frame: RenderFrame | null) =>
  !!frame && getFrameScopedStyles(frame).length > 0

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
  getFrameScopedStyles(frame)
    .map((style) =>
      renderScopedStyleString(ensureComponentScopeId(frame.container, frame.component), style),
    )
    .join('')

const renderFrameScopedStylesToNodes = (frame: RenderFrame, container: RuntimeContainer) =>
  getFrameScopedStyles(frame).map((style) =>
    renderScopedStyleNode(container, ensureComponentScopeId(container, frame.component), style),
  )

const createActionCsrfInputString = (token: string) =>
  `<input ${ACTION_CSRF_INPUT_ATTR}="" name="${escapeAttr(ACTION_CSRF_FIELD)}" type="hidden" value="${escapeAttr(token)}">`

const createActionCsrfInputNode = (doc: Document, token: string) => {
  const input = createElementNode(doc, 'input')
  input.setAttribute(ACTION_CSRF_INPUT_ATTR, '')
  input.setAttribute('name', ACTION_CSRF_FIELD)
  input.setAttribute('type', 'hidden')
  input.setAttribute('value', token)
  return input
}

const readActionCsrfTokenFromRuntimeDocument = (doc: Document | null | undefined) =>
  doc && 'cookie' in doc && typeof doc.cookie === 'string'
    ? readActionCsrfTokenFromDocument(doc)
    : null

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

  const scopedStyles = ensureFrameScopedStyles(frame)
  const existing = scopedStyles.find(
    (entry) =>
      entry.cssText === cssText && JSON.stringify(entry.attributes) === JSON.stringify(attributes),
  )
  if (existing) {
    return
  }

  scopedStyles.push({
    attributes: { ...attributes },
    cssText,
  })
}

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

const EMPTY_FRAME_MOUNT_CALLBACKS: Array<() => void> = []
const EMPTY_FRAME_SCOPED_STYLES: ScopedStyleEntry[] = []
const EMPTY_FRAME_KEYED_RANGE_SCOPE_STACK: string[] = []
const EMPTY_FRAME_VISITED_DESCENDANTS = new Set<string>()
const EMPTY_FRAME_PROJECTION_COUNTERS = new Map<string, number>()
const FRAME_POOL: RenderFrame[] = []
const noop = () => {}

const createInactiveComponentState = (
  id: string,
  parentId: string | null,
  symbol: string,
): ComponentState => ({
  active: false,
  childComponentIds: null,
  didMount: false,
  external: undefined,
  externalSlotHtml: null,
  externalSlotDom: null,
  externalInstance: undefined,
  externalMeta: null,
  id,
  mountCleanupSlots: null,
  mayChangeNodeCount: false,
  optimizedRoot: false,
  parentId,
  prefersEffectOnlyLocalSignalWrites: false,
  props: {},
  projectionSlots: null,
  rawProps: null,
  registered: false,
  renderEffectCleanupSlot: null,
  reuseExistingDomOnActivate: true,
  reuseProjectionSlotDomOnActivate: false,
  scopeId: null,
  signalIds: EMPTY_COMPONENT_SIGNAL_IDS,
  subscribedSignalIds: null,
  suspensePromise: null,
  symbol,
  visibleCount: 0,
  watchCount: 0,
})

const createLazyClientInsertOwnerState = (owner: ClientInsertOwner): ComponentState => ({
  active: false,
  childComponentIds: null,
  didMount: false,
  id: owner.componentId,
  mayChangeNodeCount: false,
  mountCleanupSlots: null,
  parentId: owner.parentComponentId,
  props: null,
  projectionSlots: null,
  registered: false,
  renderEffectCleanupSlot: null,
  scopeId: null,
  signalIds: EMPTY_COMPONENT_SIGNAL_IDS,
  subscribedSignalIds: null,
  symbol: CLIENT_INSERT_OWNER_SYMBOL,
  visibleCount: 0,
  watchCount: 0,
})

const createCleanupSlot = (): CleanupSlot => ({
  callback: null,
  callbacks: null,
  effect: null,
  secondEffect: null,
  effects: null,
})

const cleanupSlotHasCallbacks = (slot: CleanupSlot | null | undefined) =>
  !!slot?.callback || !!slot?.callbacks?.length

const cleanupSlotHasEffects = (slot: CleanupSlot | null | undefined) =>
  !!slot?.effect || !!slot?.secondEffect || !!slot?.effects?.length

const addCleanupSlotCallback = (slot: CleanupSlot, callback: CleanupCallback) => {
  if (!slot.callback && !slot.callbacks) {
    slot.callback = callback
    return
  }
  if (slot.callbacks) {
    slot.callbacks.push(callback)
    return
  }
  slot.callbacks = [slot.callback!, callback]
  slot.callback = null
}

const addCleanupSlotEffect = (slot: CleanupSlot, effect: RenderEffect) => {
  if (!slot.effect && !slot.secondEffect && !slot.effects) {
    slot.effect = effect
    return
  }
  if (slot.effect && !slot.secondEffect && !slot.effects) {
    slot.secondEffect = effect
    return
  }
  if (slot.effects) {
    slot.effects.push(effect)
    return
  }
  slot.effects = [slot.effect!, slot.secondEffect!, effect]
  slot.effect = null
  slot.secondEffect = null
}

const getCleanupSlotEffectsForReuse = (
  slot: CleanupSlot | null | undefined,
): RenderEffect[] | null => {
  if (!slot) {
    return null
  }
  if (slot.effects) {
    return slot.effects
  }
  if (!slot.effect) {
    return null
  }
  slot.effects = slot.secondEffect ? [slot.effect, slot.secondEffect] : [slot.effect]
  slot.effect = null
  slot.secondEffect = null
  return slot.effects
}

const setCleanupSlotEffectList = (slot: CleanupSlot, effects: RenderEffect[] | null) => {
  slot.effect = null
  slot.secondEffect = null
  slot.effects = null
  if (!effects || effects.length === 0) {
    return
  }
  if (effects.length === 1) {
    slot.effect = effects[0] ?? null
    return
  }
  if (effects.length === 2) {
    slot.effect = effects[0] ?? null
    slot.secondEffect = effects[1] ?? null
    return
  }
  slot.effects = effects
}

const isFixedSignalEffect = (effect: RenderEffect): effect is FixedSignalEffect =>
  (effect as FixedSignalEffect).kind === 'fixed'

const ensureComponentRenderEffectCleanupSlot = (component: ComponentState) =>
  (component.renderEffectCleanupSlot ??= createCleanupSlot())

const ensureFrameEffectCleanupSlot = (frame: RenderFrame) =>
  (frame.effectCleanupSlot ??= ensureComponentRenderEffectCleanupSlot(frame.component))

const ensureComponentScopeId = (container: RuntimeContainer, component: ComponentState) =>
  (component.scopeId ??= registerScope(container, []))

const getFrameMountCallbacks = (frame: RenderFrame) =>
  frame.mountCallbacks ?? EMPTY_FRAME_MOUNT_CALLBACKS

const ensureFrameMountCallbacks = (frame: RenderFrame) => (frame.mountCallbacks ??= [])

const getFrameScopedStyles = (frame: RenderFrame) => frame.scopedStyles ?? EMPTY_FRAME_SCOPED_STYLES

const ensureFrameScopedStyles = (frame: RenderFrame) => (frame.scopedStyles ??= [])

const getFrameKeyedRangeScopeStack = (frame: RenderFrame) =>
  frame.keyedRangeScopeStack ?? EMPTY_FRAME_KEYED_RANGE_SCOPE_STACK

const ensureFrameKeyedRangeScopeStack = (frame: RenderFrame) => (frame.keyedRangeScopeStack ??= [])

const getFrameVisitedDescendants = (frame: RenderFrame) =>
  frame.visitedDescendants ?? EMPTY_FRAME_VISITED_DESCENDANTS

const ensureFrameVisitedDescendants = (frame: RenderFrame) =>
  (frame.visitedDescendants ??= new Set())

const getFrameProjectionCounters = (frame: RenderFrame) =>
  frame.projectionState.counters ?? EMPTY_FRAME_PROJECTION_COUNTERS

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
  if (!slot) {
    return
  }

  const callback = slot.callback
  const callbacks = slot.callbacks
  const effect = slot.effect
  const secondEffect = slot.secondEffect
  const effects = slot.effects
  if (
    !callback &&
    (!callbacks || callbacks.length === 0) &&
    !effect &&
    !secondEffect &&
    (!effects || effects.length === 0)
  ) {
    return
  }

  slot.callback = null
  slot.callbacks = null
  slot.effect = null
  slot.secondEffect = null
  slot.effects = null
  let firstError: unknown = null
  const previous = currentCleanupSlot
  currentCleanupSlot = null

  try {
    if (callback) {
      try {
        withoutTrackedEffect(callback)
      } catch (error) {
        firstError ??= error
      }
    }
    if (callbacks) {
      for (let index = callbacks.length - 1; index >= 0; index -= 1) {
        const callback = callbacks[index]
        if (!callback) {
          continue
        }
        try {
          withoutTrackedEffect(callback)
        } catch (error) {
          firstError ??= error
        }
      }
    }
    if (effect) {
      try {
        if (isFixedSignalEffect(effect)) {
          removeFixedSignalEffect(effect.signal, effect)
        } else {
          clearEffectSignals(effect)
        }
      } catch (error) {
        firstError ??= error
      }
    }
    if (secondEffect) {
      try {
        if (isFixedSignalEffect(secondEffect)) {
          removeFixedSignalEffect(secondEffect.signal, secondEffect)
        } else {
          clearEffectSignals(secondEffect)
        }
      } catch (error) {
        firstError ??= error
      }
    }
    if (effects) {
      for (let index = effects.length - 1; index >= 0; index -= 1) {
        const effect = effects[index]
        if (!effect) {
          continue
        }
        try {
          if (isFixedSignalEffect(effect)) {
            removeFixedSignalEffect(effect.signal, effect)
          } else {
            clearEffectSignals(effect)
          }
        } catch (error) {
          firstError ??= error
        }
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
  if (
    !cleanupSlotHasCallbacks(component.renderEffectCleanupSlot) &&
    !cleanupSlotHasEffects(component.renderEffectCleanupSlot)
  ) {
    return
  }
  disposeCleanupSlot(component.renderEffectCleanupSlot)
  component.renderEffectCleanupSlot = null
}

const commitFrameRenderEffects = (frame: RenderFrame) => {
  if (!frame.reuseRenderEffects) {
    return
  }

  const staleEffects = frame.nextRenderEffects ?? frame.existingRenderEffects
  if (staleEffects) {
    for (let index = frame.nextEffectCursor; index < staleEffects.length; index += 1) {
      const effect = staleEffects[index]
      if (!effect) {
        continue
      }
      if (isFixedSignalEffect(effect)) {
        removeFixedSignalEffect(effect.signal, effect)
      } else {
        clearEffectSignals(effect)
      }
    }
    staleEffects.length = frame.nextEffectCursor
  }

  if (frame.effectCleanupSlot) {
    setCleanupSlotEffectList(
      frame.effectCleanupSlot,
      staleEffects && staleEffects.length > 0 ? staleEffects : null,
    )
  }
}

const storeFrameRenderEffect = (frame: RenderFrame, effect: RenderEffect) => {
  const effects =
    frame.nextRenderEffects ?? (frame.nextRenderEffects = frame.existingRenderEffects ?? [])
  const index = frame.nextEffectCursor++
  if (index < effects.length) {
    effects[index] = effect
  } else {
    effects.push(effect)
  }
}

const syncEffectOnlyLocalSignalPreference = (component: ComponentState) => {
  component.prefersEffectOnlyLocalSignalWrites = component.optimizedRoot === true
}

const componentMayChangeNodeCount = (
  container: RuntimeContainer,
  componentId: string | null | undefined,
) => {
  if (!componentId) {
    return false
  }
  const component = container.components.get(componentId)
  return !!component && component.mayChangeNodeCount === true
}

export const markComponentMayChangeNodeCount = (
  container: RuntimeContainer,
  componentId: string | null | undefined,
) => {
  let currentId = componentId
  while (currentId) {
    let component = container.components.get(currentId)
    if (!component) {
      const frame = getCurrentFrame()
      if (frame?.container === container && frame.component.id === currentId) {
        component = frame.component
      }
    }
    if (!component || component.mayChangeNodeCount === true) {
      break
    }
    component.mayChangeNodeCount = true
    currentId = component.parentId
  }
}

const collapseSignalEffectSet = (record: SignalRecord) => {
  if (!record.effects) {
    return
  }
  if (record.effects.size === 0) {
    record.effects = null
    return
  }
  if (record.effects.size === 1) {
    record.effect = record.effects.values().next().value ?? null
    record.effects = null
  }
}

const collapseFixedSignalEffects = (record: SignalRecord) => {
  const effects = record.fixedEffects
  if (!effects) {
    return
  }
  if (effects.length === 0) {
    record.fixedEffects = null
    return
  }
  if (effects.length === 1) {
    const effect = effects[0] ?? null
    if (effect) {
      effect.fixedIndex = -1
    }
    record.fixedEffect = effect
    record.secondFixedEffect = null
    record.fixedEffects = null
    return
  }
  if (effects.length === 2) {
    const firstEffect = effects[0] ?? null
    const secondEffect = effects[1] ?? null
    if (firstEffect) {
      firstEffect.fixedIndex = -1
    }
    if (secondEffect) {
      secondEffect.fixedIndex = -1
    }
    record.fixedEffect = firstEffect
    record.secondFixedEffect = secondEffect
    record.fixedEffects = null
  }
}

const addSignalEffect = (record: SignalRecord, effect: ReactiveEffect) => {
  if (record.effect === effect || record.effects?.has(effect)) {
    return
  }
  if (!record.effect && !record.effects) {
    record.effect = effect
    return
  }
  if (record.effect) {
    record.effects = new Set([record.effect, effect])
    record.effect = null
    return
  }
  record.effects?.add(effect)
}

const addFixedSignalEffect = (record: SignalRecord, effect: FixedSignalEffect) => {
  if (record.fixedEffect === effect) {
    effect.fixedIndex = -1
    return
  }
  if (record.secondFixedEffect === effect) {
    effect.fixedIndex = -1
    return
  }
  const fixedEffects = record.fixedEffects
  if (fixedEffects) {
    const fixedIndex = effect.fixedIndex
    if (fixedIndex >= 0 && fixedEffects[fixedIndex] === effect) {
      return
    }
    effect.fixedIndex = fixedEffects.length
    fixedEffects.push(effect)
    return
  }
  if (!record.fixedEffect && !record.fixedEffects) {
    effect.fixedIndex = -1
    record.fixedEffect = effect
    record.secondFixedEffect = null
    return
  }
  if (record.fixedEffect) {
    if (!record.secondFixedEffect) {
      effect.fixedIndex = -1
      record.secondFixedEffect = effect
      return
    }
    const previousEffect = record.fixedEffect
    const secondEffect = record.secondFixedEffect
    previousEffect.fixedIndex = 0
    secondEffect.fixedIndex = 1
    effect.fixedIndex = 2
    record.fixedEffects = [previousEffect, secondEffect, effect]
    record.fixedEffect = null
    record.secondFixedEffect = null
    return
  }
}

const removeSignalEffect = (record: SignalRecord, effect: ReactiveEffect) => {
  if (record.effect === effect) {
    record.effect = null
    return
  }
  if (!record.effects) {
    return
  }
  record.effects.delete(effect)
  collapseSignalEffectSet(record)
}

const removeFixedSignalEffect = (record: SignalRecord, effect: FixedSignalEffect) => {
  if (record.fixedEffect === effect) {
    effect.fixedIndex = -1
    record.fixedEffect = record.secondFixedEffect
    record.secondFixedEffect = null
    return
  }
  if (record.secondFixedEffect === effect) {
    effect.fixedIndex = -1
    record.secondFixedEffect = null
    return
  }
  const effects = record.fixedEffects
  if (!effects) {
    return
  }
  let index = effect.fixedIndex
  if (index < 0 || effects[index] !== effect) {
    index = effects.indexOf(effect)
  }
  if (index < 0) {
    return
  }
  const lastIndex = effects.length - 1
  const lastEffect = effects[lastIndex]
  effect.fixedIndex = -1
  if (index !== lastIndex && lastEffect) {
    effects[index] = lastEffect
    lastEffect.fixedIndex = index
  }
  effects.pop()
  collapseFixedSignalEffects(record)
}

const addEffectSignal = (effect: ReactiveEffect, record: SignalRecord) => {
  if (effect.signal === record || effect.signals?.has(record)) {
    return
  }
  if (!effect.signal && !effect.signals) {
    effect.signal = record
    return
  }
  if (effect.signal) {
    effect.signals = new Set([effect.signal, record])
    effect.signal = null
    return
  }
  effect.signals?.add(record)
}

const addNextEffectSignal = (effect: ReactiveEffect, record: SignalRecord) => {
  if (effect.nextSignal === record || effect.nextSignals?.has(record)) {
    return
  }
  if (!effect.nextSignal && !effect.nextSignals) {
    effect.nextSignal = record
    return
  }
  if (effect.nextSignal) {
    effect.nextSignals = new Set([effect.nextSignal, record])
    effect.nextSignal = null
    return
  }
  effect.nextSignals?.add(record)
}

const forEachSignalEffect = (record: SignalRecord, visit: (effect: RenderEffect) => void) => {
  if (record.effect) {
    visit(record.effect)
  }
  if (record.fixedEffect) {
    visit(record.fixedEffect)
  }
  if (record.secondFixedEffect) {
    visit(record.secondFixedEffect)
  }
  if (!record.effects) {
    if (!record.fixedEffects) {
      return
    }
  } else {
    for (const effect of record.effects) {
      visit(effect)
    }
  }
  for (const effect of record.fixedEffects ?? []) {
    visit(effect)
  }
}

const forEachEffectSignal = (effect: ReactiveEffect, visit: (record: SignalRecord) => void) => {
  if (effect.signal) {
    visit(effect.signal)
  }
  if (!effect.signals) {
    return
  }
  for (const record of effect.signals) {
    visit(record)
  }
}

const listEffectSignalIds = (effect: ReactiveEffect) => {
  const ids: string[] = []
  forEachEffectSignal(effect, (record) => {
    ids.push(record.id)
  })
  return ids
}

const effectDependsOnSignal = (effect: ReactiveEffect, record: SignalRecord) =>
  effect.signal === record || effect.signals?.has(record) === true

const dependencySetDependsOnSignal = (
  signal: SignalRecord | null,
  signals: Set<SignalRecord> | null,
  record: SignalRecord,
) => signal === record || signals?.has(record) === true

const commitTrackedDependencies = (effect: ReactiveEffect) => {
  const previousSignal = effect.signal
  const previousSignals = effect.signals
  const nextSignal = effect.nextSignal
  const nextSignals = effect.nextSignals

  if (previousSignal === nextSignal && previousSignals === null && nextSignals === null) {
    effect.nextSignal = null
    effect.nextSignals = null
    return
  }

  if (previousSignal && !dependencySetDependsOnSignal(nextSignal, nextSignals, previousSignal)) {
    removeSignalEffect(previousSignal, effect)
  }
  if (previousSignals) {
    for (const record of previousSignals) {
      if (!dependencySetDependsOnSignal(nextSignal, nextSignals, record)) {
        removeSignalEffect(record, effect)
      }
    }
  }

  if (nextSignal && !effectDependsOnSignal(effect, nextSignal)) {
    addSignalEffect(nextSignal, effect)
  }
  if (nextSignals) {
    for (const record of nextSignals) {
      if (!effectDependsOnSignal(effect, record)) {
        addSignalEffect(record, effect)
      }
    }
  }

  effect.signal = nextSignal
  effect.signals = nextSignals
  effect.nextSignal = null
  effect.nextSignals = null
}

const hasSignalEffects = (record: SignalRecord) =>
  !!record.effect ||
  !!record.effects?.size ||
  !!record.fixedEffect ||
  !!record.secondFixedEffect ||
  !!record.fixedEffects?.length

const effectHasTrackedSignals = (effect: ReactiveEffect) =>
  !!effect.signal || !!effect.signals?.size

const clearEffectSignals = (effect: ReactiveEffect) => {
  const singleSignal = effect.signal
  if (singleSignal) {
    effect.signal = null
    removeSignalEffect(singleSignal, effect)
  }
  if (!effect.signals) {
    return
  }
  const signals = effect.signals
  effect.signals = null
  for (const signal of signals) {
    removeSignalEffect(signal, effect)
  }
}

const collectTrackedDependencies = (effect: ReactiveEffect, fn: () => void) => {
  const previousEffect = currentEffect
  effect.nextSignal = null
  effect.nextSignals = null
  effect.collecting = true
  currentEffect = effect
  try {
    fn()
  } finally {
    currentEffect = previousEffect
    commitTrackedDependencies(effect)
    effect.collecting = false
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

const runEffect = (effect: RenderEffect) => {
  if (isFixedSignalEffect(effect)) {
    const { callback, container, runInContainer, signal } = effect
    if (runInContainer === false || !container) {
      callback(signal.value)
      return
    }
    pushContainer(container, () => {
      callback(signal.value)
    })
    return
  }
  effect.fn()
}

const flushPendingSignalEffects = (container: RuntimeContainer) => {
  if (container.signalEffectsFlushing || container.pendingSignalEffects.length === 0) {
    return
  }

  container.signalEffectsFlushing = true
  try {
    while (container.pendingSignalEffects.length > 0) {
      const batch = container.pendingSignalEffects
      container.pendingSignalEffects = []
      for (const effect of batch) {
        effect.queued = false
        runEffect(effect)
      }
    }
  } finally {
    container.signalEffectsFlushing = false
  }
}

const withBatchedSignalWrites = <T>(
  container: RuntimeContainer | null | undefined,
  fn: () => T,
): T => {
  if (!container) {
    return fn()
  }

  container.signalEffectBatchDepth += 1
  try {
    return fn()
  } finally {
    container.signalEffectBatchDepth -= 1
    if (container.signalEffectBatchDepth === 0) {
      flushPendingSignalEffects(container)
    }
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

let runtimeSerialization: ReturnType<typeof createRuntimeSerialization> | null = null

const getRuntimeSerialization = () => {
  runtimeSerialization ??= createRuntimeSerialization({
    createProjectionSlot,
    ensureRouterState,
    ensureRuntimeElementId,
    evaluateProps,
    findRuntimeElement,
    getResolvedRuntimeSymbols,
    isPlainObject,
    isProjectionSlot,
    isRenderObject,
    isRouteSlot,
    loadSymbol,
    materializeComputedSignalReference,
    materializeScope,
    materializeSymbolReference,
    registerScope,
    registerSerializedScope,
    resolveRenderable: (value) => resolveRenderable(value as JSX.Element),
  })
  return runtimeSerialization
}

const preloadResumableValue = (
  container: RuntimeContainer,
  value: unknown,
  seen = new Set<unknown>(),
) => getRuntimeSerialization().preloadResumableValue(container, value, seen)

const serializeRuntimeValue = (container: RuntimeContainer, value: unknown): SerializedValue =>
  getRuntimeSerialization().serializeRuntimeValue(container, value)

const deserializeRuntimeValue = (container: RuntimeContainer, value: SerializedValue): unknown =>
  getRuntimeSerialization().deserializeRuntimeValue(container, value)

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

const isWritableSignalMeta = (
  meta: SignalMeta<unknown> | null,
): meta is SignalMeta<unknown> & { kind?: 'signal' } => !!meta && meta.kind !== 'computed-signal'

const getRefSignalId = (value: unknown) => {
  const signalMeta = getSignalMeta(value)
  return isWritableSignalMeta(signalMeta) ? signalMeta.id : null
}

const getBindableSignalId = (value: unknown) => {
  const signalMeta = getSignalMeta(value)
  return isWritableSignalMeta(signalMeta) ? signalMeta.id : null
}

export const syncRuntimeRefMarker = (element: Element, value: unknown) => {
  const signalId = getRefSignalId(value)
  if (signalId) {
    const container = getCurrentContainer()
    if (container) {
      container.hasRuntimeRefMarkers = true
    }
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
  if (!isWritableSignalMeta(signalMeta)) {
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
  if (!container.hasRuntimeRefMarkers) {
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

const nodeContainsSignalRefMarker = (node: Node): boolean => {
  if (
    node.nodeType === 1 &&
    'getAttribute' in node &&
    typeof (node as Element & { getAttribute?: unknown }).getAttribute === 'function' &&
    !!(node as Element).getAttribute(REF_SIGNAL_ATTR)
  ) {
    return true
  }

  const childNodes = (
    node as Node & {
      childNodes?: Iterable<Node> | ArrayLike<Node>
    }
  ).childNodes
  if (!childNodes) {
    return false
  }

  if (typeof (childNodes as ArrayLike<Node>).length === 'number') {
    for (let index = 0; index < (childNodes as ArrayLike<Node>).length; index += 1) {
      const child = (childNodes as ArrayLike<Node>)[index]
      if (child && nodeContainsSignalRefMarker(child)) {
        return true
      }
    }
    return false
  }

  for (const child of childNodes as Iterable<Node>) {
    if (nodeContainsSignalRefMarker(child)) {
      return true
    }
  }

  return false
}

const nodesContainSignalRefMarkers = (nodes: readonly Node[]) =>
  nodes.some((node) => nodeContainsSignalRefMarker(node))

const getRenderablePropNames = (props: Record<string, unknown>) => {
  const names = Object.keys(props)
  if (Object.prototype.hasOwnProperty.call(props, ROUTE_PARAMS_PROP)) {
    names.push(ROUTE_PARAMS_PROP)
  }
  if (Object.prototype.hasOwnProperty.call(props, ROUTE_ERROR_PROP)) {
    names.push(ROUTE_ERROR_PROP)
  }
  return names
}

const evaluateProps = (props: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const key of getRenderablePropNames(props)) {
    result[key] = props[key]
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
  externalRenderCache?: RuntimeContainer['externalRenderCache'],
): RuntimeContainer => ({
  actions: new Map(),
  actionStates: new Map(),
  asyncSignalStates: new Map(),
  asyncSignalSnapshotCache: asyncSignalSnapshotCache ?? new Map(),
  atoms: new WeakMap(),
  components: new Map(),
  delegatedEventName: null,
  delegatedEventListener: null,
  delegatedEventNames: null,
  dirty: new Set(),
  dirtyFlushQueued: false,
  doc,
  eventDispatchPromise: null,
  eventBindingScopeCache: new Map(),
  externalRenderCache: externalRenderCache ?? new Map(),
  hasRuntimeRefMarkers: false,
  id: `rt${((globalThis as Record<PropertyKey, unknown>)[CONTAINER_ID_KEY] =
    (((globalThis as Record<PropertyKey, unknown>)[CONTAINER_ID_KEY] as number | undefined) ?? 0) +
    1)}`,
  imports: new Map(),
  insertMarkerLookup: new Map(),
  interactivePrefetchCheckQueued: false,
  loaderStates: new Map(),
  loaders: new Map(),
  materializedScopes: new Map(),
  nextAtomId: 0,
  nextComponentId: 0,
  nextElementId: 0,
  nextScopeId: 0,
  nextSignalId: 0,
  pendingSignalEffects: [],
  pendingSuspensePromises: new Set(),
  resumeReadyPromise: null,
  rootChildComponentIds: new Set(),
  rootChildCursor: 0,
  rootElement: doc?.body,
  router: null,
  scopes: new Map(),
  signals: new Map(),
  signalEffectBatchDepth: 0,
  signalEffectsFlushing: false,
  symbols: new Map(Object.entries(symbols)),
  visibilityCheckQueued: false,
  visibilityListenersCleanup: null,
  visibles: new Map(),
  watches: new Map(),
  warmedRuntimeSymbols: new Set(),
})

export const registerResumeContainer = (container: RuntimeContainer) => {
  const containers = getResumeContainers()
  containers.add(container)
  return () => {
    containers.delete(container)
  }
}

class RuntimeSignalHandle<T> {
  constructor(
    readonly __record: SignalRecord<T>,
    readonly __container: RuntimeContainer | null,
  ) {}

  get value(): T {
    recordSignalRead(this.__record)
    return this.__record.value
  }

  set value(value: T) {
    writeSignalValue(this.__container, this.__record, value)
  }
}

const isRuntimeSignalHandle = (value: unknown): value is RuntimeSignalHandle<unknown> =>
  value instanceof RuntimeSignalHandle

const getRuntimeSignalRecordFromValue = <T>(value: unknown): SignalRecord<T> | null =>
  isRuntimeSignalHandle(value) ? (value.__record as SignalRecord<T>) : null

class RuntimeSignalMeta<T> implements SignalMeta<T> {
  readonly kind = 'signal' as const

  constructor(
    public readonly id: string,
    private readonly record: SignalRecord<T>,
    private readonly container: RuntimeContainer | null,
  ) {}

  get(): T {
    return this.record.value
  }

  set(value: T): void {
    writeSignalValue(this.container, this.record, value)
  }
}

const createSignalHandle = <T>(record: SignalRecord<T>, container: RuntimeContainer | null) => {
  const handle = new RuntimeSignalHandle(record, container) as { value: T }
  return setLazySignalMeta(handle, () => new RuntimeSignalMeta(record.id, record, container))
}

const createInternalSignalHandle = <T>(
  record: SignalRecord<T>,
  container: RuntimeContainer | null,
) => new RuntimeSignalHandle(record, container) as { value: T }

const EMPTY_COMPONENT_SIGNAL_IDS: string[] = Object.freeze([]) as unknown as string[]
const EMPTY_CLIENT_INSERT_PROJECTION_COUNTERS: Array<[string, number]> = Object.freeze(
  [],
) as unknown as Array<[string, number]>

interface ComputedSignalSnapshot<T> {
  __e_async_computed: true
  error?: unknown
  promise?: Promise<T>
  status: 'pending' | 'rejected' | 'resolved'
  value?: T
}

type KeyedForRowState<T = unknown> = {
  index: number
  indexSignal?: { value: number }
  indexSignalId?: string
  item: T
  itemSignal?: { value: T }
  itemSignalId?: string
  key: string | number | symbol
  nodeCount: number
  owner: ClientInsertOwner
  stableNodeCount: boolean
  start: Node
  end: Node
}

type KeyedForDirtyRowState<T = unknown> = {
  index: number
  item: T
  row: KeyedForRowState<T>
}

type KeyedForOwnerState<T = unknown> = {
  dirtyRows: KeyedForDirtyRowState<T>[]
  nextRowOwnerIndex: number
  order: Array<string | number | symbol>
  orderedRows: KeyedForRowState<T>[]
  rows: Map<string | number | symbol, KeyedForRowState<T>>
  totalNodeCount: number
}

type KeyedForReconcileResult = {
  firstNode: Node | null
  needsRefRestore: boolean
  nodeCount: number
}

const keyedForOwnerStates = new WeakMap<ComponentState, KeyedForOwnerState>()

const isComputedSignalSnapshot = <T>(value: unknown): value is ComputedSignalSnapshot<T> =>
  !!value &&
  typeof value === 'object' &&
  (value as ComputedSignalSnapshot<T>).__e_async_computed === true

const readComputedSignalValue = <T>(record: SignalRecord<unknown>) => {
  recordSignalRead(record)
  const snapshot = record.value
  if (!isComputedSignalSnapshot<T>(snapshot)) {
    return snapshot as T
  }
  if (snapshot.status === 'pending') {
    throw createPendingSignalError(snapshot.promise ?? Promise.resolve(undefined))
  }
  if (snapshot.status === 'rejected') {
    throw snapshot.error
  }
  return snapshot.value as T
}

class RuntimeComputedSignalHandle<T> {
  constructor(readonly __record: SignalRecord<unknown>) {}

  get value(): T {
    return readComputedSignalValue<T>(this.__record)
  }
}

class RuntimeComputedSignalMeta<T> implements SignalMeta<T> {
  readonly kind = 'computed-signal' as const

  constructor(
    public readonly id: string,
    private readonly record: SignalRecord<unknown>,
  ) {}

  get(): T {
    return readComputedSignalValue<T>(this.record)
  }

  set(): void {
    throw new TypeError('Computed signals are read-only.')
  }
}

const createComputedSignalHandle = <T>(
  record: SignalRecord<unknown>,
  _container: RuntimeContainer | null,
) => {
  const handle = new RuntimeComputedSignalHandle(record) as { value: T }
  return setSignalMeta(handle, new RuntimeComputedSignalMeta<T>(record.id, record))
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
      effect: null,
      effects: null,
      fixedEffect: null,
      secondFixedEffect: null,
      fixedEffects: null,
      handle: undefined as unknown as { value: T },
      id,
      subscribers: null,
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
    effect: null,
    effects: null,
    fixedEffect: null,
    secondFixedEffect: null,
    fixedEffects: null,
    handle: undefined as unknown as { value: T },
    id,
    subscribers: null,
    value: initialValue,
  }
  record.handle = createSignalHandle(record, container)
  container.signals.set(id, record as SignalRecord)
  return record
}

const createTransientInternalSignalRecord = <T>(
  container: RuntimeContainer,
  initialValue: T,
): SignalRecord<T> => {
  const record: SignalRecord<T> = {
    effect: null,
    effects: null,
    fixedEffect: null,
    secondFixedEffect: null,
    fixedEffects: null,
    handle: undefined as unknown as { value: T },
    id: '',
    skipComponentSubscription: true,
    subscribers: null,
    value: initialValue,
  }
  record.handle = createInternalSignalHandle(record, container)
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
    addNextEffectSignal(currentEffect, record)
    return
  }
  const frame = getCurrentFrame()
  if (!frame) {
    return
  }
  if (record.skipComponentSubscription === true) {
    return
  }
  if (frame.container) {
    registerComponentState(frame.container, frame.component)
  }
  ;(record.subscribers ??= new Set()).add(frame.component.id)
  frame.component.subscribedSignalIds ??= new Set()
  frame.component.subscribedSignalIds.add(record.id)
}

const notifySignalWrite = (container: RuntimeContainer | null, record: SignalRecord) => {
  if (container && (container.signalEffectBatchDepth > 0 || container.signalEffectsFlushing)) {
    forEachSignalEffect(record, (effect) => {
      if ((!isFixedSignalEffect(effect) && effect.collecting) || effect.queued) {
        return
      }
      effect.queued = true
      container.pendingSignalEffects.push(effect)
    })
  } else {
    const singleEffect = record.effect
    if (singleEffect && !singleEffect.collecting) {
      runEffect(singleEffect)
    }
    const singleFixedEffect = record.fixedEffect
    if (singleFixedEffect) {
      runEffect(singleFixedEffect)
    }
    const secondFixedEffect = record.secondFixedEffect
    if (secondFixedEffect) {
      runEffect(secondFixedEffect)
    }
    if (record.effects) {
      for (const effect of Array.from(record.effects)) {
        if (effect.collecting) {
          continue
        }
        runEffect(effect)
      }
    }
    if (record.fixedEffects) {
      for (const effect of record.fixedEffects) {
        runEffect(effect)
      }
    }
  }
  if (!container) {
    return
  }
  for (const componentId of record.subscribers ?? []) {
    const component = container.components.get(componentId)
    if (!component?.start || !component.end) {
      continue
    }
    if (
      component.prefersEffectOnlyLocalSignalWrites &&
      component.signalIds.includes(record.id) &&
      hasSignalEffects(record) &&
      !record.subscribers?.has(component.id)
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
  if (stack[stack.length - 1] === container) {
    return fn()
  }
  stack.push(container)
  try {
    return fn()
  } finally {
    stack.pop()
  }
}

export const withRuntimeContainer = pushContainer

const runReactiveEffectInContainer = <T>(effect: ReactiveEffect, fn: () => T): T => {
  if (effect.runInContainer === false || !effect.container) {
    return fn()
  }
  return pushContainer(effect.container, fn)
}

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
    FRAME_POOL.push(frame)
  }
}

const allocateScopeId = (container: RuntimeContainer) => `sc${container.nextScopeId++}`

interface LiveClientEventBinding {
  capture0?: unknown
  capture1?: unknown
  capture2?: unknown
  capture3?: unknown
  captureCount?: 0 | 1 | 2 | 3 | 4
  containerId: string
  eventName: string
  handler?: EventDescriptor | LazyMeta | ((event: Event) => unknown)
  symbol?: string
}

type LiveClientEventBindingStore = LiveClientEventBinding | Map<string, LiveClientEventBinding>

const LIVE_CLIENT_EVENT_BINDINGS_KEY = Symbol('eclipsa.live-client-event-bindings')
const liveClientEventBindings = new WeakMap<Element, LiveClientEventBindingStore>()
type LiveClientEventBindingElement = Element & {
  [LIVE_CLIENT_EVENT_BINDINGS_KEY]?: LiveClientEventBindingStore | null
}

const ensureDelegatedDocumentEventListener = (container: RuntimeContainer, eventName: string) => {
  if (!container.doc) {
    return
  }
  if (container.delegatedEventName === eventName || container.delegatedEventNames?.has(eventName)) {
    return
  }

  const listener =
    container.delegatedEventListener ??
    ((event: Event) => {
      void enqueueDocumentEvent(container, event)
    })
  container.delegatedEventListener = listener
  if (!container.delegatedEventName && !container.delegatedEventNames) {
    container.delegatedEventName = eventName
  } else if (!container.delegatedEventNames) {
    container.delegatedEventNames = new Set([container.delegatedEventName!, eventName])
    container.delegatedEventName = null
  } else {
    container.delegatedEventNames.add(eventName)
  }
  container.doc.addEventListener(eventName, listener, true)
}

const cloneLiveClientEventBinding = (binding: LiveClientEventBinding): LiveClientEventBinding => ({
  capture0: binding.capture0,
  capture1: binding.capture1,
  capture2: binding.capture2,
  capture3: binding.capture3,
  captureCount: binding.captureCount,
  containerId: binding.containerId,
  eventName: binding.eventName,
  handler: binding.handler,
  symbol: binding.symbol,
})

const forEachLiveClientEventBindingName = (
  bindings: LiveClientEventBindingStore | null,
  visit: (eventName: string) => void,
) => {
  if (!bindings) {
    return false
  }
  if (bindings instanceof Map) {
    for (const eventName of bindings.keys()) {
      visit(eventName)
    }
    return bindings.size > 0
  }
  visit(bindings.eventName)
  return true
}

const getLiveClientEventBindings = (element: Element) => {
  const domElement = element as LiveClientEventBindingElement
  const inline = domElement[LIVE_CLIENT_EVENT_BINDINGS_KEY]
  if (inline) {
    return inline
  }
  return liveClientEventBindings.get(element) ?? null
}

const setLiveClientEventBindings = (
  element: Element,
  bindings: LiveClientEventBindingStore | null,
) => {
  if (Object.isExtensible(element)) {
    const domElement = element as LiveClientEventBindingElement
    domElement[LIVE_CLIENT_EVENT_BINDINGS_KEY] = bindings
    if (bindings) {
      liveClientEventBindings.delete(element)
    }
    return
  }
  if (bindings) {
    liveClientEventBindings.set(element, bindings)
    return
  }
  liveClientEventBindings.delete(element)
}

const getLiveClientEventBinding = (
  container: RuntimeContainer,
  element: Element,
  eventName: string,
): LiveClientEventBinding | null => {
  const bindings = getLiveClientEventBindings(element)
  if (!bindings) {
    return null
  }
  const binding =
    bindings instanceof Map
      ? bindings.get(eventName)
      : bindings.eventName === eventName
        ? bindings
        : null
  if (!binding || binding.containerId !== container.id) {
    return null
  }
  return binding
}

const storeLiveClientEventBinding = (element: Element, nextBinding: LiveClientEventBinding) => {
  const existing = getLiveClientEventBindings(element)
  if (!existing) {
    setLiveClientEventBindings(element, nextBinding)
    return
  }
  if (existing instanceof Map) {
    existing.set(nextBinding.eventName, nextBinding)
    return
  }
  if (existing.eventName === nextBinding.eventName) {
    setLiveClientEventBindings(element, nextBinding)
    return
  }
  setLiveClientEventBindings(
    element,
    new Map<string, LiveClientEventBinding>([
      [existing.eventName, existing],
      [nextBinding.eventName, nextBinding],
    ]),
  )
}

const setLiveClientEventBinding = (
  container: RuntimeContainer,
  element: Element,
  eventName: string,
  handler: EventDescriptor | LazyMeta | ((event: Event) => unknown),
) => {
  storeLiveClientEventBinding(element, {
    containerId: container.id,
    eventName,
    handler,
  })
}

const setLiveClientPackedEventBinding = (
  container: RuntimeContainer,
  element: Element,
  eventName: string,
  symbol: string,
  captureCount: 0 | 1 | 2 | 3 | 4,
  capture0?: unknown,
  capture1?: unknown,
  capture2?: unknown,
  capture3?: unknown,
) => {
  storeLiveClientEventBinding(element, {
    capture0,
    capture1,
    capture2,
    capture3,
    captureCount,
    containerId: container.id,
    eventName,
    symbol,
  })
}

export const bindLiveClientListener = (
  container: RuntimeContainer,
  element: Element,
  eventName: string,
  listener: (event: Event) => unknown,
) => {
  ensureDelegatedDocumentEventListener(container, eventName)
  setLiveClientEventBinding(container, element, eventName, listener)
}

export const bindPackedRuntimeEvent = (
  container: RuntimeContainer,
  element: Element,
  eventName: string,
  symbol: string,
  captureCount: 0 | 1 | 2 | 3 | 4,
  capture0?: unknown,
  capture1?: unknown,
  capture2?: unknown,
  capture3?: unknown,
) => {
  ensureDelegatedDocumentEventListener(container, eventName)
  setLiveClientPackedEventBinding(
    container,
    element,
    eventName,
    symbol,
    captureCount,
    capture0,
    capture1,
    capture2,
    capture3,
  )
  warmRuntimeSymbol(container, symbol)
}

const syncLiveClientEventBindings = (current: Element, next: Element) => {
  const nextBindings = getLiveClientEventBindings(next)
  if (!nextBindings || (nextBindings instanceof Map && nextBindings.size === 0)) {
    setLiveClientEventBindings(current, null)
    return
  }
  if (nextBindings instanceof Map) {
    setLiveClientEventBindings(current, new Map(nextBindings))
    return
  }
  setLiveClientEventBindings(current, cloneLiveClientEventBinding(nextBindings))
}

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

const startRuntimeSymbolImport = (
  container: RuntimeContainer,
  symbolId: string,
): Promise<RuntimeSymbolModule> | null => {
  const resolved = getResolvedRuntimeSymbols(container).get(symbolId)
  if (resolved) {
    return Promise.resolve(resolved)
  }
  const existing = container.imports.get(symbolId)
  if (existing) {
    const tracked = trackRuntimeSymbolImport(container, symbolId, existing)
    if (tracked !== existing) {
      container.imports.set(symbolId, tracked)
    }
    return tracked
  }

  const url = container.symbols.get(symbolId)
  if (!url) {
    return null
  }

  let loaded = trackRuntimeSymbolImport(
    container,
    symbolId,
    import(/* @vite-ignore */ url) as Promise<RuntimeSymbolModule>,
  )
  container.imports.set(symbolId, loaded)
  return loaded
}

const warmRuntimeSymbol = (container: RuntimeContainer, symbolId: string) => {
  const warmedRuntimeSymbols =
    container.warmedRuntimeSymbols ?? (container.warmedRuntimeSymbols = new Set())
  if (warmedRuntimeSymbols.has(symbolId)) {
    return
  }
  warmedRuntimeSymbols.add(symbolId)
  void startRuntimeSymbolImport(container, symbolId)
}

const createSerializedScopeCacheKey = (symbolId: string, values: SerializedValue[]) =>
  `${symbolId}:${JSON.stringify(values)}`

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

const materializeComputedSignalReference = (container: RuntimeContainer, signalId: string) => {
  const record = container.signals.get(signalId)
  if (!record) {
    throw new Error(`Missing signal ${signalId}.`)
  }
  return createComputedSignalHandle(record, container)
}

const materializeScope = (container: RuntimeContainer, scopeId: string): unknown[] => {
  const slots = container.scopes.get(scopeId)
  if (!slots) {
    throw new Error(`Missing scope ${scopeId}.`)
  }
  const materializedScopes =
    container.materializedScopes ?? (container.materializedScopes = new Map())
  const cached = materializedScopes.get(scopeId)
  if (cached?.slots === slots) {
    return cached.values
  }
  const values = slots.map((slot) => deserializeRuntimeValue(container, slot))
  materializedScopes.set(scopeId, {
    slots,
    values,
  })
  return values
}

const createFrame = (
  container: RuntimeContainer,
  component: ComponentState,
  mode: RenderFrame['mode'],
  options?: {
    effectCleanupSlot?: CleanupSlot | null
    reuseRenderEffects?: boolean
    reuseExistingDom?: boolean
    reuseProjectionSlotDom?: boolean
  },
): RenderFrame => {
  const effectCleanupSlot = options?.effectCleanupSlot ?? component.renderEffectCleanupSlot
  const reuseRenderEffects = options?.reuseRenderEffects === true
  component.mayChangeNodeCount = false

  const frame = FRAME_POOL.pop()
  if (frame) {
    frame.childCursor = 0
    frame.component = component
    frame.container = container
    frame.effectCleanupSlot = effectCleanupSlot
    frame.effectCursor = 0
    frame.existingRenderEffects = reuseRenderEffects
      ? getCleanupSlotEffectsForReuse(effectCleanupSlot)
      : null
    frame.insertCursor = 0
    frame.keyedRangeCursor = 0
    frame.keyedRangeScopeStack = null
    frame.mountCallbacks = null
    frame.mode = mode
    frame.nextEffectCursor = 0
    frame.nextRenderEffects = null
    frame.projectionState.counters = null
    frame.projectionState.reuseExistingDom = options?.reuseExistingDom ?? false
    frame.projectionState.reuseProjectionSlotDom = options?.reuseProjectionSlotDom ?? false
    frame.reuseRenderEffects = reuseRenderEffects
    frame.scopedStyles = null
    frame.signalCursor = 0
    frame.visibleCursor = 0
    frame.visitedDescendants = null
    frame.watchCursor = 0
    return frame
  }

  return {
    childCursor: 0,
    component,
    container,
    effectCleanupSlot,
    effectCursor: 0,
    existingRenderEffects: reuseRenderEffects
      ? getCleanupSlotEffectsForReuse(effectCleanupSlot)
      : null,
    insertCursor: 0,
    keyedRangeCursor: 0,
    keyedRangeScopeStack: null,
    mountCallbacks: null,
    mode,
    nextEffectCursor: 0,
    nextRenderEffects: null,
    projectionState: {
      counters: null,
      reuseExistingDom: options?.reuseExistingDom ?? false,
      reuseProjectionSlotDom: options?.reuseProjectionSlotDom ?? false,
    },
    reuseRenderEffects,
    scopedStyles: null,
    signalCursor: 0,
    visibleCursor: 0,
    visitedDescendants: null,
    watchCursor: 0,
  }
}

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

const registerComponentState = (container: RuntimeContainer, component: ComponentState) => {
  if (component.registered === true) {
    return component
  }
  component.registered = true
  container.components.set(component.id, component)
  attachComponentToParent(container, component.id, component.parentId)
  return component
}

const getParentChildComponentIds = (
  container: RuntimeContainer,
  parentId: string | null,
): Set<string> | null => {
  if (!parentId || parentId === ROOT_COMPONENT_ID) {
    container.rootChildComponentIds ??= new Set()
    return container.rootChildComponentIds
  }
  let parent = container.components.get(parentId)
  if (!parent) {
    const frame = getCurrentFrame()
    if (frame?.container === container && frame.component.id === parentId) {
      parent = registerComponentState(container, frame.component)
    }
  }
  if (!parent) {
    return null
  }
  parent.childComponentIds ??= new Set()
  return parent.childComponentIds
}

const detachComponentFromParent = (
  container: RuntimeContainer,
  componentId: string,
  parentId: string | null,
) => {
  getParentChildComponentIds(container, parentId)?.delete(componentId)
}

const attachComponentToParent = (
  container: RuntimeContainer,
  componentId: string,
  parentId: string | null,
) => {
  getParentChildComponentIds(container, parentId)?.add(componentId)
}

const syncComponentParent = (
  container: RuntimeContainer,
  component: ComponentState,
  parentId: string | null,
) => {
  if (component.parentId === parentId) {
    return
  }
  detachComponentFromParent(container, component.id, component.parentId)
  component.parentId = parentId
  attachComponentToParent(container, component.id, parentId)
}

const rebuildComponentTopology = (container: RuntimeContainer) => {
  container.rootChildComponentIds ??= new Set()
  container.rootChildComponentIds.clear()
  for (const component of container.components.values()) {
    component.childComponentIds?.clear()
  }
  for (const component of container.components.values()) {
    attachComponentToParent(container, component.id, component.parentId)
  }
}

const getOrCreateComponentState = (
  container: RuntimeContainer,
  id: string,
  symbol: string,
  parentId: string | null,
): ComponentState => {
  const existing = container.components.get(id)
  if (existing) {
    syncComponentParent(container, existing, parentId)
    existing.symbol = symbol
    return existing
  }
  const component = createInactiveComponentState(id, parentId, symbol)
  registerComponentState(container, component)
  return component
}

const resetComponentForSymbolChange = (
  container: RuntimeContainer,
  component: ComponentState,
  meta: ComponentMeta,
) => {
  disposeComponentMountCleanups(component)
  disposeCleanupSlot(component.renderEffectCleanupSlot)
  component.renderEffectCleanupSlot = null
  component.didMount = false
  component.external = meta.external
  component.externalSlotHtml = null
  component.externalSlotDom = null
  component.optimizedRoot = meta.optimizedRoot === true
  component.prefersEffectOnlyLocalSignalWrites = false
  component.projectionSlots = meta.projectionSlots ?? null
  component.rawProps = null
  component.externalInstance = undefined
  component.externalMeta = null
  component.mayChangeNodeCount = false
  const captures = resolveCaptureValues(meta.captures)
  component.scopeId = captures.length > 0 ? registerScope(container, captures) : null
  component.signalIds = EMPTY_COMPONENT_SIGNAL_IDS
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
    collecting: false,
    container,
    fixed: false,
    fixedCallback: null,
    fn() {},
    nextSignal: null,
    nextSignals: null,
    queued: false,
    signal: null,
    signals: null,
  }
  const watch: WatchState = {
    cleanupSlot: createCleanupSlot(),
    componentId,
    effect,
    id,
    mode: 'dynamic',
    pending: null,
    resumed: false,
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

const clearSignalSubscribers = (container: RuntimeContainer, record: SignalRecord) => {
  if (!record.subscribers?.size) {
    return
  }
  for (const componentId of record.subscribers) {
    container.components.get(componentId)?.subscribedSignalIds?.delete(record.id)
  }
  record.subscribers.clear()
}

const clearComponentSubscriptions = (container: RuntimeContainer, componentId: string) => {
  const component = container.components.get(componentId)
  if (!component || !component.subscribedSignalIds?.size) {
    return
  }

  for (const signalId of component.subscribedSignalIds) {
    container.signals.get(signalId)?.subscribers?.delete(componentId)
  }
  component.subscribedSignalIds.clear()
}

const disposeExternalComponentInstance = (component: ComponentState) => {
  if (!component.externalMeta || component.externalInstance === undefined) {
    component.externalInstance = undefined
    component.externalMeta = null
    return
  }

  void component.externalMeta.unmount(component.externalInstance)
  component.externalInstance = undefined
  component.externalMeta = null
}

const disposeComponentMountCleanups = (component: ComponentState) => {
  disposeExternalComponentInstance(component)
  disposeCleanupSlot(component.renderEffectCleanupSlot)
  component.renderEffectCleanupSlot = null
  const cleanupSlots = component.mountCleanupSlots ? [...component.mountCleanupSlots].reverse() : []
  component.mountCleanupSlots = null
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

const collectDescendantIds = (container: RuntimeContainer, componentId: string) => {
  const descendants: string[] = []
  const component = container.components.get(componentId)
  const stack = [...(component?.childComponentIds ?? [])].reverse()

  while (stack.length > 0) {
    const descendantId = stack.pop()!
    descendants.push(descendantId)
    const descendant = container.components.get(descendantId)
    if (!descendant) {
      continue
    }
    if (!descendant.childComponentIds?.size) {
      continue
    }
    for (const childId of [...descendant.childComponentIds].reverse()) {
      stack.push(childId)
    }
  }

  return descendants
}

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
      descendant.childComponentIds?.clear()
    }
    detachComponentFromParent(container, descendantId, descendant?.parentId ?? null)
    container.components.delete(descendantId)
  }
}

const disposeComponentState = (container: RuntimeContainer, component: ComponentState) => {
  clearComponentSubscriptions(container, component.id)
  disposeCleanupSlot(component.renderEffectCleanupSlot)
  disposeComponentMountCleanups(component)
  pruneComponentVisibles(container, component, 0)
  pruneComponentWatches(container, component, 0)
  for (const signalId of component.signalIds) {
    container.signals.delete(signalId)
    container.asyncSignalStates.delete(signalId)
    container.asyncSignalSnapshotCache.delete(signalId)
  }
  if (component.scopeId) {
    container.scopes.delete(component.scopeId)
  }
  container.dirty.delete(component.id)
  component.childComponentIds?.clear()
  detachComponentFromParent(container, component.id, component.parentId)
  container.components.delete(component.id)
}

const disposeComponentTree = (container: RuntimeContainer, componentId: string) => {
  const component = container.components.get(componentId)
  if (!component) {
    return
  }

  const descendants = collectDescendantIds(container, componentId).sort(
    (left, right) => right.length - left.length,
  )
  for (const descendantId of descendants) {
    const descendant = container.components.get(descendantId)
    if (descendant) {
      disposeComponentState(container, descendant)
    }
  }
  disposeComponentState(container, component)
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
        ;(component.mountCleanupSlots ??= []).push(cleanupSlot)
        withCleanupSlot(cleanupSlot, callback)
      }
    })
      .then(() => flushDirtyComponents(container))
      .then(() => {
        scheduleVisibleCallbacksCheck(container)
      })
  })
}

const scheduleExternalComponentMount = (
  container: RuntimeContainer,
  component: ComponentState,
  external: ExternalComponentMeta,
  props: Record<string, unknown>,
) => {
  if (component.didMount) {
    return
  }
  component.didMount = true
  scheduleMicrotask(() => {
    const host = getExternalRoot(component)
    if (!host) {
      return
    }
    void withClientContainer(container, async () => {
      syncExternalProjectionSlotDom(container, component, props, host)
      await syncExternalComponentInstance(component, external, props, host)
      syncExternalProjectionSlotDom(container, component, props, host)
      rebindExternalHost(container, host)
      scheduleExternalHostRebind(container, host)
      await flushDirtyComponents(container)
      scheduleVisibleCallbacksCheck(container)
    })
  })
}

const rebindExternalHost = (container: RuntimeContainer, host: HTMLElement) => {
  if (!host.parentNode || !('querySelectorAll' in host.parentNode)) {
    return
  }
  bindComponentBoundaries(container, host.parentNode as ParentNode)
  restoreSignalRefs(container, host.parentNode as ParentNode)
  bindRouterLinks(container, host.parentNode as ParentNode)
}

const scheduleExternalHostRebind = (container: RuntimeContainer, host: HTMLElement) => {
  const schedule =
    container.doc?.defaultView?.setTimeout?.bind(container.doc.defaultView) ??
    (typeof setTimeout === 'function' ? setTimeout : null)
  if (!schedule) {
    return
  }
  for (const delay of [0, 16, 100]) {
    schedule(() => {
      if (!host.isConnected) {
        return
      }
      rebindExternalHost(container, host)
    }, delay)
  }
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
      const marker = parseComponentBoundaryMarker((node as Comment).data)
      if (marker) {
        ids.add(marker.id)
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

const createKeyedRangeIdentity = (scope: string, key: string) => JSON.stringify([scope, key])

const collectKeyedRangeRanges = (roots: Node[]) => {
  const starts = new Map<string, Comment>()
  const ranges = new Map<string, { end: Comment; start: Comment }>()

  const visit = (node: Node) => {
    if (typeof Comment !== 'undefined' ? node instanceof Comment : (node as Node).nodeType === 8) {
      const commentNode = node as Comment
      const marker = parseKeyedRangeMarker(commentNode.data)
      if (marker) {
        const identity = createKeyedRangeIdentity(marker.scope, marker.key)
        if (marker.kind === 'start') {
          starts.set(identity, commentNode)
        } else {
          const startNode = starts.get(identity)
          if (startNode) {
            ranges.set(identity, { end: commentNode, start: startNode })
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

const collectBoundaryRangeNodes = (start: Node, end: Node) => {
  if (start === end) {
    return [start]
  }
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

const canReuseNodeAsIs = (current: Node, next: Node): boolean => {
  if (current.nodeType !== next.nodeType) {
    return false
  }

  if (current.nodeType === DOM_TEXT_NODE && next.nodeType === DOM_TEXT_NODE) {
    return current.textContent === next.textContent
  }

  if (
    (typeof Comment !== 'undefined'
      ? current instanceof Comment
      : current.nodeType === DOM_COMMENT_NODE) &&
    (typeof Comment !== 'undefined' ? next instanceof Comment : next.nodeType === DOM_COMMENT_NODE)
  ) {
    const currentComment = current as Comment
    const nextComment = next as Comment
    const currentBoundary = parseComponentBoundaryMarker(currentComment.data)
    const nextBoundary = parseComponentBoundaryMarker(nextComment.data)
    if (currentBoundary || nextBoundary) {
      if (!currentBoundary || !nextBoundary) {
        return false
      }
      if (currentBoundary.id !== nextBoundary.id || currentBoundary.kind !== nextBoundary.kind) {
        return false
      }
      return nextBoundary.kind !== 'start' || !didComponentBoundaryChange(nextComment)
    }
    return currentComment.data === nextComment.data
  }

  if (!isElementNode(current) || !isElementNode(next) || current.tagName !== next.tagName) {
    return false
  }

  const currentNames = current.getAttributeNames()
  const nextNames = next.getAttributeNames()
  if (currentNames.length !== nextNames.length) {
    return false
  }
  for (const name of currentNames) {
    if (current.getAttribute(name) !== next.getAttribute(name)) {
      return false
    }
  }
  if (
    isHTMLInputElementNode(current) &&
    isHTMLInputElementNode(next) &&
    current.checked !== next.checked
  ) {
    return false
  }
  if ('value' in current && 'value' in next && current.value !== next.value) {
    return false
  }

  const currentChildren = Array.from(current.childNodes)
  const nextChildren = Array.from(next.childNodes)
  if (currentChildren.length !== nextChildren.length) {
    return false
  }
  for (let index = 0; index < currentChildren.length; index += 1) {
    if (!canReuseNodeAsIs(currentChildren[index]!, nextChildren[index]!)) {
      return false
    }
  }
  return true
}

const canReuseNodeSequenceAsIs = (currentNodes: Node[], nextNodes: Node[]) => {
  if (currentNodes.length !== nextNodes.length) {
    return false
  }
  for (let index = 0; index < currentNodes.length; index += 1) {
    if (!canReuseNodeAsIs(currentNodes[index]!, nextNodes[index]!)) {
      return false
    }
  }
  return true
}

const preserveComponentBoundaryContentsInRoots = (currentRoots: Node[], nextRoots: Node[]) => {
  const currentRanges = collectComponentBoundaryRanges(currentRoots)
  const nextRanges = collectComponentBoundaryRanges(nextRoots)
  const preservedComponentIds = new Set<string>()

  for (const [id, nextRange] of nextRanges) {
    if (didComponentBoundaryChange(nextRange.start)) {
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

    const currentBodyRoots = getBoundaryChildren(currentRange.start, currentRange.end)
    const nextBodyRoots = getBoundaryChildren(nextRange.start, nextRange.end)
    if (canReuseNodeSequenceAsIs(currentBodyRoots, nextBodyRoots)) {
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
      continue
    }

    if (currentBodyRoots.length === 0 && nextBodyRoots.length === 0) {
      continue
    }

    for (const componentId of preserveReusableContentInRoots(currentBodyRoots, nextBodyRoots)) {
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

const preserveExternalRootContents = (current: Node, next: Node) => {
  if (!isElementNode(current) || !isElementNode(next)) {
    return null
  }
  if (
    current.getAttribute(EXTERNAL_ROOT_ATTR) !== 'true' ||
    next.getAttribute(EXTERNAL_ROOT_ATTR) !== 'true'
  ) {
    return null
  }
  if (next.childNodes.length > 0) {
    return new Set<string>()
  }

  const movedRoots = [...current.childNodes]
  for (const node of movedRoots) {
    next.appendChild(node)
  }
  return collectComponentBoundaryIds(movedRoots)
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
        const explicitCount = getRememberedInsertMarkerNodeCount(currentMarker)
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
        setRememberedInsertMarkerNodeCount(nextChild as Comment, movedRoots.length)

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
        const preservedExternalRootIds = preserveExternalRootContents(currentChild, nextChild)
        if (preservedExternalRootIds) {
          for (const componentId of preservedExternalRootIds) {
            preservedComponentIds.add(componentId)
          }
          currentIndex = matchedIndex + 1
          continue
        }
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
  const preservedComponentIds = new Set<string>()

  // Preserve keyed range bodies before nested component boundaries so keyed list reuse
  // happens within the right render scope before standalone boundary preservation runs.
  for (const componentId of preserveKeyedRangeContentsInRoots(currentRoots, nextRoots)) {
    preservedComponentIds.add(componentId)
  }

  for (const componentId of preserveComponentBoundaryContentsInRoots(currentRoots, nextRoots)) {
    preservedComponentIds.add(componentId)
  }

  if (options?.preserveProjectionSlots ?? true) {
    for (const componentId of preserveProjectionSlotContentsInRoots(currentRoots, nextRoots)) {
      preservedComponentIds.add(componentId)
    }
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

const tryPatchNodeRangeInPlace = (start: Node, end: Node, nextNodes: Node[]) =>
  tryPatchNodeSequenceInPlace(collectBoundaryRangeNodes(start, end), nextNodes)

const replaceNodeRange = (
  start: Node,
  end: Node,
  nodes: Node[],
  options?: {
    preserveProjectionSlots?: boolean
  },
) => {
  const currentNodes = collectBoundaryRangeNodes(start, end)
  const preservedComponentIds = preserveReusableContentInRoots(currentNodes, nodes, {
    preserveProjectionSlots: options?.preserveProjectionSlots ?? true,
  })
  const parent = end.parentNode
  if (!parent) {
    return preservedComponentIds
  }
  const anchor = end.nextSibling
  for (const node of currentNodes) {
    if (node.parentNode === parent) {
      parent.removeChild(node)
    }
  }
  for (const node of nodes) {
    parent.insertBefore(node, anchor)
  }
  rememberManagedAttributesForNodes(nodes)

  return preservedComponentIds
}

export const syncManagedElementAttributes = (current: Element, next: Element) => {
  const nextNames = new Set(next.getAttributeNames())
  const nextLiveBindings = getLiveClientEventBindings(next)
  const currentElementId = current.getAttribute('data-eid')
  const hasLiveBindings = forEachLiveClientEventBindingName(nextLiveBindings, (eventName) => {
    const bindingAttr = `data-e-on${eventName}`
    if (current.getAttribute(bindingAttr) !== null) {
      nextNames.add(bindingAttr)
    }
  })
  if (currentElementId !== null && (nextNames.has('data-eid') || hasLiveBindings)) {
    nextNames.add('data-eid')
  }
  const previousNames =
    getManagedAttributeSnapshotValues(current) ??
    (typeof current.getAttributeNames === 'function' ? current.getAttributeNames() : [])

  for (const name of previousNames) {
    if (!nextNames.has(name)) {
      current.removeAttribute(name)
    }
  }

  for (const name of nextNames) {
    const nextValue = next.getAttribute(name)
    if (name === 'data-eid' && nextValue !== null && current.getAttribute(name) !== null) {
      continue
    }
    if (nextValue !== null && current.getAttribute(name) !== nextValue) {
      current.setAttribute(name, nextValue)
    }
  }

  replaceManagedAttributeSnapshot(current, nextNames)
  syncLiveClientEventBindings(current, next)

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
  preserveReusableContentInRoots(listNodeChildren(current), listNodeChildren(next))
  while (current.firstChild) {
    current.firstChild.remove()
  }
  while (next.firstChild) {
    current.appendChild(next.firstChild)
  }
  rememberManagedAttributesForNodes(current.childNodes as Iterable<Node>)
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
  setRememberedInsertMarkerNodeCount(currentMarker, nextOwnedNodes.length)
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
      token: `keyed:${createKeyedRangeIdentity(keyedRange.scope, keyedRange.key)}`,
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

      const ownedNodeCount = getRememberedInsertMarkerNodeCount(node as Comment)
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
          setRememberedInsertMarkerNodeCount(currentUnit.marker, nextOwnedNodes.length)
        }
      }
      continue
    }
    if (currentUnit.kind === 'opaque-range' && nextUnit.kind === 'opaque-range') {
      if (currentUnit.token !== nextUnit.token || currentUnit.rangeKind !== nextUnit.rangeKind) {
        return false
      }
      if (currentUnit.rangeKind === 'component-boundary') {
        if (didComponentBoundarySymbolChange(nextUnit.start)) {
          return false
        }
        if (didComponentBoundaryPropsChange(nextUnit.start)) {
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

  const currentChildNodes = current.childNodes as ArrayLike<Node>
  const nextChildNodes = next.childNodes as ArrayLike<Node>
  const currentChildCount = currentChildNodes.length ?? 0
  const nextChildCount = nextChildNodes.length ?? 0

  if (currentChildCount === nextChildCount) {
    if (currentChildCount === 0) {
      syncManagedElementAttributes(current, next)
      return true
    }
    if (currentChildCount === 1) {
      const currentChild = currentChildNodes[0]
      const nextChild = nextChildNodes[0]
      if (currentChild && nextChild && patchNodeInPlace(currentChild, nextChild)) {
        syncManagedElementAttributes(current, next)
        return true
      }
    }
  }

  if (tryPatchNodeSequenceInPlace(Array.from(currentChildNodes), Array.from(nextChildNodes))) {
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
  const currentFirst = start.nextSibling
  if (
    currentFirst &&
    currentFirst === end.previousSibling &&
    nextNodes.length === 1 &&
    patchNodeInPlace(currentFirst, nextNodes[0]!)
  ) {
    return true
  }
  const currentNodes = getBoundaryChildren(start, end)
  return tryPatchNodeSequenceInPlace(currentNodes, nextNodes)
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
  restorePendingFocusInDocument(container.doc, pending)
}

let ssrRenderer: ReturnType<typeof createSSRRenderer> | null = null

const getSSRRenderer = () => {
  ssrRenderer ??= createSSRRenderer({
    getCurrentContainer,
    isProjectionSlot: (value) => isProjectionSlot(value),
    isRouteSlot: (value) => isRouteSlot(value),
    renderProjectionSlotToString: (value) =>
      renderProjectionSlotToString(value as ProjectionSlotValue),
    renderStringNode,
    resolveRouteSlot: (container, slot) =>
      resolveRouteSlot(container as RuntimeContainer | null, slot as RouteSlotCarrier),
  })
  return ssrRenderer
}

export const renderSSRAttr = (name: string, value: unknown) =>
  getSSRRenderer().renderSSRAttr(name, value)

export const renderSSRValue = (value: unknown): string => getSSRRenderer().renderSSRValue(value)

export const renderSSRMap = <T>(
  value:
    | readonly T[]
    | {
        map: (callback: (item: T, index: number) => string) => {
          join: (separator: string) => string
        }
      },
  renderItem: (item: T, index: number) => string,
): string => getSSRRenderer().renderSSRMap(value, renderItem)

const renderStringArray = (values: readonly (JSX.Element | JSX.Element[])[]) =>
  withActiveKeyedRangeScope(allocateKeyedRangeScope(), () => renderSSRValue(values))

const renderSSRTemplateNode = (template: JSX.SSRTemplate) => renderSSRValue(template)

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
  const capturedValues =
    'captures' in descriptor
      ? resolveCaptureValues(descriptor.captures)
      : resolveEventDescriptorCaptures(descriptor)
  const serializedCaptures = capturedValues.map((value) => serializeRuntimeValue(container, value))
  const cacheKey = createSerializedScopeCacheKey(descriptor.symbol, serializedCaptures)
  const cachedScopeId = container.eventBindingScopeCache.get(cacheKey)
  const scopeId =
    cachedScopeId && container.scopes.has(cachedScopeId)
      ? cachedScopeId
      : registerSerializedScope(container, serializedCaptures)
  if (!cachedScopeId || cachedScopeId !== scopeId) {
    container.eventBindingScopeCache.set(cacheKey, scopeId)
  }
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

  ensureDelegatedDocumentEventListener(container, eventName)
  setLiveClientEventBinding(container, element, eventName, descriptor)
  warmRuntimeSymbol(container, descriptor.symbol)
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

let unscopedKeyedRangeScopeCounter = 0

const allocateKeyedRangeScope = () => {
  const frame = getCurrentFrame()
  if (!frame) {
    return `global:${unscopedKeyedRangeScopeCounter++}`
  }
  return `${frame.component.id}:k${frame.keyedRangeCursor++}`
}

const withActiveKeyedRangeScope = <T>(scope: string, render: () => T): T => {
  const frame = getCurrentFrame()
  if (!frame) {
    return render()
  }
  const scopeStack = ensureFrameKeyedRangeScopeStack(frame)
  scopeStack.push(scope)
  try {
    return render()
  } finally {
    scopeStack.pop()
  }
}

const resolveKeyedRangeScope = () => {
  const frame = getCurrentFrame()
  const scopeStack = frame ? getFrameKeyedRangeScopeStack(frame) : null
  const activeScope = scopeStack && scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : null
  return activeScope ?? allocateKeyedRangeScope()
}

const wrapStringWithKeyedRange = (value: string, scope: string, key: string | number | symbol) => {
  const start = createKeyedRangeMarker(scope, key, 'start')
  const end = createKeyedRangeMarker(scope, key, 'end')
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

const createStaticRowSignalHandle = <T>(value: T): { value: T } => ({ value })

const createForCallbackArgs = <T>(value: ForValue<T>, item: T, index: number): [T, number] =>
  value.reactiveRows
    ? [
        createStaticRowSignalHandle(item) as unknown as T,
        createStaticRowSignalHandle(index) as unknown as number,
      ]
    : [item, index]

const disposeKeyedForRowSignals = (container: RuntimeContainer, row: KeyedForRowState<unknown>) => {
  for (const signalId of [row.itemSignalId, row.indexSignalId]) {
    if (!signalId) {
      continue
    }
    container.signals.delete(signalId)
    container.asyncSignalStates.delete(signalId)
    container.asyncSignalSnapshotCache.delete(signalId)
  }
}

const getKeyedForOwnerRange = <T>(state: KeyedForOwnerState<T>) => {
  const firstKey = state.order[0]
  const lastKey = state.order[state.order.length - 1]
  if (firstKey === undefined || lastKey === undefined) {
    return {
      end: null,
      start: null,
    }
  }
  const firstRow = state.rows.get(firstKey)
  const lastRow = state.rows.get(lastKey)
  return {
    end: lastRow?.end ?? null,
    start: firstRow?.start ?? null,
  }
}

const countNodesBetween = (start: Node | null, end: Node | null) => {
  if (!start || !end) {
    return 0
  }
  let count = 0
  let cursor: Node | null = start
  while (cursor) {
    count += 1
    if (cursor === end) {
      return count
    }
    cursor = cursor.nextSibling
  }
  return count
}

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

  const scope = allocateKeyedRangeScope()
  let output = ''
  for (let index = 0; index < value.arr.length; index += 1) {
    const item = value.arr[index]!
    const [callbackItem, callbackIndex] = createForCallbackArgs(value, item, index)
    output += wrapStringWithKeyedRange(
      renderStringNode(stripForChildRootKey(value.fn(callbackItem, callbackIndex))),
      scope,
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

const createExternalRootHtml = (componentId: string, kind: string, body: string) =>
  `<e-island-root ${EXTERNAL_ROOT_ATTR}="true" ${EXTERNAL_ROOT_COMPONENT_ATTR}="${escapeAttr(
    componentId,
  )}" ${EXTERNAL_ROOT_KIND_ATTR}="${escapeAttr(kind)}">${body}</e-island-root>`

const createExternalRootNode = (
  container: RuntimeContainer,
  componentId: string,
  kind: string,
  body?: string,
) => {
  if (!container.doc) {
    throw new Error('Client rendering requires a document.')
  }
  const host = container.doc.createElement('e-island-root')
  host.setAttribute(EXTERNAL_ROOT_ATTR, 'true')
  host.setAttribute(EXTERNAL_ROOT_COMPONENT_ATTR, componentId)
  host.setAttribute(EXTERNAL_ROOT_KIND_ATTR, kind)
  if (body) {
    host.innerHTML = body
  }
  return host
}

const getExternalRoot = (component: ComponentState) => {
  if (!component.start || !component.end) {
    return null
  }
  let cursor = component.start.nextSibling
  while (cursor && cursor !== component.end) {
    if (isElementNode(cursor) && cursor.getAttribute(EXTERNAL_ROOT_ATTR) === 'true') {
      return cursor as HTMLElement
    }
    cursor = cursor.nextSibling
  }
  return null
}

const findExternalSlotHost = (
  host: HTMLElement,
  kind: ExternalComponentDescriptor['kind'],
  name: string,
) => {
  if (typeof host.querySelectorAll !== 'function') {
    return host.querySelector?.(`${getExternalSlotTag(kind)}[data-e-slot="${name}"]`) ?? null
  }
  const matches = [
    ...host.querySelectorAll<HTMLElement>(`${getExternalSlotTag(kind)}[data-e-slot="${name}"]`),
  ]
  if (matches.length === 0) {
    return null
  }
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = matches[index]!
    if (candidate.childNodes.length > 0 || (candidate.innerHTML ?? '') !== '') {
      return candidate
    }
  }
  return matches[0]!
}

const captureExternalSlotDom = (component: ComponentState) => {
  if (!component.external) {
    return null
  }
  const host = getExternalRoot(component)
  if (!host || typeof host.querySelector !== 'function') {
    return null
  }
  const captured = new Map<string, Node[]>()
  for (const name of component.external.slots) {
    const slotHost = findExternalSlotHost(host, component.external.kind, name)
    captured.set(name, slotHost ? [...slotHost.childNodes] : [])
  }
  return captured
}

const captureExternalSlotHtml = (component: ComponentState) => {
  if (!component.external) {
    return null
  }
  const host = getExternalRoot(component)
  if (!host || typeof host.querySelector !== 'function') {
    return null
  }
  const captured = new Map<string, string>()
  for (const name of component.external.slots) {
    const slotHost = findExternalSlotHost(host, component.external.kind, name)
    captured.set(name, slotHost?.innerHTML ?? '')
  }
  return captured
}

const createExternalProjectionSlotOwnerId = (
  componentId: string,
  name: string,
  occurrence: number,
) => `${componentId}.$slot:${encodeURIComponent(name)}:${occurrence}`

const renderExternalProjectionSlotNodes = (
  container: RuntimeContainer,
  component: ComponentState,
  name: string,
  occurrence: number,
  source: unknown,
) => {
  const ownerId = createExternalProjectionSlotOwnerId(component.id, name, occurrence)
  const nodes = renderClientInsertableForOwner(source as Insertable, container, {
    childIndex: 0,
    componentId: ownerId,
    keyedRangeCursor: 0,
    parentComponentId: component.id,
    projectionCounters: EMPTY_CLIENT_INSERT_PROJECTION_COUNTERS,
  })
  return { nodes, ownerId }
}

const syncExternalProjectionSlotDom = (
  container: RuntimeContainer,
  component: ComponentState,
  props: Record<string, unknown>,
  host: HTMLElement,
) => {
  if (!component.external || !component.projectionSlots) {
    return false
  }

  const oldDescendants = collectDescendantIds(container, component.id)
  const slotRanges = collectProjectionSlotRanges([host])
  const keptSlotOwners = new Set<string>()
  let changed = false

  for (const [name, totalOccurrences] of Object.entries(component.projectionSlots)) {
    for (let occurrence = 0; occurrence < totalOccurrences; occurrence += 1) {
      const rangeKey = createProjectionSlotRangeKey(component.id, name, occurrence)
      const range = slotRanges.get(rangeKey)
      const hasValue = hasProjectionSlotValue(props, name)

      if (!hasValue) {
        if (!range) {
          continue
        }
        if (!tryPatchBoundaryContentsInPlace(range.start, range.end, [])) {
          replaceProjectionSlotContents(range.start, range.end, [])
        }
        changed = true
        continue
      }

      const slotHost =
        range || occurrence > 0 ? null : findExternalSlotHost(host, component.external.kind, name)
      if (!range && !slotHost) {
        continue
      }

      const { nodes, ownerId } = renderExternalProjectionSlotNodes(
        container,
        component,
        name,
        occurrence,
        props[name],
      )
      keptSlotOwners.add(ownerId)

      if (range) {
        if (!tryPatchBoundaryContentsInPlace(range.start, range.end, nodes)) {
          replaceProjectionSlotContents(range.start, range.end, nodes)
        }
        changed = true
        continue
      }
      if (!slotHost) {
        continue
      }

      while (slotHost.firstChild) {
        slotHost.firstChild.remove()
      }

      const start = container.doc!.createComment(
        createProjectionSlotMarker(component.id, name, occurrence, 'start'),
      )
      const end = container.doc!.createComment(
        createProjectionSlotMarker(component.id, name, occurrence, 'end'),
      )

      slotHost.appendChild(start)
      for (const node of nodes) {
        slotHost.appendChild(node)
      }
      slotHost.appendChild(end)
      rememberManagedAttributesForNodes([start, ...nodes, end])
      slotRanges.set(rangeKey, { end, start })
      changed = true
    }
  }

  if (!changed) {
    return false
  }

  bindComponentBoundaries(container, host)
  restoreSignalRefs(container, host)
  bindRouterLinks(container, host)

  const keptDescendants = expandComponentIdsToDescendants(container, [
    ...collectComponentBoundaryIds([host]),
    ...keptSlotOwners,
  ])
  pruneRemovedComponents(container, component.id, keptDescendants)
  for (const descendantId of oldDescendants) {
    if (keptDescendants.has(descendantId)) {
      continue
    }
    clearComponentSubscriptions(container, descendantId)
  }

  component.externalSlotDom = captureExternalSlotDom(component)
  component.externalSlotHtml = captureExternalSlotHtml(component)
  return true
}

const restoreExternalSlotDom = (component: ComponentState, host: HTMLElement) => {
  if (
    !component.external ||
    !component.externalSlotDom ||
    typeof host.querySelector !== 'function'
  ) {
    return
  }
  for (const [name, nodes] of component.externalSlotDom) {
    const slotHost = findExternalSlotHost(host, component.external.kind, name)
    if (!slotHost || slotHost.childNodes.length > 0 || nodes.length === 0) {
      continue
    }
    for (const node of nodes) {
      slotHost.appendChild(node)
    }
  }
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const renderExternalSlotContentToString = (
  componentId: string,
  name: string,
  occurrence: number,
  source: unknown,
) => {
  if (source === null || source === undefined || source === false) {
    return ''
  }
  return renderProjectionSlotToString(createProjectionSlot(componentId, name, occurrence, source))
}

const injectExternalSlotHtml = (
  componentId: string,
  kind: ExternalComponentDescriptor['kind'],
  projectionSlots: Record<string, number> | null,
  props: Record<string, unknown>,
  html: string,
) => {
  if (!projectionSlots) {
    return html
  }

  const slotTag = getExternalSlotTag(kind)
  let nextHtml = html
  for (const [name, totalOccurrences] of Object.entries(projectionSlots)) {
    if (!hasProjectionSlotValue(props, name)) {
      continue
    }
    const pattern = new RegExp(
      `<${slotTag}([^>]*?)data-e-slot=(["'])${escapeRegExp(name)}\\2([^>]*)>([\\s\\S]*?)</${slotTag}>`,
    )
    for (let occurrence = 0; occurrence < totalOccurrences; occurrence += 1) {
      const slotHtml = renderExternalSlotContentToString(componentId, name, occurrence, props[name])
      nextHtml = nextHtml.replace(
        pattern,
        `<${slotTag}$1data-e-slot="${name}"$3>${slotHtml}</${slotTag}>`,
      )
    }
  }

  return nextHtml
}

const renderExternalComponentHtml = (
  container: RuntimeContainer,
  componentId: string,
  external: ExternalComponentMeta,
  props: Record<string, unknown>,
  projectionSlots: Record<string, number> | null,
) => {
  const cacheKey = `${componentId}:${external.kind}`
  const cached = container.externalRenderCache.get(cacheKey)
  if (cached?.status === 'resolved') {
    return injectExternalSlotHtml(
      componentId,
      external.kind,
      projectionSlots,
      props,
      cached.html ?? '',
    )
  }
  if (cached?.status === 'rejected') {
    throw cached.error
  }
  if (cached?.status === 'pending') {
    if (cached.pending) {
      container.pendingSuspensePromises.add(cached.pending)
    }
    return ''
  }

  const result = external.renderToString(props)
  if (typeof result === 'string') {
    container.externalRenderCache.set(cacheKey, {
      html: result,
      status: 'resolved',
    })
    return injectExternalSlotHtml(componentId, external.kind, projectionSlots, props, result)
  }

  const pending = Promise.resolve(result).then(
    (resolved) => {
      container.externalRenderCache.set(cacheKey, {
        html: resolved,
        status: 'resolved',
      })
      return resolved
    },
    (error) => {
      container.externalRenderCache.set(cacheKey, {
        error,
        status: 'rejected',
      })
      throw error
    },
  )
  container.externalRenderCache.set(cacheKey, {
    pending,
    status: 'pending',
  })
  container.pendingSuspensePromises.add(pending)
  return ''
}

const syncExternalComponentInstance = async (
  component: ComponentState,
  external: ExternalComponentMeta,
  props: Record<string, unknown>,
  host: HTMLElement,
) => {
  if (component.externalInstance === undefined) {
    component.externalMeta = external
    component.externalInstance = await external.hydrate(host, props)
    return
  }

  component.externalMeta = external
  component.externalInstance = await external.update(component.externalInstance, host, props)
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
      : wrapStringWithKeyedRange(rendered, resolveKeyedRangeScope(), resolved.key)
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
        : wrapStringWithKeyedRange(rendered, resolveKeyedRangeScope(), resolved.key)
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
    const captures = resolveCaptureValues(meta.captures)
    component.scopeId = captures.length > 0 ? registerScope(container, captures) : null
    component.external = meta.external
    component.optimizedRoot = meta.optimizedRoot === true
    component.props = evaluatedProps
    component.projectionSlots = meta.projectionSlots ?? null
    component.rawProps = resolved.props

    const externalMeta = getExternalComponentMeta(componentFn)
    if (externalMeta) {
      const externalBody = renderExternalComponentHtml(
        container,
        componentId,
        externalMeta,
        evaluatedProps,
        component.projectionSlots,
      )
      const host = createExternalRootHtml(componentId, externalMeta.kind, externalBody)
      const rendered = `${createComponentBoundaryHtmlComment(componentId, 'start')}${host}${createComponentBoundaryHtmlComment(componentId, 'end')}`
      return resolved.key === null || resolved.key === undefined
        ? rendered
        : wrapStringWithKeyedRange(rendered, resolveKeyedRangeScope(), resolved.key)
    }

    const frame = createFrame(container, component, 'ssr')
    clearComponentSubscriptions(container, component.id)
    const renderProps = createRenderProps(componentId, meta, resolved.props)

    const body = pushFrame(frame, () => renderStringNode(componentFn(renderProps)))
    pruneComponentVisibles(container, component, frame.visibleCursor)
    pruneComponentWatches(container, component, frame.watchCursor)
    const rendered = `${createComponentBoundaryHtmlComment(componentId, 'start')}${renderFrameScopedStylesToString(frame)}${body}${createComponentBoundaryHtmlComment(componentId, 'end')}`
    return resolved.key === null || resolved.key === undefined
      ? rendered
      : wrapStringWithKeyedRange(rendered, resolveKeyedRangeScope(), resolved.key)
  }

  const attrParts: string[] = []
  const container = getCurrentContainer()
  const frame = getCurrentFrame()
  let hasInnerHTML = false
  let innerHTML: string | null = null
  let isActionForm = false

  if (frame && hasScopedStyles(frame) && resolved.type !== 'style') {
    attrParts.push(
      `${SCOPED_STYLE_ATTR}="${escapeAttr(ensureComponentScopeId(frame.container, frame.component))}"`,
    )
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

    if (isDangerouslySetInnerHTMLProp(name)) {
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
      if (name === ACTION_FORM_ATTR) {
        isActionForm = true
      }
      continue
    }

    if (name === ACTION_FORM_ATTR) {
      isActionForm = true
    }
    attrParts.push(`${name}="${escapeAttr(String(value))}"`)
  }

  if (resolved.type === 'body' && container) {
    attrParts.push('data-e-resume="paused"')
  }

  let childrenText = innerHTML ?? ''
  if (!hasInnerHTML) {
    if (resolved.type === 'form' && isActionForm) {
      const csrfToken = getCurrentActionCsrfToken()
      if (csrfToken) {
        childrenText += createActionCsrfInputString(csrfToken)
      }
    }
    childrenText += renderStringNode(resolved.props.children as JSX.Element | JSX.Element[])
  }

  const rendered =
    resolved.type === FRAGMENT
      ? childrenText
      : `<${resolved.type}${attrParts.length > 0 ? ` ${attrParts.join(' ')}` : ''}>${childrenText}</${
          resolved.type
        }>`
  return resolved.key === null || resolved.key === undefined
    ? rendered
    : wrapStringWithKeyedRange(rendered, resolveKeyedRangeScope(), resolved.key)
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
  component.external = meta.external
  component.optimizedRoot = meta.optimizedRoot === true
  component.props = props
  component.rawProps = rawProps ?? null
  component.projectionSlots = meta.projectionSlots ?? null
  const externalMeta = getExternalComponentMeta(componentFn)
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
  if (mode === 'client' && externalMeta && previousStart && previousEnd && !symbolChanged) {
    const { end, start } = createComponentBoundaryPair(container.doc, componentId)

    const host = getExternalRoot(component)
    if (wasActive && host && propsChanged) {
      void withClientContainer(container, async () => {
        syncExternalProjectionSlotDom(container, component, props, host)
        await syncExternalComponentInstance(component, externalMeta, props, host)
        syncExternalProjectionSlotDom(container, component, props, host)
        rebindExternalHost(container, host)
        scheduleExternalHostRebind(container, host)
      })
    }

    if (parentFrame) {
      for (const descendantId of expandComponentIdsToDescendants(container, [componentId])) {
        ensureFrameVisitedDescendants(parentFrame).add(descendantId)
      }
      if (component.mayChangeNodeCount) {
        markComponentMayChangeNodeCount(container, parentFrame.component.id)
      }
    }

    return [start, end]
  }
  if (mode === 'client' && wasActive && previousStart && previousEnd && !boundaryContentsChanged) {
    const { end, start } = createComponentBoundaryPair(container.doc, componentId)

    if (parentFrame) {
      for (const descendantId of expandComponentIdsToDescendants(container, [componentId])) {
        ensureFrameVisitedDescendants(parentFrame).add(descendantId)
      }
      if (component.mayChangeNodeCount) {
        markComponentMayChangeNodeCount(container, parentFrame.component.id)
      }
    }

    return [start, end]
  }
  if (externalMeta) {
    const { end, start } = createComponentBoundaryPair(container.doc, componentId, {
      propsChanged: true,
      symbolChanged,
    })
    if (!previousStart || !previousEnd) {
      component.start = start
      component.end = end
    }

    const host = createExternalRootNode(container, componentId, externalMeta.kind)
    if (parentFrame) {
      ensureFrameVisitedDescendants(parentFrame).add(componentId)
      if (component.mayChangeNodeCount) {
        markComponentMayChangeNodeCount(container, parentFrame.component.id)
      }
    }
    if (mode === 'client') {
      scheduleExternalComponentMount(container, component, externalMeta, props)
    }
    return [start, host, end]
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
  const { end, start } = createComponentBoundaryPair(container.doc, componentId, {
    propsChanged: boundaryContentsChanged,
    symbolChanged,
  })
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
      const parentVisitedDescendants = ensureFrameVisitedDescendants(parentFrame)
      parentVisitedDescendants.add(componentId)
      for (const descendantId of getFrameVisitedDescendants(frame)) {
        parentVisitedDescendants.add(descendantId)
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
    ...getFrameVisitedDescendants(frame),
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
    const parentVisitedDescendants = ensureFrameVisitedDescendants(parentFrame)
    parentVisitedDescendants.add(componentId)
    for (const descendantId of keptDescendants) {
      parentVisitedDescendants.add(descendantId)
    }
    if (component.mayChangeNodeCount) {
      markComponentMayChangeNodeCount(container, parentFrame.component.id)
    }
  }

  scheduleMountCallbacks(container, component, getFrameMountCallbacks(frame))
  scheduleVisibleCallbacksCheck(container)
  syncEffectOnlyLocalSignalPreference(component)

  return [start, ...renderFrameScopedStylesToNodes(frame, container), ...rendered, end]
}

const wrapNodesWithKeyedRange = (
  doc: Document,
  nodes: Node[],
  scope: string,
  key: string | number | symbol,
): Node[] => [
  doc.createComment(createKeyedRangeMarker(scope, key, 'start')),
  ...nodes,
  doc.createComment(createKeyedRangeMarker(scope, key, 'end')),
]

const renderForValueToNodes = <T>(value: ForValue<T>, container: RuntimeContainer): Node[] => {
  if (value.arr.length === 0) {
    return renderClientNodes((value.fallback ?? null) as JSX.Element, container)
  }

  const scope = allocateKeyedRangeScope()
  const nodes: Node[] = []
  for (let index = 0; index < value.arr.length; index += 1) {
    const item = value.arr[index]!
    const [callbackItem, callbackIndex] = createForCallbackArgs(value, item, index)
    nodes.push(
      ...wrapNodesWithKeyedRange(
        container.doc!,
        renderClientNodes(stripForChildRootKey(value.fn(callbackItem, callbackIndex)), container),
        scope,
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
    setLiveClientEventBinding(container, element, eventName, eventMeta)
    return
  }

  if (name === 'ref') {
    syncRuntimeRefMarker(element, value)
    assignRuntimeRef(value, element, container)
    return
  }

  if (isDangerouslySetInnerHTMLProp(name)) {
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
    return withActiveKeyedRangeScope(allocateKeyedRangeScope(), () => {
      const nodes: Node[] = []
      for (const entry of inputElementLike) {
        const rendered = renderClientNodes(entry, container)
        if (rendered.length === 1) {
          nodes.push(rendered[0]!)
          continue
        }
        if (rendered.length > 1) {
          nodes.push(...rendered)
        }
      }
      return nodes
    })
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
    if (!hasRememberedManagedAttributesForSubtree(resolved)) {
      rememberManagedAttributesForSubtree(resolved)
    }
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
    nodes = renderClientNodes(resolved.props.children as JSX.Element | JSX.Element[], container)
  } else {
    const element = createElementNode(container.doc, resolved.type)
    const frame = getCurrentFrame()
    if (frame && hasScopedStyles(frame) && resolved.type !== 'style') {
      element.setAttribute(SCOPED_STYLE_ATTR, ensureComponentScopeId(container, frame.component))
    }
    let hasInnerHTML = false
    for (const name of Object.keys(resolved.props)) {
      if (name === 'children') {
        continue
      }
      const value = resolved.props[name]
      if (resolved.type === 'body' && name === 'data-e-resume') {
        continue
      }
      if (isDangerouslySetInnerHTMLProp(name)) {
        hasInnerHTML = true
      }
      applyElementProp(element, name, value, container)
    }

    if (hasInnerHTML) {
      rememberManagedAttributesForNode(element)
      nodes = [element]
    } else {
      if (resolved.type === 'form' && element.getAttribute(ACTION_FORM_ATTR) !== null) {
        const csrfToken = readActionCsrfTokenFromRuntimeDocument(container.doc)
        if (csrfToken) {
          element.appendChild(createActionCsrfInputNode(container.doc, csrfToken))
        }
      }
      const childNodes = renderClientNodes(
        resolved.props.children as JSX.Element | JSX.Element[],
        container,
      )
      for (const child of childNodes) {
        element.appendChild(child)
      }

      rememberManagedAttributesForNode(element)
      nodes = [element]
    }
  }

  return resolved.key === null || resolved.key === undefined
    ? nodes
    : wrapNodesWithKeyedRange(container.doc, nodes, resolveKeyedRangeScope(), resolved.key)
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
    const marker = parseComponentBoundaryMarker((node as Comment).data)
    if (!marker) {
      continue
    }
    const boundary = boundaries.get(marker.id) ?? {}
    if (marker.kind === 'start') {
      boundary.start = node as Comment
    } else {
      boundary.end = node as Comment
    }
    boundaries.set(marker.id, boundary)
  }

  return boundaries
}

const loadSymbol = async (
  container: RuntimeContainer,
  symbolId: string,
): Promise<RuntimeSymbolModule> => {
  const loaded = startRuntimeSymbolImport(container, symbolId)
  if (!loaded) {
    throw new Error(`Missing symbol URL for ${symbolId}.`)
  }
  return loaded
}

const toMountedNodes = (value: unknown, container: RuntimeContainer): Node[] => {
  if (!container.doc) {
    throw new Error('Client rendering requires a document.')
  }

  let resolved: unknown = value
  while (typeof resolved === 'function') {
    resolved = resolved()
  }

  if (Array.isArray(resolved)) {
    return withActiveKeyedRangeScope(allocateKeyedRangeScope(), () =>
      resolved.flatMap((entry) => toMountedNodes(entry, container)),
    )
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

export const getRuntimeContainer = () => getCurrentContainer() ?? currentEffect?.container ?? null

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
  const projectionCounters = getFrameProjectionCounters(frame)
  return {
    childIndex: 0,
    componentId: ownerComponentId,
    keyedRangeCursor: frame.keyedRangeCursor,
    lazy: false,
    parentComponentId: frame.component.id,
    projectionCounters:
      projectionCounters.size === 0
        ? EMPTY_CLIENT_INSERT_PROJECTION_COUNTERS
        : [...projectionCounters.entries()],
    state: null,
  }
}

export const createDetachedClientInsertOwner = (container: RuntimeContainer): ClientInsertOwner => {
  const componentId = `${CLIENT_INSERT_OWNER_ID_PREFIX}${container.nextComponentId++}`
  return {
    childIndex: 0,
    componentId,
    keyedRangeCursor: 0,
    lazy: false,
    parentComponentId: ROOT_COMPONENT_ID,
    projectionCounters: EMPTY_CLIENT_INSERT_PROJECTION_COUNTERS,
    state: null,
  }
}

const createClientInsertOwnerComponent = (owner: ClientInsertOwner): ComponentState => {
  const component =
    owner.lazy === true
      ? createLazyClientInsertOwnerState(owner)
      : createInactiveComponentState(
          owner.componentId,
          owner.parentComponentId,
          CLIENT_INSERT_OWNER_SYMBOL,
        )
  owner.state = component
  return component
}

const getOrCreateClientInsertOwnerComponent = (
  container: RuntimeContainer,
  owner: ClientInsertOwner,
) => {
  if (owner.lazy !== true) {
    const existing = container.components.get(owner.componentId)
    const component = getOrCreateComponentState(
      container,
      owner.componentId,
      CLIENT_INSERT_OWNER_SYMBOL,
      owner.parentComponentId,
    )
    owner.state = component
    return { component, isFresh: !existing }
  }

  const existing = owner.state
  if (existing) {
    owner.state = existing
    if (existing.registered) {
      syncComponentParent(container, existing, owner.parentComponentId)
    } else {
      existing.parentId = owner.parentComponentId
    }
    existing.symbol = CLIENT_INSERT_OWNER_SYMBOL
    return { component: existing, isFresh: false }
  }
  return {
    component: createClientInsertOwnerComponent(owner),
    isFresh: true,
  }
}

const createKeyedForRowOwner = (
  ownerComponentId: string,
  rowOwnerIndex: number,
): ClientInsertOwner => ({
  childIndex: 0,
  componentId: `${ownerComponentId}.${rowOwnerIndex}`,
  keyedRangeCursor: 0,
  lazy: true,
  parentComponentId: ownerComponentId,
  projectionCounters: EMPTY_CLIENT_INSERT_PROJECTION_COUNTERS,
  state: null,
})

const hasStableClientInsertOwnerNodeCount = (
  container: RuntimeContainer,
  owner: ClientInsertOwner | string,
) => {
  if (typeof owner === 'string') {
    return !componentMayChangeNodeCount(container, owner)
  }
  if (owner.state) {
    if (owner.state.mayChangeNodeCount === true) {
      return false
    }
    if (!owner.state.registered) {
      return true
    }
  }
  return !componentMayChangeNodeCount(container, owner.componentId)
}

const removeNodesFromParent = (nodes: Node[], parent: ParentNode) => {
  for (const node of nodes) {
    if (node.parentNode === parent) {
      if (typeof (node as Node & { remove?: () => void }).remove === 'function') {
        ;(node as Node & { remove: () => void }).remove()
      } else {
        parent.removeChild(node)
      }
    }
  }
}

const insertNodesBeforeMarker = (nodes: Node[], parent: ParentNode, marker: Node | undefined) => {
  for (const node of nodes) {
    parent.insertBefore(node, marker ?? null)
  }
}

const moveBoundaryRangeBeforeMarker = (
  start: Node,
  end: Node,
  parent: ParentNode,
  marker: Node | undefined,
) => {
  const doc = parent.ownerDocument ?? start.ownerDocument
  if (!doc || typeof doc.createDocumentFragment !== 'function') {
    insertNodesBeforeMarker(collectBoundaryRangeNodes(start, end), parent, marker)
    return
  }

  const fragment = doc.createDocumentFragment()
  let cursor: Node | null = start
  while (cursor) {
    const next: Node | null = cursor === end ? null : cursor.nextSibling
    fragment.appendChild(cursor)
    if (cursor === end) {
      break
    }
    cursor = next
  }
  parent.insertBefore(fragment, marker ?? null)
}

const disposeClientInsertOwner = (container: RuntimeContainer, owner: ClientInsertOwner) => {
  const component = owner.state ?? container.components.get(owner.componentId)
  if (!component) {
    return
  }
  if (component.registered) {
    disposeComponentTree(container, owner.componentId)
    owner.state = null
    return
  }
  disposeCleanupSlot(component.renderEffectCleanupSlot)
  component.renderEffectCleanupSlot = null
  owner.state = null
}

const teardownKeyedForOwnerState = (
  container: RuntimeContainer,
  ownerComponent: ComponentState,
  parent: ParentNode,
  currentNodes: Node[],
) => {
  const state = keyedForOwnerStates.get(ownerComponent)
  if (state) {
    for (const row of state.rows.values()) {
      removeNodesFromParent(collectBoundaryRangeNodes(row.start, row.end), parent)
      disposeKeyedForRowSignals(container, row as KeyedForRowState<unknown>)
      disposeClientInsertOwner(container, row.owner)
    }
    keyedForOwnerStates.delete(ownerComponent)
  }

  clearComponentSubscriptions(container, ownerComponent.id)
  resetComponentRenderEffects(ownerComponent)
  pruneRemovedComponents(container, ownerComponent.id, new Set())
  pruneComponentVisibles(container, ownerComponent, 0)
  pruneComponentWatches(container, ownerComponent, 0)
  removeNodesFromParent(currentNodes, parent)
}

export const reconcileClientKeyedForInPlace = (
  value: Insertable,
  container: RuntimeContainer,
  owner: ClientInsertOwner | null,
  parent: ParentNode,
  marker: Node | undefined,
  getCurrentNodes: () => Node[],
): KeyedForReconcileResult | null => {
  if (!owner) {
    return null
  }

  let cachedCurrentNodes: Node[] | null = null
  const currentNodes = () => {
    if (!cachedCurrentNodes) {
      cachedCurrentNodes = getCurrentNodes()
    }
    return cachedCurrentNodes
  }

  let resolved: unknown = value
  while (true) {
    if (
      typeof resolved === 'function' &&
      !getLazyMeta(resolved) &&
      !getComponentMeta(resolved) &&
      !getContextProviderMeta(resolved)
    ) {
      resolved = resolved()
      continue
    }
    if (
      isRenderObject(resolved) &&
      typeof resolved.type === 'function' &&
      !getLazyMeta(resolved.type) &&
      !getComponentMeta(resolved.type) &&
      !getContextProviderMeta(resolved.type)
    ) {
      resolved = (resolved.type as (props: Record<string, unknown>) => unknown)(resolved.props)
      continue
    }
    break
  }

  const { component: ownerComponent } = getOrCreateClientInsertOwnerComponent(container, owner)
  if (!isForValue(resolved) || resolved.arr.length === 0) {
    if (keyedForOwnerStates.has(ownerComponent)) {
      teardownKeyedForOwnerState(container, ownerComponent, parent, currentNodes())
    }
    return null
  }

  const state: KeyedForOwnerState<(typeof resolved.arr)[number]> = (keyedForOwnerStates.get(
    ownerComponent,
  ) as KeyedForOwnerState<(typeof resolved.arr)[number]> | undefined) ?? {
    dirtyRows: [],
    nextRowOwnerIndex: 0,
    order: [],
    orderedRows: [],
    rows: new Map(),
    totalNodeCount: 0,
  }
  if (!keyedForOwnerStates.has(ownerComponent)) {
    keyedForOwnerStates.set(ownerComponent, state)
    removeNodesFromParent(currentNodes(), parent)
  }

  const usesReactiveItem = resolved.reactiveRows
  const usesReactiveIndex = resolved.reactiveRows && resolved.reactiveIndex !== false
  const renderRowNodes = (
    rowOwner: ClientInsertOwner,
    callbackItem: (typeof resolved.arr)[number] | { value: (typeof resolved.arr)[number] },
    callbackIndex: number | { value: number },
  ) =>
    renderForCallbackNodesForOwner(
      container,
      rowOwner,
      resolved.fn as (item: typeof callbackItem, index: typeof callbackIndex) => unknown,
      callbackItem,
      callbackIndex,
    )

  if (state.rows.size === 0) {
    const nextRows = new Map<
      string | number | symbol,
      KeyedForRowState<(typeof resolved.arr)[number]>
    >()
    const nextOrder: Array<string | number | symbol> = []
    const nextOrderedRows: KeyedForRowState<(typeof resolved.arr)[number]>[] = []
    let needsRefRestore = false
    let totalNodeCount = 0
    const fragment =
      container.doc && 'createDocumentFragment' in container.doc
        ? container.doc.createDocumentFragment()
        : null

    withBatchedSignalWrites(container, () => {
      for (let index = 0; index < resolved.arr.length; index += 1) {
        const item = resolved.arr[index]!
        const key = resolveForItemKey(resolved, item, index)
        const rowOwner = createKeyedForRowOwner(owner.componentId, state.nextRowOwnerIndex++)
        const callbackItem = usesReactiveItem
          ? createTransientInternalDetachedRuntimeSignal(container, item)
          : item
        const callbackIndex = usesReactiveIndex
          ? createTransientInternalDetachedRuntimeSignal(container, index)
          : index
        const bodyNodes = renderRowNodes(rowOwner, callbackItem, callbackIndex)
        if (fragment) {
          for (const node of bodyNodes) {
            fragment.appendChild(node)
          }
        } else {
          insertNodesBeforeMarker(bodyNodes, parent, marker ?? undefined)
        }
        needsRefRestore ||=
          container.hasRuntimeRefMarkers && nodesContainSignalRefMarkers(bodyNodes)

        const row = {
          end: bodyNodes[bodyNodes.length - 1]!,
          index,
          indexSignal: usesReactiveIndex ? (callbackIndex as { value: number }) : undefined,
          indexSignalId: undefined,
          item,
          itemSignal: usesReactiveItem
            ? (callbackItem as { value: (typeof resolved.arr)[number] })
            : undefined,
          itemSignalId: undefined,
          key,
          nodeCount: bodyNodes.length,
          owner: rowOwner,
          stableNodeCount: hasStableClientInsertOwnerNodeCount(container, rowOwner),
          start: bodyNodes[0]!,
        } satisfies KeyedForRowState<(typeof resolved.arr)[number]>

        totalNodeCount += row.nodeCount
        nextRows.set(key, row)
        nextOrder[index] = key
        nextOrderedRows[index] = row
      }
    })

    if (fragment) {
      parent.insertBefore(fragment, marker ?? null)
    }

    state.rows = nextRows
    state.order = nextOrder
    state.orderedRows = nextOrderedRows
    state.totalNodeCount = totalNodeCount
    keyedForOwnerStates.set(ownerComponent, state)

    return {
      firstNode: nextOrderedRows[0]?.start ?? marker,
      needsRefRestore,
      nodeCount: totalNodeCount,
    }
  }

  let canUseStableOrderFastPath = state.orderedRows.length === resolved.arr.length
  state.dirtyRows.length = 0
  if (canUseStableOrderFastPath) {
    for (let index = 0; index < resolved.arr.length; index += 1) {
      const item = resolved.arr[index]!
      const row = state.orderedRows[index]
      if (!row) {
        canUseStableOrderFastPath = false
        break
      }
      if (
        (row.item !== item || row.index !== index) &&
        resolveForItemKey(resolved, item, index) !== row.key
      ) {
        canUseStableOrderFastPath = false
        break
      }
      if (row.item !== item || row.index !== index) {
        state.dirtyRows.push({ index, item, row })
      }
    }
  }

  if (canUseStableOrderFastPath) {
    let totalNodeCountDelta = 0
    const reactiveRowsNeedingNodeCountRefresh: KeyedForRowState<(typeof resolved.arr)[number]>[] =
      []
    withBatchedSignalWrites(container, () => {
      for (const { index, item, row } of state.dirtyRows) {
        if (resolved.reactiveRows && (row.itemSignal || row.indexSignal)) {
          if (row.itemSignal && row.item !== item) {
            row.itemSignal.value = item
          }
          if (row.indexSignal && row.index !== index) {
            row.indexSignal.value = index
          }
          reactiveRowsNeedingNodeCountRefresh.push(row)
        } else {
          const nextBodyNodes = renderForCallbackNodesForOwner(
            container,
            row.owner,
            resolved.fn,
            item,
            index,
          )
          if (!tryPatchNodeRangeInPlace(row.start, row.end, nextBodyNodes)) {
            replaceNodeRange(row.start, row.end, nextBodyNodes)
            row.start = nextBodyNodes[0]!
            row.end = nextBodyNodes[nextBodyNodes.length - 1]!
          }
          const nextNodeCount = nextBodyNodes.length
          totalNodeCountDelta += nextNodeCount - row.nodeCount
          row.nodeCount = nextNodeCount
        }

        row.item = item
        row.index = index
      }
    })
    for (const row of reactiveRowsNeedingNodeCountRefresh) {
      if (row.stableNodeCount && hasStableClientInsertOwnerNodeCount(container, row.owner)) {
        continue
      }
      const nextNodeCount = countNodesBetween(row.start, row.end)
      totalNodeCountDelta += nextNodeCount - row.nodeCount
      row.nodeCount = nextNodeCount
      row.stableNodeCount = false
    }
    state.totalNodeCount += totalNodeCountDelta
  }

  if (canUseStableOrderFastPath) {
    const { end, start } = getKeyedForOwnerRange(state)
    return {
      firstNode: start,
      needsRefRestore: false,
      nodeCount: state.totalNodeCount || countNodesBetween(start, end),
    }
  }

  const nextRows = new Map<
    string | number | symbol,
    KeyedForRowState<(typeof resolved.arr)[number]>
  >()
  const nextOrder: Array<string | number | symbol> = []
  const nextOrderedRows: KeyedForRowState<(typeof resolved.arr)[number]>[] = []
  let needsRefRestore = false
  const reactiveRowsNeedingNodeCountRefresh: KeyedForRowState<(typeof resolved.arr)[number]>[] = []

  let insertionReference = marker ?? null

  withBatchedSignalWrites(container, () => {
    for (let index = resolved.arr.length - 1; index >= 0; index -= 1) {
      const item = resolved.arr[index]!
      const key = resolveForItemKey(resolved, item, index)
      let row = state.rows.get(key)

      if (!row) {
        const rowOwner = createKeyedForRowOwner(owner.componentId, state.nextRowOwnerIndex++)
        const callbackItem = usesReactiveItem
          ? createTransientInternalDetachedRuntimeSignal(container, item)
          : item
        const callbackIndex = usesReactiveIndex
          ? createTransientInternalDetachedRuntimeSignal(container, index)
          : index
        const bodyNodes = renderRowNodes(rowOwner, callbackItem, callbackIndex)
        insertNodesBeforeMarker(bodyNodes, parent, insertionReference ?? undefined)
        needsRefRestore ||=
          container.hasRuntimeRefMarkers && nodesContainSignalRefMarkers(bodyNodes)
        row = {
          end: bodyNodes[bodyNodes.length - 1]!,
          index,
          indexSignal: usesReactiveIndex ? (callbackIndex as { value: number }) : undefined,
          indexSignalId: undefined,
          item,
          itemSignal: usesReactiveItem
            ? (callbackItem as { value: (typeof resolved.arr)[number] })
            : undefined,
          itemSignalId: undefined,
          key,
          nodeCount: bodyNodes.length,
          owner: rowOwner,
          stableNodeCount: hasStableClientInsertOwnerNodeCount(container, rowOwner),
          start: bodyNodes[0]!,
        }
      } else {
        const shouldRerender = row.item !== item || row.index !== index
        if (shouldRerender) {
          if (resolved.reactiveRows && (row.itemSignal || row.indexSignal)) {
            if (row.itemSignal && row.item !== item) {
              row.itemSignal.value = item
            }
            if (row.indexSignal && row.index !== index) {
              row.indexSignal.value = index
            }
            reactiveRowsNeedingNodeCountRefresh.push(row)
          } else {
            const nextBodyNodes = renderForCallbackNodesForOwner(
              container,
              row.owner,
              resolved.fn,
              item,
              index,
            )
            if (!tryPatchNodeRangeInPlace(row.start, row.end, nextBodyNodes)) {
              replaceNodeRange(row.start, row.end, nextBodyNodes)
              row.start = nextBodyNodes[0]!
              row.end = nextBodyNodes[nextBodyNodes.length - 1]!
            }
            row.nodeCount = nextBodyNodes.length
            row.stableNodeCount = hasStableClientInsertOwnerNodeCount(container, row.owner)
            needsRefRestore ||=
              container.hasRuntimeRefMarkers && nodesContainSignalRefMarkers(nextBodyNodes)
          }
        }

        if (row.start.parentNode !== parent || row.end.nextSibling !== insertionReference) {
          moveBoundaryRangeBeforeMarker(row.start, row.end, parent, insertionReference ?? undefined)
        }
        row.item = item
        row.index = index
      }

      nextRows.set(key, row)
      nextOrder[index] = key
      nextOrderedRows[index] = row
      insertionReference = row.start
    }
  })

  for (const row of reactiveRowsNeedingNodeCountRefresh) {
    if (row.stableNodeCount && hasStableClientInsertOwnerNodeCount(container, row.owner)) {
      continue
    }
    row.nodeCount = countNodesBetween(row.start, row.end)
    row.stableNodeCount = false
  }

  for (const [key, row] of state.rows.entries()) {
    if (nextRows.has(key)) {
      continue
    }
    removeNodesFromParent(collectBoundaryRangeNodes(row.start, row.end), parent)
    disposeKeyedForRowSignals(container, row as KeyedForRowState<unknown>)
    disposeClientInsertOwner(container, row.owner)
  }

  state.rows = nextRows
  state.order = nextOrder
  state.orderedRows = nextOrderedRows
  state.totalNodeCount = [...nextRows.values()].reduce((total, row) => total + row.nodeCount, 0)
  keyedForOwnerStates.set(ownerComponent, state)

  const { start } = getKeyedForOwnerRange(state)

  return {
    firstNode: start,
    needsRefRestore,
    nodeCount: state.totalNodeCount,
  }
}

export const renderClientInsertableForOwner = (
  value: Insertable,
  container: RuntimeContainer,
  owner: ClientInsertOwner | null,
) => {
  if (!owner) {
    return renderClientInsertable(value, container)
  }

  const { component, isFresh: isFreshOwner } = getOrCreateClientInsertOwnerComponent(
    container,
    owner,
  )
  const componentWasRegistered = component.registered === true

  const parentFrame = getCurrentFrame()
  let oldDescendants: string[] | null = null
  if (!isFreshOwner && componentWasRegistered) {
    clearComponentSubscriptions(container, owner.componentId)
    oldDescendants = !component.childComponentIds?.size
      ? null
      : collectDescendantIds(container, owner.componentId)
  }
  const frame = createFrame(container, component, 'client', {
    reuseRenderEffects: !isFreshOwner,
    reuseExistingDom: false,
    reuseProjectionSlotDom: false,
  })
  frame.childCursor = owner.childIndex
  frame.keyedRangeCursor = owner.keyedRangeCursor
  if (owner.projectionCounters.length > 0) {
    frame.projectionState.counters = new Map(owner.projectionCounters)
  }
  const nodes = pushContainer(container, () =>
    pushFrame(frame, () => renderClientInsertable(value, container)),
  )
  commitFrameRenderEffects(frame)
  const componentIsRegistered = component.registered === true
  const visitedDescendants = getFrameVisitedDescendants(frame)
  if (isFreshOwner) {
    if (componentIsRegistered && parentFrame && parentFrame !== frame) {
      const parentVisitedDescendants = ensureFrameVisitedDescendants(parentFrame)
      parentVisitedDescendants.add(owner.componentId)
      for (const descendantId of visitedDescendants) {
        parentVisitedDescendants.add(descendantId)
      }
    }
    return nodes
  }
  if (!componentIsRegistered) {
    return nodes
  }
  if (!oldDescendants && visitedDescendants.size === 0) {
    if (parentFrame && parentFrame !== frame) {
      ensureFrameVisitedDescendants(parentFrame).add(owner.componentId)
    }
    return nodes
  }
  const keptDescendants = expandComponentIdsToDescendants(container, [
    ...visitedDescendants,
    ...collectComponentBoundaryIds(nodes),
  ])
  pruneRemovedComponents(container, owner.componentId, keptDescendants)
  if (oldDescendants) {
    for (const descendantId of oldDescendants) {
      if (keptDescendants.has(descendantId)) {
        continue
      }
      clearComponentSubscriptions(container, descendantId)
    }
  }
  if (parentFrame && parentFrame !== frame) {
    const parentVisitedDescendants = ensureFrameVisitedDescendants(parentFrame)
    parentVisitedDescendants.add(owner.componentId)
    for (const descendantId of keptDescendants) {
      parentVisitedDescendants.add(descendantId)
    }
  }
  return nodes
}

const renderForCallbackNodesForOwner = <TItem, TIndex>(
  container: RuntimeContainer,
  owner: ClientInsertOwner | null,
  callback: (item: TItem, index: TIndex) => unknown,
  item: TItem,
  index: TIndex,
) => {
  if (!owner) {
    return renderClientInsertable(
      stripForChildRootKey(callback(item, index) as JSX.Element),
      container,
    )
  }

  const { component, isFresh: isFreshOwner } = getOrCreateClientInsertOwnerComponent(
    container,
    owner,
  )
  const componentWasRegistered = component.registered === true

  const parentFrame = getCurrentFrame()
  let oldDescendants: string[] | null = null
  if (!isFreshOwner && componentWasRegistered) {
    clearComponentSubscriptions(container, owner.componentId)
    oldDescendants = !component.childComponentIds?.size
      ? null
      : collectDescendantIds(container, owner.componentId)
  }
  const frame = createFrame(container, component, 'client', {
    reuseRenderEffects: !isFreshOwner,
    reuseExistingDom: false,
    reuseProjectionSlotDom: false,
  })
  frame.childCursor = owner.childIndex
  frame.keyedRangeCursor = owner.keyedRangeCursor
  if (owner.projectionCounters.length > 0) {
    frame.projectionState.counters = new Map(owner.projectionCounters)
  }
  const nodes = pushContainer(container, () =>
    pushFrame(frame, () =>
      renderClientInsertable(stripForChildRootKey(callback(item, index) as JSX.Element), container),
    ),
  )
  commitFrameRenderEffects(frame)
  const componentIsRegistered = component.registered === true
  const visitedDescendants = getFrameVisitedDescendants(frame)
  if (isFreshOwner) {
    if (componentIsRegistered && parentFrame && parentFrame !== frame) {
      const parentVisitedDescendants = ensureFrameVisitedDescendants(parentFrame)
      parentVisitedDescendants.add(owner.componentId)
      for (const descendantId of visitedDescendants) {
        parentVisitedDescendants.add(descendantId)
      }
    }
    return nodes
  }
  if (!componentIsRegistered) {
    return nodes
  }
  if (!oldDescendants && visitedDescendants.size === 0) {
    if (parentFrame && parentFrame !== frame) {
      ensureFrameVisitedDescendants(parentFrame).add(owner.componentId)
    }
    return nodes
  }
  const keptDescendants = expandComponentIdsToDescendants(container, [
    ...visitedDescendants,
    ...collectComponentBoundaryIds(nodes),
  ])
  pruneRemovedComponents(container, owner.componentId, keptDescendants)
  if (oldDescendants) {
    for (const descendantId of oldDescendants) {
      if (keptDescendants.has(descendantId)) {
        continue
      }
      clearComponentSubscriptions(container, descendantId)
    }
  }
  if (parentFrame && parentFrame !== frame) {
    const parentVisitedDescendants = ensureFrameVisitedDescendants(parentFrame)
    parentVisitedDescendants.add(owner.componentId)
    for (const descendantId of keptDescendants) {
      parentVisitedDescendants.add(descendantId)
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
    return withActiveKeyedRangeScope(allocateKeyedRangeScope(), () =>
      value.flatMap((entry) => renderClientInsertable(entry, container)),
    )
  }

  let resolved = value
  while (typeof resolved === 'function') {
    resolved = resolved()
  }

  if (resolved === null || resolved === undefined || resolved === false) {
    return [doc.createComment('eclipsa-empty')]
  }
  if (typeof Node !== 'undefined' && resolved instanceof Node) {
    if (!hasRememberedManagedAttributesForSubtree(resolved)) {
      rememberManagedAttributesForSubtree(resolved)
    }
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
  container.rootChildComponentIds ??= new Set()
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
    const singleEffect = record.effect
    if (singleEffect) {
      clearEffectSignals(singleEffect)
    }
    const singleFixedEffect = record.fixedEffect
    if (singleFixedEffect) {
      removeFixedSignalEffect(singleFixedEffect.signal, singleFixedEffect)
    }
    const secondFixedEffect = record.secondFixedEffect
    if (secondFixedEffect) {
      removeFixedSignalEffect(secondFixedEffect.signal, secondFixedEffect)
    }
    if (record.effects) {
      for (const effect of Array.from(record.effects)) {
        clearEffectSignals(effect)
      }
      record.effects = null
    }
    if (record.fixedEffects) {
      for (const effect of record.fixedEffects) {
        removeFixedSignalEffect(effect.signal, effect)
      }
      record.fixedEffects = null
    }
    record.effect = null
    record.fixedEffect = null
    record.secondFixedEffect = null
    clearSignalSubscribers(container, record)
    if (!isRouterSignalId(id) && !isAtomSignalId(id)) {
      container.signals.delete(id)
    }
  }

  container.rootChildComponentIds.clear()
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
  return `${createComponentBoundaryHtmlComment(componentId, 'start')}${body}${createComponentBoundaryHtmlComment(componentId, 'end')}`
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
  const parentVisitedDescendants = ensureFrameVisitedDescendants(parentFrame)
  parentVisitedDescendants.add(componentId)
  for (const descendantId of getFrameVisitedDescendants(frame)) {
    parentVisitedDescendants.add(descendantId)
  }
  scheduleMountCallbacks(container, component, getFrameMountCallbacks(frame))
  scheduleVisibleCallbacksCheck(container)

  if (!container.doc) {
    return bodyNodes
  }
  const { end, start } = createComponentBoundaryPair(container.doc, componentId)
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

  const moduleUrl = getRouteModuleUrl(matched.entry, variant)
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
  const manifest = ensureRouterState(container).manifest
  const matched =
    kind === 'notFound'
      ? resolveNotFoundRouteMatch(manifest, pathname)
      : findSpecialManifestEntry(manifest, pathname, kind)
  if (!matched) {
    return null
  }
  return loadResolvedRoute(container, matched, kind === 'error' ? 'error' : 'not-found')
}

const loadRouteComponent = async (container: RuntimeContainer, pathname: string) => {
  const matched = resolvePageRouteMatch(ensureRouterState(container).manifest, pathname)
  if (!matched) {
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
    visitedDescendants: frame.visitedDescendants ?? new Set<string>(),
  }
}

const renderRouteSubtreeForProjectionSlotOwner = (
  container: RuntimeContainer,
  ownerId: string,
  source: unknown,
) => {
  const existingOwner = container.components.get(ownerId)
  const nodes = renderClientInsertableForOwner(source as Insertable, container, {
    childIndex: 0,
    componentId: ownerId,
    keyedRangeCursor: 0,
    parentComponentId: existingOwner?.parentId ?? ROOT_COMPONENT_ID,
    projectionCounters: EMPTY_CLIENT_INSERT_PROJECTION_COUNTERS,
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
  const slotRange = slotRanges.get(createProjectionSlotRangeKey(boundaryId, 'children', 0))
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

const scrollToUrlFragment = (doc: Document, url: URL) => {
  if (!url.hash) {
    return
  }

  const fragment = url.hash.slice(1)
  if (!fragment) {
    doc.defaultView?.scrollTo(0, 0)
    return
  }

  let decodedFragment = fragment
  try {
    decodedFragment = decodeURIComponent(fragment)
  } catch {
    // Keep the raw fragment when it is not valid percent-encoding.
  }

  const namedAnchor = Array.from(doc.querySelectorAll('a[name]')).find(
    (anchor) => anchor.getAttribute('name') === decodedFragment,
  )
  const fragmentTarget = doc.getElementById(decodedFragment) ?? namedAnchor
  fragmentTarget?.scrollIntoView()
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
    return ROUTE_DOCUMENT_FALLBACK
  }

  let payload: ResumePayload
  try {
    payload = JSON.parse(payloadText) as ResumePayload
  } catch {
    return ROUTE_DOCUMENT_FALLBACK
  }

  const finalPathname = normalizeRoutePath(finalUrl.pathname)
  const router = ensureRouterState(container)
  const resolvedMatch = resolveRoutableMatch(router.manifest, finalPathname)
  if (!resolvedMatch) {
    return ROUTE_DOCUMENT_FALLBACK
  }

  return {
    finalHref: finalUrl.href,
    finalPathname,
    kind: resolvedMatch.kind,
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
        return ROUTE_DOCUMENT_FALLBACK
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

  return ROUTE_DOCUMENT_FALLBACK
}

const resetRouteLoaderState = (container: RuntimeContainer) => {
  container.loaders.clear()
  container.loaderStates.clear()

  for (const [id, record] of Array.from(container.signals.entries())) {
    if (!isLoaderSignalId(id)) {
      continue
    }
    const singleEffect = record.effect
    if (singleEffect) {
      clearEffectSignals(singleEffect)
    }
    const singleFixedEffect = record.fixedEffect
    if (singleFixedEffect) {
      removeFixedSignalEffect(singleFixedEffect.signal, singleFixedEffect)
    }
    const secondFixedEffect = record.secondFixedEffect
    if (secondFixedEffect) {
      removeFixedSignalEffect(secondFixedEffect.signal, secondFixedEffect)
    }
    if (record.effects) {
      for (const effect of Array.from(record.effects)) {
        clearEffectSignals(effect)
      }
      record.effects = null
    }
    if (record.fixedEffects) {
      for (const effect of record.fixedEffects) {
        removeFixedSignalEffect(effect.signal, effect)
      }
      record.fixedEffects = null
    }
    record.effect = null
    record.fixedEffect = null
    record.secondFixedEffect = null
    clearSignalSubscribers(container, record)
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
      return ROUTE_DOCUMENT_FALLBACK
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
    return ROUTE_DOCUMENT_FALLBACK
  }
}

const prefetchResolvedRouteModules = async (
  container: RuntimeContainer,
  pathname: string,
  finalUrl: URL,
) => {
  const router = ensureRouterState(container)
  const resolvedMatch = resolveRoutableMatch(router.manifest, pathname)
  if (resolvedMatch) {
    await loadResolvedRoute(container, resolvedMatch.matched, resolvedMatch.kind)
  }
  if (finalUrl.pathname !== pathname) {
    const redirectedPath = normalizeRoutePath(finalUrl.pathname)
    const redirectedMatch = resolveRoutableMatch(router.manifest, redirectedPath)
    if (redirectedMatch) {
      await loadResolvedRoute(container, redirectedMatch.matched, redirectedMatch.kind)
    }
  }
}

const renderCurrentRoute = (container: RuntimeContainer, route: LoadedRoute) => {
  renderRouteIntoRoot(container, route.render)
  ensureRouterState(container).currentRoute = route
}

const applyCurrentRouteMetadata = (container: RuntimeContainer, route: LoadedRoute, url: URL) => {
  const doc = container.doc
  if (!doc) {
    return
  }
  const router = ensureRouterState(container)
  applyRouteMetadata(doc, route, url, router.defaultTitle)
}

const commitRouteNavigation = (
  container: RuntimeContainer,
  route: LoadedRoute,
  url: URL,
  mode: NavigationMode,
  options?: {
    writeLocation?: boolean
  },
) => {
  const doc = container.doc
  if (!doc) {
    return
  }
  const router = ensureRouterState(container)
  applyCurrentRouteMetadata(container, route, url)
  commitBrowserNavigation(doc, url, mode)
  if (options?.writeLocation !== false) {
    writeRouterLocation(router, url)
  }
  scrollToUrlFragment(doc, url)
}

const renderAndCommitRouteNavigation = (
  container: RuntimeContainer,
  route: LoadedRoute,
  url: URL,
  mode: NavigationMode,
  options?: {
    resetLoaders?: boolean
  },
) => {
  if (options?.resetLoaders) {
    resetRouteLoaderState(container)
  }
  renderCurrentRoute(container, route)
  commitRouteNavigation(container, route, url, mode)
}

const handleFailedRouteRequest = async (
  container: RuntimeContainer,
  doc: Document,
  url: URL,
  mode: NavigationMode,
  redirectDepth: number,
  result: Extract<RoutePrefetchResult | RoutePreflightResult, { ok: false }>,
) => {
  if (!('location' in result)) {
    fallbackDocumentNavigation(doc, url, mode)
    return
  }

  const redirectUrl = new URL(result.location, doc.location.href)
  if (redirectDepth >= 8 || redirectUrl.origin !== doc.location.origin) {
    fallbackDocumentNavigation(doc, redirectUrl, mode)
    return
  }

  await navigateContainer(container, redirectUrl.href, {
    mode,
    redirectDepth: redirectDepth + 1,
  })
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
  const routeTarget = resolveRoutableMatch(router.manifest, pathname)
  if (!routeTarget) {
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
        return ROUTE_DOCUMENT_FALLBACK satisfies RoutePrefetchResult
      }

      await prefetchResolvedRouteModules(container, result.finalPathname, finalUrl)
      cachePrefetchedLoaders(container, finalUrl, result.loaders)
      return result
    } catch {
      return ROUTE_DOCUMENT_FALLBACK satisfies RoutePrefetchResult
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
  const routeTarget = resolveRoutableMatch(router.manifest, pathname)

  const currentRouteUrl = new URL(router.currentUrl.value, doc.location.href)
  const currentHref = `${currentRouteUrl.pathname}${currentRouteUrl.search}${currentRouteUrl.hash}`
  const nextHref = `${url.pathname}${url.search}${url.hash}`
  if (!force && nextHref === currentHref) {
    return
  }

  const prefetchKey = routePrefetchKey(url)
  let pendingPrefetch = router.routePrefetches.get(prefetchKey)
  if (!pendingPrefetch && routeTarget) {
    await prefetchRoute(container, url.href)
    pendingPrefetch = router.routePrefetches.get(prefetchKey)
  }
  const prefetched = pendingPrefetch ? await pendingPrefetch : null
  if (prefetched && !prefetched.ok) {
    await handleFailedRouteRequest(container, doc, url, mode, redirectDepth, prefetched)
    return
  }

  const shouldPreflight = !!routeTarget?.matched.entry.hasMiddleware
  if (shouldPreflight && !prefetched) {
    const preflight = await requestRoutePreflight(url.href)
    if (!preflight.ok) {
      await handleFailedRouteRequest(container, doc, url, mode, redirectDepth, preflight)
      return
    }
  }

  if (!matched || !matched.entry.page) {
    const notFoundRoute = !matched
      ? await loadResolvedRouteFromSpecial(container, pathname, 'notFound')
      : null
    if (notFoundRoute) {
      renderAndCommitRouteNavigation(container, notFoundRoute, url, mode, {
        resetLoaders: true,
      })
      return
    }
    fallbackDocumentNavigation(doc, url, mode)
    return
  }

  if (!force && pathname === router.currentPath.value) {
    if (nextHref !== currentHref) {
      commitBrowserNavigation(doc, url, mode)
      writeRouterLocation(router, url)
      scrollToUrlFragment(doc, url)
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
          renderCurrentRoute(container, loadingRoute)
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
      renderCurrentRoute(container, nextRoute)
    }

    commitRouteNavigation(container, nextRoute, url, mode, {
      writeLocation: false,
    })
  } catch (error) {
    if (sequence === router.sequence) {
      const fallbackRoute = isRouteNotFoundError(error)
        ? await loadResolvedRouteFromSpecial(container, pathname, 'notFound')
        : await loadResolvedRoute(container, matched, 'error')
      if (fallbackRoute) {
        renderAndCommitRouteNavigation(container, fallbackRoute, url, mode)
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

    renderCurrentRoute(container, nextRoute)
    applyCurrentRouteMetadata(container, nextRoute, new URL(doc.location.href))
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
      ...getFrameVisitedDescendants(frame),
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
  const scope = materializeScope(container, ensureComponentScopeId(container, component))
  await preloadResumableValue(container, scope)
  const module = await loadSymbol(container, activateSymbol)
  const rawProps =
    component.rawProps && typeof component.rawProps === 'object' ? component.rawProps : null
  if (rawProps) {
    component.props = evaluateProps(rawProps)
  }
  const externalMeta = getExternalComponentMeta(module.default)
  if (externalMeta && component.props && typeof component.props === 'object') {
    component.external = {
      kind: externalMeta.kind,
      slots: [...externalMeta.slots],
    }
    const focusSnapshot = captureBoundaryFocus(container.doc!, component.start, component.end)
    let host = getExternalRoot(component)
    if (!host) {
      replaceBoundaryContents(component.start, component.end, [
        createExternalRootNode(container, component.id, externalMeta.kind),
      ])
      host = getExternalRoot(component)
    }
    if (!host) {
      throw new Error(`Missing external root host for component ${component.id}.`)
    }
    host.setAttribute('data-e-external-snapshot', component.id)
    ;(
      globalThis as typeof globalThis & {
        __eclipsaExternalSlotSnapshotMap?: Map<
          HTMLElement,
          {
            dom: Map<string, Node[]> | null | undefined
            html: Map<string, string> | null | undefined
          }
        >
      }
    ).__eclipsaExternalSlotSnapshotMap ??= new Map()
    ;(
      globalThis as typeof globalThis & {
        __eclipsaExternalSlotSnapshotMap?: Map<
          HTMLElement,
          {
            dom: Map<string, Node[]> | null | undefined
            html: Map<string, string> | null | undefined
          }
        >
      }
    ).__eclipsaExternalSlotSnapshotMap!.set(host, {
      dom: component.externalSlotDom,
      html: component.externalSlotHtml,
    })
    restoreExternalSlotDom(component, host)
    await withClientContainer(container, async () => {
      await syncExternalComponentInstance(
        component,
        externalMeta,
        component.props as Record<string, unknown>,
        host!,
      )
    })
    rebindExternalHost(container, host)
    scheduleExternalHostRebind(container, host)
    restoreBoundaryFocus(container.doc!, component.start, component.end, focusSnapshot)
    component.active = true
    scheduleVisibleCallbacksCheck(container)
    return false
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
    ...getFrameVisitedDescendants(frame),
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
  scheduleMountCallbacks(container, component, getFrameMountCallbacks(frame))
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

const rewriteSerializedSymbolReferenceToken = (
  value: SerializedValue,
  affectedIds: ReadonlySet<string>,
  nextSymbolId: string,
) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      rewriteSerializedSymbolReferenceToken(entry, affectedIds, nextSymbolId)
    }
    return
  }

  if (!value || typeof value !== 'object' || !('__eclipsa_type' in value)) {
    return
  }

  switch (value.__eclipsa_type) {
    case 'object':
      for (const [, entry] of value.entries) {
        rewriteSerializedSymbolReferenceToken(entry, affectedIds, nextSymbolId)
      }
      return
    case 'map':
      for (const [key, entry] of value.entries) {
        rewriteSerializedSymbolReferenceToken(key, affectedIds, nextSymbolId)
        rewriteSerializedSymbolReferenceToken(entry, affectedIds, nextSymbolId)
      }
      return
    case 'set':
      for (const entry of value.entries) {
        rewriteSerializedSymbolReferenceToken(entry, affectedIds, nextSymbolId)
      }
      return
    case 'ref':
      if (value.kind === 'symbol' && affectedIds.has(value.token)) {
        value.token = nextSymbolId
      }
      if (value.data !== undefined) {
        rewriteSerializedSymbolReferenceToken(value.data, affectedIds, nextSymbolId)
      }
      return
    default:
      return
  }
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

    for (const slots of container.scopes.values()) {
      for (const slot of slots) {
        rewriteSerializedSymbolReferenceToken(slot, affectedIds, nextSymbolId)
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
    childComponentIds: new Set(),
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
    subscribedSignalIds: new Set(),
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
    externalRenderCache?: RuntimeContainer['externalRenderCache']
  },
): Promise<{
  container: RuntimeContainer
  result: T
}> => {
  const container = createContainer(
    symbols,
    undefined,
    options?.asyncSignalSnapshotCache,
    options?.externalRenderCache,
  )
  const rootComponent: ComponentState = {
    active: false,
    childComponentIds: new Set(),
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
    subscribedSignalIds: new Set(),
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

export const createDetachedRuntimeContainer = () => createContainer({})

export const createDetachedRuntimeComponent = (
  container: RuntimeContainer,
  id = `d${container.nextComponentId++}`,
): ComponentState => getOrCreateComponentState(container, id, id, ROOT_COMPONENT_ID)

export const runDetachedRuntimeComponent = <T>(
  container: RuntimeContainer,
  component: ComponentState,
  render: () => T,
): T => {
  clearComponentSubscriptions(container, component.id)
  const frame = createFrame(container, component, 'ssr')
  return pushContainer(container, () => pushFrame(frame, render))
}

export const disposeDetachedRuntimeComponent = (
  container: RuntimeContainer,
  component: ComponentState,
) => {
  clearComponentSubscriptions(container, component.id)
  disposeComponentMountCleanups(component)
  pruneComponentVisibles(container, component, 0)
  pruneComponentWatches(container, component, 0)
  for (const signalId of component.signalIds) {
    container.signals.delete(signalId)
    container.asyncSignalStates.delete(signalId)
    container.asyncSignalSnapshotCache.delete(signalId)
  }
  if (component.scopeId) {
    container.scopes.delete(component.scopeId)
  }
  container.dirty.delete(component.id)
  component.childComponentIds?.clear()
  detachComponentFromParent(container, component.id, component.parentId)
  container.components.delete(component.id)
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
      if ([...(record.subscribers ?? [])].some((componentId) => keepComponents.has(componentId))) {
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
          ...(component.external
            ? {
                external: {
                  kind: component.external.kind,
                  slots: [...component.external.slots],
                },
              }
            : {}),
          ...(component.optimizedRoot ? { optimizedRoot: true } : {}),
          props: serializeRuntimeValue(container, component.props),
          ...(component.projectionSlots
            ? { projectionSlots: { ...component.projectionSlots } }
            : {}),
          scope: ensureComponentScopeId(container, component),
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
          [...(record.subscribers ?? [])].filter(
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
            signals: listEffectSignalIds(watch.effect),
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
      childComponentIds: new Set(),
      didMount: false,
      external: componentPayload.external
        ? {
            kind: componentPayload.external.kind,
            slots: [...componentPayload.external.slots],
          }
        : undefined,
      externalInstance: undefined,
      externalMeta: null,
      id,
      mountCleanupSlots: null,
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
      subscribedSignalIds: null,
      suspensePromise: null,
      visibleCount: componentPayload.visibleCount ?? 0,
      watchCount: componentPayload.watchCount,
    })
  }

  rebuildComponentTopology(container)

  for (const [signalId, subscribers] of Object.entries(payload.subscriptions)) {
    const record = container.signals.get(signalId)
    if (!record) {
      continue
    }
    clearSignalSubscribers(container, record)
    record.subscribers = new Set(subscribers)
    for (const componentId of subscribers) {
      const component = container.components.get(componentId)
      if (component) {
        ;(component.subscribedSignalIds ??= new Set()).add(signalId)
      }
    }
  }
  container.nextSignalId = findNextNumericId(container.signals.keys(), 's')
  container.nextAtomId = findNextNumericId(container.signals.keys(), 'a')

  for (const [id, watchPayload] of Object.entries(payload.watches)) {
    const watch = getOrCreateWatchState(container, id, watchPayload.componentId)
    watch.mode = watchPayload.mode
    watch.scopeId = watchPayload.scope
    watch.symbol = watchPayload.symbol
    watch.resumed = true
    watch.track = null
    watch.run = null
    clearEffectSignals(watch.effect)
    for (const signalId of watchPayload.signals) {
      const record = container.signals.get(signalId)
      if (!record) {
        continue
      }
      addEffectSignal(watch.effect, record)
      addSignalEffect(record, watch.effect)
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
  container.hasRuntimeRefMarkers = true
  ensureRouterState(container, options?.routeManifest)

  mergeResumePayload(container, payload)
  rememberManagedAttributesForSubtree(root as HTMLElement)
  bindComponentBoundaries(container, root as HTMLElement)
  for (const component of container.components.values()) {
    component.externalSlotHtml = captureExternalSlotHtml(component)
    component.externalSlotDom = captureExternalSlotDom(component)
  }
  ;(
    globalThis as typeof globalThis & {
      __eclipsaExternalSlotSnapshotStore?: Record<
        string,
        {
          dom: Map<string, Node[]> | null | undefined
          html: Map<string, string> | null | undefined
        }
      >
    }
  ).__eclipsaExternalSlotSnapshotStore = Object.fromEntries(
    [...container.components.values()]
      .filter(
        (component) =>
          !!component.external && (component.externalSlotDom || component.externalSlotHtml),
      )
      .map((component) => [
        component.id,
        {
          dom: component.externalSlotDom,
          html: component.externalSlotHtml,
        },
      ]),
  )
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
  !component.external &&
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

export const restoreResumedExternalComponents = async (container: RuntimeContainer) => {
  const externalComponents = sortDirtyComponents(
    [...container.components.values()]
      .filter(
        (component) =>
          !!component.external &&
          !!component.start &&
          !!component.end &&
          !component.active &&
          !component.didMount &&
          container.symbols.has(component.symbol),
      )
      .map((component) => component.id),
  )

  for (const componentId of externalComponents) {
    await activateComponent(container, componentId)
  }
}

export const restoreRegisteredRpcHandles = (container: RuntimeContainer) => {
  const hadWindow = 'window' in globalThis && globalThis.window !== undefined
  const injectedWindow =
    !hadWindow && container.doc?.defaultView
      ? (container.doc.defaultView as Window & typeof globalThis)
      : null

  if (injectedWindow) {
    ;(globalThis as { window?: Window & typeof globalThis }).window = injectedWindow
  }

  try {
    withRuntimeContainer(container, () => {
      for (const id of getRegisteredActionHookIds()) {
        getRegisteredActionHook<() => unknown>(id)?.()
      }
      for (const id of getRegisteredLoaderHookIds()) {
        getRegisteredLoaderHook<() => unknown>(id)?.()
      }
    })
  } finally {
    if (injectedWindow) {
      delete (globalThis as { window?: Window & typeof globalThis }).window
    }
  }
}

export const primeRouteModules = async (container: RuntimeContainer) => {
  const router = ensureRouterState(container)
  const currentRoute = await loadRouteComponent(container, router.currentPath.value)
  if (currentRoute) {
    router.currentRoute = currentRoute
    if (container.doc) {
      applyCurrentRouteMetadata(container, currentRoute, new URL(container.doc.location.href))
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

const findInteractiveTarget = (
  container: RuntimeContainer,
  target: EventTarget | null,
  eventName: string,
): Element | null => {
  let element = isElementNode(target)
    ? target
    : target instanceof Node
      ? target.parentElement
      : null
  while (element) {
    if (
      getLiveClientEventBinding(container, element, eventName) ||
      element.hasAttribute(`data-e-on${eventName}`)
    ) {
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
    let sawInteractiveBinding = false
    for (const eventName of eventNames) {
      const liveBinding = getLiveClientEventBinding(container, element, eventName)
      if (liveBinding) {
        sawInteractiveBinding = true
        const symbolId =
          liveBinding.symbol ??
          (liveBinding.handler && typeof liveBinding.handler !== 'function'
            ? liveBinding.handler.symbol
            : null)
        if (symbolId) {
          void loadSymbol(container, symbolId).catch(() => {})
        }
        continue
      }
      if (!element.hasAttribute(`data-e-on${eventName}`)) {
        continue
      }
      sawInteractiveBinding = true
      const binding = element.getAttribute(`data-e-on${eventName}`)
      if (!binding) {
        continue
      }
      const { symbolId } = parseBinding(binding)
      void loadSymbol(container, symbolId).catch(() => {})
    }
    if (sawInteractiveBinding) {
      return
    }
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

const rootContainsRouteLinks = (root: ParentNode) => {
  if (isHTMLAnchorElementNode(root) && root.hasAttribute(ROUTE_LINK_ATTR)) {
    return true
  }
  if (typeof root.querySelector === 'function') {
    return root.querySelector(`a[${ROUTE_LINK_ATTR}]`) instanceof Element
  }
  if (typeof root.querySelectorAll === 'function') {
    return root.querySelectorAll(`a[${ROUTE_LINK_ATTR}]`).length > 0
  }
  return false
}

export const installClientMountListeners = (container: RuntimeContainer, root: ParentNode) => {
  const doc = container.doc
  if (!doc || !rootContainsRouteLinks(root)) {
    return () => {}
  }

  bindRouterLinks(container, root)

  const onPopState = () => {
    void navigateContainer(container, doc.location.href, {
      mode: 'pop',
    })
  }

  doc.defaultView?.addEventListener('popstate', onPopState)

  return () => {
    doc.defaultView?.removeEventListener('popstate', onPopState)
  }
}

const parsedBindingCache = new Map<string, { scopeId: string; symbolId: string }>()

const parseBinding = (value: string): { scopeId: string; symbolId: string } => {
  const cached = parsedBindingCache.get(value)
  if (cached) {
    return cached
  }
  const separatorIndex = value.indexOf(':')
  if (separatorIndex < 0) {
    throw new Error(`Invalid binding ${value}.`)
  }
  const parsed = {
    symbolId: value.slice(0, separatorIndex),
    scopeId: value.slice(separatorIndex + 1),
  }
  parsedBindingCache.set(value, parsed)
  return parsed
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

const dispatchLiveClientEvent = async (
  container: RuntimeContainer,
  binding: LiveClientEventBinding,
  currentTarget: Element,
  event: Event,
) => {
  const delegatedEvent = createDelegatedEvent(event, currentTarget)
  const handler = binding.handler

  if (typeof handler === 'function') {
    await withClientContainer(container, async () => {
      await handler.call(currentTarget, delegatedEvent)
    })
    await flushDirtyComponents(container)
    return
  }

  const symbolId = binding.symbol ?? handler?.symbol
  if (!symbolId) {
    return
  }
  const captures = handler
    ? resolveEventDescriptorCaptures(handler)
    : binding.captureCount === 0
      ? []
      : binding.captureCount === 1
        ? [binding.capture0]
        : binding.captureCount === 2
          ? [binding.capture0, binding.capture1]
          : binding.captureCount === 3
            ? [binding.capture0, binding.capture1, binding.capture2]
            : [binding.capture0, binding.capture1, binding.capture2, binding.capture3]
  const module = await loadSymbol(container, symbolId)
  try {
    await withClientContainer(container, async () => {
      await module.default(captures, delegatedEvent)
    })
  } catch (error) {
    throw wrapGeneratedScopeReferenceError(error, {
      phase: 'running a live client event handler for',
      symbolId,
    })
  }
  await flushDirtyComponents(container)
}

export const dispatchResumeEvent = async (container: RuntimeContainer, event: Event) => {
  const interactiveTarget = findInteractiveTarget(container, event.target, event.type)
  if (!interactiveTarget) {
    return
  }
  const liveBinding = getLiveClientEventBinding(container, interactiveTarget, event.type)
  if (liveBinding) {
    const pendingFocus = capturePendingFocusRestore(container, event.target)
    await dispatchLiveClientEvent(container, liveBinding, interactiveTarget, event)
    restorePendingFocus(container, pendingFocus)
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
    ensureDelegatedDocumentEventListener(container, eventName)
  }
  doc.addEventListener('pointerdown', onIntent, true)
  doc.addEventListener('focusin', onIntent, true)
  doc.defaultView?.addEventListener('popstate', onPopState)

  return () => {
    if (container.delegatedEventListener) {
      if (container.delegatedEventName) {
        doc.removeEventListener(
          container.delegatedEventName,
          container.delegatedEventListener,
          true,
        )
      }
      for (const eventName of container.delegatedEventNames ?? []) {
        doc.removeEventListener(eventName, container.delegatedEventListener, true)
      }
    }
    container.delegatedEventName = null
    container.delegatedEventNames?.clear()
    container.delegatedEventNames = null
    container.delegatedEventListener = null
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

const ensureComponentSignalIds = (component: ComponentState) => {
  if (component.signalIds === EMPTY_COMPONENT_SIGNAL_IDS) {
    component.signalIds = []
  }
  return component.signalIds
}

export const useRuntimeSignal = <T>(fallback: T): { value: T } => {
  const container = getCurrentContainer()
  const frame = getCurrentFrame()

  if (!container || !frame || frame.component.id === ROOT_COMPONENT_ID) {
    throw new Error('useSignal() can only be used while rendering a component.')
  }

  registerComponentState(container, frame.component)
  const signalIndex = frame.signalCursor++
  const existingId = frame.component.signalIds[signalIndex]
  const signalId = existingId ?? `s${container.nextSignalId++}`
  if (!existingId) {
    ensureComponentSignalIds(frame.component).push(signalId)
  }
  return ensureSignalRecord(container, signalId, fallback).handle
}

export const useRuntimeAtom = <T>(atom: object, fallback: T): { value: T } => {
  const container = getCurrentContainer()
  const frame = getCurrentFrame()

  if (!container || !frame || frame.component.id === ROOT_COMPONENT_ID) {
    throw new Error('useAtom() can only be used while rendering a component.')
  }

  registerComponentState(container, frame.component)
  const signalIndex = frame.signalCursor++
  const existingId = frame.component.signalIds[signalIndex]
  const mappedId = container.atoms.get(atom)
  const signalId = existingId ?? mappedId ?? `a${container.nextAtomId++}`
  if (!existingId) {
    ensureComponentSignalIds(frame.component).push(signalId)
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

const createTransientInternalDetachedRuntimeSignal = <T>(
  container: RuntimeContainer,
  fallback: T,
): { value: T } => createTransientInternalSignalRecord(container, fallback).handle

export const getRuntimeComponentId = () => getCurrentFrame()?.component.id ?? null
export const getRuntimeSignalId = (value: unknown) => {
  const signalMeta = getSignalMeta(value)
  return isWritableSignalMeta(signalMeta) ? signalMeta.id : null
}

const createRuntimeReactiveEffect = (
  container: RuntimeContainer | null,
  runInContainer: boolean,
): ReactiveEffect => ({
  collecting: false,
  container,
  fixed: false,
  fixedCallback: null,
  fn: noop,
  nextSignal: null,
  nextSignals: null,
  queued: false,
  runInContainer,
  signal: null,
  signals: null,
})

const createRuntimeFixedSignalEffect = <T>(
  record: SignalRecord<T>,
  fn: (value: T) => void,
  container: RuntimeContainer | null,
  runInContainer: boolean,
): FixedSignalEffect => {
  const effect: FixedSignalEffect = {
    callback: fn as (value: unknown) => void,
    container,
    fixedIndex: -1,
    kind: 'fixed',
    queued: false,
    runInContainer,
    signal: record,
  }
  addFixedSignalEffect(record, effect)
  return effect
}

const reuseRuntimeFixedSignalEffect = <T>(
  effect: FixedSignalEffect,
  record: SignalRecord<T>,
  fn: (value: T) => void,
  container: RuntimeContainer | null,
  runInContainer: boolean,
) => {
  if (effect.signal !== record) {
    removeFixedSignalEffect(effect.signal, effect)
    effect.signal = record
    addFixedSignalEffect(record, effect)
  }
  effect.callback = fn as (value: unknown) => void
  effect.container = container
  effect.queued = false
  effect.runInContainer = runInContainer
  return effect
}

export const createFixedSignalEffect = <T>(
  signal: { value: T },
  fn: (value: T) => void,
  options?: Pick<EffectOptions, 'runInContainer' | 'skipInitialRun'>,
) => {
  const skipInitialRun = options?.skipInitialRun === true
  const record = getRuntimeSignalRecordFromValue<T>(signal)
  if (!record) {
    let initialized = skipInitialRun !== true
    createEffect(() => {
      const value = signal.value
      if (!initialized) {
        initialized = true
        return
      }
      fn(value)
    }, options)
    return false
  }

  const container = getCurrentContainer()
  const frame = getCurrentFrame()
  const runInContainer = options?.runInContainer !== false

  if (
    frame &&
    frame.mode === 'client' &&
    frame.component.id !== ROOT_COMPONENT_ID &&
    frame.reuseRenderEffects
  ) {
    const reusableEffect = frame.existingRenderEffects?.[frame.effectCursor++]
    const effect =
      reusableEffect && isFixedSignalEffect(reusableEffect)
        ? reuseRuntimeFixedSignalEffect(reusableEffect, record, fn, container, runInContainer)
        : createRuntimeFixedSignalEffect(record, fn, container, runInContainer)
    if (reusableEffect && !isFixedSignalEffect(reusableEffect)) {
      clearEffectSignals(reusableEffect)
    }
    if (!skipInitialRun) {
      runEffect(effect)
    }
    storeFrameRenderEffect(frame, effect)

    return true
  }

  const effect = createRuntimeFixedSignalEffect(record, fn, container, runInContainer)
  if (!skipInitialRun) {
    runEffect(effect)
  }

  if (frame && frame.mode === 'client' && frame.component.id !== ROOT_COMPONENT_ID) {
    addCleanupSlotEffect(ensureFrameEffectCleanupSlot(frame), effect)
  }

  return true
}

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
  const container = getCurrentContainer()
  const frame = getCurrentFrame()
  const runInContainer = options?.runInContainer !== false
  if (container && frame && frame.component.id !== ROOT_COMPONENT_ID) {
    registerComponentState(container, frame.component)
  }
  const createEffectRunner = (effect: ReactiveEffect) => () => {
    runReactiveEffectInContainer(effect, () => {
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
    })
  }

  if (
    frame &&
    frame.mode === 'client' &&
    frame.component.id !== ROOT_COMPONENT_ID &&
    frame.reuseRenderEffects
  ) {
    const reusableEffect = frame.existingRenderEffects?.[frame.effectCursor++]
    if (reusableEffect && isFixedSignalEffect(reusableEffect)) {
      removeFixedSignalEffect(reusableEffect.signal, reusableEffect)
    }
    const effect =
      reusableEffect && !isFixedSignalEffect(reusableEffect)
        ? reusableEffect
        : createRuntimeReactiveEffect(container, runInContainer)

    effect.collecting = false
    effect.container = container
    effect.fixed = false
    effect.fixedCallback = null
    effect.fn = createEffectRunner(effect)
    effect.nextSignal = null
    effect.nextSignals = null
    effect.queued = false
    effect.runInContainer = runInContainer
    runEffect(effect)

    if (effectHasTrackedSignals(effect)) {
      storeFrameRenderEffect(frame, effect)
    } else {
      clearEffectSignals(effect)
    }

    return () => {
      clearEffectSignals(effect)
    }
  }

  const effect = createRuntimeReactiveEffect(container, runInContainer)
  effect.fn = createEffectRunner(effect)
  runEffect(effect)

  if (
    frame &&
    frame.mode === 'client' &&
    frame.component.id !== ROOT_COMPONENT_ID &&
    effectHasTrackedSignals(effect)
  ) {
    addCleanupSlotEffect(ensureFrameEffectCleanupSlot(frame), effect)
  }

  return () => {
    clearEffectSignals(effect)
  }
}

export const createOnCleanup = (fn: () => void) => {
  if (!currentCleanupSlot) {
    throw new Error(
      'onCleanup() can only be used while running onMount(), onVisible(), or useWatch() callbacks.',
    )
  }
  addCleanupSlotCallback(currentCleanupSlot, fn)
}

export const createOnMount = (fn: () => void) => {
  const frame = getCurrentFrame()
  if (!frame || frame.component.id === ROOT_COMPONENT_ID || frame.mode !== 'client') {
    return
  }
  registerComponentState(frame.container, frame.component)
  ensureFrameMountCallbacks(frame).push(fn)
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

  registerComponentState(container, frame.component)
  const visibleIndex = frame.visibleCursor++
  const visibleId = createVisibleId(frame.component.id, visibleIndex)
  const visible = getOrCreateVisibleState(container, visibleId, frame.component.id)
  visible.scopeId = lazyMeta
    ? registerScope(container, resolveCaptureValues(lazyMeta.captures))
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
      collecting: false,
      container,
      fixed: false,
      fixedCallback: null,
      fn() {
        runReactiveEffectInContainer(effect, () => {
          createLocalWatchRunner(effect, cleanupSlot, fn, dependencies)()
        })
      },
      nextSignal: null,
      nextSignals: null,
      queued: false,
      signal: null,
      signals: null,
    }
    runEffect(effect)
    return
  }

  registerComponentState(container, frame.component)
  const watchIndex = frame.watchCursor++
  const watchId = createWatchId(frame.component.id, watchIndex)
  const watch = getOrCreateWatchState(container, watchId, frame.component.id)
  watch.mode = dependencies ? 'explicit' : 'dynamic'
  watch.scopeId = registerScope(container, resolveCaptureValues(watchMeta.captures))
  watch.symbol = watchMeta.symbol
  watch.track = dependencies ? () => trackWatchDependencies(dependencies) : null
  watch.run = createLocalWatchRunner(watch.effect, watch.cleanupSlot, fn, dependencies)
  if (frame.mode === 'client' && watch.resumed) {
    watch.resumed = false
    if (dependencies) {
      collectTrackedDependencies(watch.effect, () => {
        trackWatchDependencies(dependencies)
      })
    }
    return
  }
  watch.resumed = false
  runEffect(watch.effect)
}

export const getResumePayloadScriptContent = (payload: ResumePayload) =>
  escapeJSONScriptText(JSON.stringify(payload))
