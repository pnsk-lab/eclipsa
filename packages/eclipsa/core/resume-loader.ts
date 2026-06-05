import type { SerializedValue } from './serialize.ts'
import type { ResumePayload } from './runtime/types.ts'
import { registerRuntimeSymbols } from './runtime/kernel.ts'

type RuntimeSymbolModule = {
  default?: (scope: unknown[], event?: Event) => unknown
}

export interface ResumeLoaderOptions {
  loadFullResume?: (event?: Event) => Promise<void> | void
}

const EVENT_NAMES = [
  'cancel',
  'click',
  'input',
  'change',
  'submit',
  'keydown',
  'compositionstart',
  'compositionend',
] as const

const ACTION_FORM_ATTR = 'data-e-action-form'
const BIND_VALUE_ATTR = 'data-e-bind-value'
const BIND_CHECKED_ATTR = 'data-e-bind-checked'
const ROUTE_LINK_ATTR = 'data-e-link'
const ROUTE_REPLACE_ATTR = 'data-e-link-replace'
const PENDING_RESUME_LINK_KEY = '__epl'

const FULL_RESUME_REQUIRED = Symbol()

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

const isElement = (value: unknown): value is Element =>
  !!value && typeof value === 'object' && 'nodeType' in value && (value as Node).nodeType === 1

const eventTargetElement = (target: EventTarget | null): Element | null => {
  if (isElement(target)) {
    return target
  }
  if (typeof Node !== 'undefined' && target instanceof Node) {
    return target.parentElement
  }
  return null
}

const findInteractiveTarget = (
  target: EventTarget | null,
  eventName: string,
): { binding: string; element: Element } | null => {
  let element = eventTargetElement(target)
  const attrName = `data-e-on${eventName}`
  while (element) {
    const binding = element.getAttribute(attrName)
    if (binding) {
      return { binding, element }
    }
    element = element.parentElement
  }
  return null
}

const closestWithAttribute = (target: EventTarget | null, attrName: string): Element | null => {
  let element = eventTargetElement(target)
  while (element) {
    if (element.hasAttribute(attrName)) {
      return element
    }
    element = element.parentElement
  }
  return null
}

const createDelegatedEvent = (event: Event, currentTarget: Element): Event =>
  new Proxy(event, {
    get(target, prop, receiver) {
      if (prop === 'currentTarget') {
        return currentTarget
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

const materializeScope = (payload: ResumePayload, scopeId: string) => {
  const slots = payload.scopes[scopeId]
  if (!slots) {
    throw FULL_RESUME_REQUIRED
  }
  return slots.map((slot) => deserializeLoaderValue(slot as SerializedValue))
}

const deserializeLoaderValue = (value: SerializedValue): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deserializeLoaderValue(entry))
  }
  if (!value || typeof value !== 'object' || typeof value.__eclipsa_type !== 'string') {
    throw FULL_RESUME_REQUIRED
  }
  switch (value.__eclipsa_type) {
    case 'undefined':
      return undefined
    case 'object':
      return Object.fromEntries(
        value.entries.map(([key, entry]) => [key, deserializeLoaderValue(entry)]),
      )
    case 'map':
      return new Map(
        value.entries.map(([key, entry]) => [
          deserializeLoaderValue(key),
          deserializeLoaderValue(entry),
        ]),
      )
    case 'set':
      return new Set(value.entries.map((entry) => deserializeLoaderValue(entry)))
    case 'ref':
      throw FULL_RESUME_REQUIRED
    default:
      throw FULL_RESUME_REQUIRED
  }
}

const loadSymbol = async (
  payload: ResumePayload,
  symbolId: string,
): Promise<RuntimeSymbolModule> => {
  const url = payload.symbols[symbolId]
  if (!url) {
    throw new Error(`Unknown resumable event symbol "${symbolId}".`)
  }
  return import(/* @vite-ignore */ url) as Promise<RuntimeSymbolModule>
}

const shouldPromoteForNativeFeature = (event: Event) => {
  if (
    (event.type === 'input' || event.type === 'change') &&
    (closestWithAttribute(event.target, BIND_VALUE_ATTR) ||
      closestWithAttribute(event.target, BIND_CHECKED_ATTR))
  ) {
    return true
  }
  if (event.type === 'submit' && closestWithAttribute(event.target, ACTION_FORM_ATTR)) {
    return true
  }
  if (event.type === 'click' && closestWithAttribute(event.target, ROUTE_LINK_ATTR)) {
    return true
  }
  return false
}

const capturePendingRouteLinkNavigation = (event: Event) => {
  if (event.type !== 'click') {
    return
  }
  if (typeof MouseEvent !== 'undefined' && event instanceof MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
  }
  const link = closestWithAttribute(event.target, ROUTE_LINK_ATTR) as HTMLAnchorElement | null
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) {
    return
  }
  const href = link.getAttribute('href')
  if (!href) {
    return
  }
  const url = new URL(href, link.ownerDocument.location.href)
  if (url.origin !== link.ownerDocument.location.origin) {
    return
  }
  ;(globalThis as Record<string, unknown>)[PENDING_RESUME_LINK_KEY] = {
    href: url.href,
    replace: link.getAttribute(ROUTE_REPLACE_ATTR) === 'true',
  }
}

const createFullResumePromoter = (
  cleanup: () => void,
  loadFullResume: ResumeLoaderOptions['loadFullResume'],
) => {
  let pending: Promise<void> | null = null
  return (event?: Event) => {
    if (!loadFullResume) {
      throw FULL_RESUME_REQUIRED
    }
    if (event?.cancelable) {
      event.preventDefault()
    }
    event?.stopImmediatePropagation()
    cleanup()
    pending ??= Promise.resolve(loadFullResume(event))
    return pending
  }
}

export const installResumeLoader = (
  root: HTMLElement,
  payload: ResumePayload,
  options: ResumeLoaderOptions = {},
) => {
  registerRuntimeSymbols(payload.symbols)
  const doc = root.ownerDocument
  const cleanups: Array<() => void> = []
  const cleanup = () => {
    while (cleanups.length > 0) {
      cleanups.pop()?.()
    }
  }
  const promoteToFullResume = createFullResumePromoter(cleanup, options.loadFullResume)

  const dispatch = (event: Event) => {
    if (shouldPromoteForNativeFeature(event)) {
      capturePendingRouteLinkNavigation(event)
      void promoteToFullResume(event)
      return
    }

    const target = findInteractiveTarget(event.target, event.type)
    if (!target) {
      return
    }

    const { scopeId, symbolId } = parseBinding(target.binding)
    try {
      const scope = materializeScope(payload, scopeId)
      void loadSymbol(payload, symbolId).then((module) => {
        if (typeof module.default !== 'function') {
          throw new Error(`Resumable event symbol "${symbolId}" does not export a function.`)
        }
        return module.default(
          scope,
          module.default.length >= 2 ? createDelegatedEvent(event, target.element) : undefined,
        )
      })
    } catch (error) {
      if (error === FULL_RESUME_REQUIRED) {
        void promoteToFullResume(event)
        return
      }
      throw error
    }
  }

  const prefetch = (event: Event) => {
    const eventNames = event.type === 'pointerdown' ? ['click', 'submit'] : EVENT_NAMES
    for (const eventName of eventNames) {
      const target = findInteractiveTarget(event.target, eventName)
      if (!target) {
        continue
      }
      const { symbolId } = parseBinding(target.binding)
      void loadSymbol(payload, symbolId).catch(() => {})
      return
    }
  }

  for (const eventName of EVENT_NAMES) {
    doc.addEventListener(eventName, dispatch, true)
    cleanups.push(() => doc.removeEventListener(eventName, dispatch, true))
  }
  doc.addEventListener('pointerdown', prefetch, true)
  doc.addEventListener('focusin', prefetch, true)
  cleanups.push(() => doc.removeEventListener('pointerdown', prefetch, true))
  cleanups.push(() => doc.removeEventListener('focusin', prefetch, true))

  return cleanup
}

export const needsFullResumeOnStart = (
  payload: ResumePayload,
  appHooksManifest: { client?: string | null } | null,
) => {
  if (appHooksManifest?.client) {
    return true
  }
  if (
    Object.keys(payload.visibles ?? {}).length > 0 ||
    Object.keys(payload.watches ?? {}).length > 0
  ) {
    return true
  }
  return Object.values(payload.components ?? {}).some(
    (component) => !!component.external || (component.mountCount ?? 0) > 0,
  )
}
