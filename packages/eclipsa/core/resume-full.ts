import {
  applyResumeHmrUpdateToRegisteredContainers,
  createResumeContainer,
  dispatchDocumentEventReady,
  refreshRegisteredRouteContainers,
  installResumeListeners,
  primeRouteModules,
  restoreRegisteredRpcHandles,
  restoreResumedExternalComponents,
  restoreResumedLocalSignalEffects,
  registerResumeContainer,
  type ResumePayload,
} from './runtime.ts'
import { registerClientHooks, type AppHooksManifest, type AppHooksModule } from './hooks.ts'
import {
  APP_HOOKS_ELEMENT_ID,
  RESUME_FINAL_STATE_ELEMENT_ID,
  RESUME_STATE_ELEMENT_ID,
  ROUTE_MANIFEST_ELEMENT_ID,
} from './resume-ids.ts'
import { RESUME_HMR_EVENT, type ResumeHmrUpdatePayload } from './resume-hmr.ts'
import type { RouteManifest } from './router-shared.ts'
import { registerRuntimeSymbols } from './runtime/kernel.ts'

const CONTENT_HMR_EVENT = 'eclipsa:content-update'

interface ViteHotContext {
  on(event: typeof CONTENT_HMR_EVENT, listener: () => void | Promise<void>): void
  on(event: string, listener: (data: ResumeHmrUpdatePayload) => void | Promise<void>): void
}

const getResumePayload = (doc: Document): ResumePayload | null => {
  const elem =
    doc.getElementById(RESUME_FINAL_STATE_ELEMENT_ID) ?? doc.getElementById(RESUME_STATE_ELEMENT_ID)
  if (!elem?.textContent) {
    return null
  }

  return JSON.parse(elem.textContent) as ResumePayload
}

const getRouteManifest = (doc: Document): RouteManifest => {
  const elem = doc.getElementById(ROUTE_MANIFEST_ELEMENT_ID)
  if (!elem?.textContent) {
    return []
  }

  return JSON.parse(elem.textContent) as RouteManifest
}

const getAppHooksManifest = (doc: Document): AppHooksManifest => {
  const elem = doc.getElementById(APP_HOOKS_ELEMENT_ID)
  if (!elem?.textContent) {
    return {
      client: null,
    }
  }
  return JSON.parse(elem.textContent) as AppHooksManifest
}

const initResumeHmr = (hot: ViteHotContext | undefined) => {
  if (!hot) {
    return
  }

  hot.on(RESUME_HMR_EVENT, async (payload) => {
    const result = await applyResumeHmrUpdateToRegisteredContainers(payload)
    if (result === 'reload') {
      location.reload()
    }
  })
  hot.on(CONTENT_HMR_EVENT, async () => {
    try {
      await refreshRegisteredRouteContainers()
    } catch {
      location.reload()
    }
  })
}

initResumeHmr((import.meta as ImportMeta & { hot?: ViteHotContext }).hot)

export const resumeContainer = async (
  source: Document | HTMLElement = document,
  options?: {
    replayEvent?: Event
  },
) => {
  const doc = source instanceof Document ? source : source.ownerDocument
  const root = source instanceof Document ? doc.body : source
  const payload = getResumePayload(doc)

  if (!payload) {
    return
  }

  const appHooksManifest = getAppHooksManifest(doc)
  registerRuntimeSymbols(payload.symbols)
  const container = createResumeContainer(root, payload, {
    routeDataEndpoint: appHooksManifest.routeDataEndpoint !== false,
    routeManifest: getRouteManifest(doc),
  })
  let resolveResumeReady!: () => void
  container.resumeReadyPromise = new Promise<void>((resolve) => {
    resolveResumeReady = resolve
  })
  installResumeListeners(container)

  try {
    if (appHooksManifest.client) {
      const module = (await import(/* @vite-ignore */ appHooksManifest.client)) as AppHooksModule
      registerClientHooks({
        reroute: module.reroute,
        transport: module.transport,
      })
    } else {
      registerClientHooks({})
    }

    await primeRouteModules(container)
    restoreRegisteredRpcHandles(container)
    await restoreResumedExternalComponents(container)
    await restoreResumedLocalSignalEffects(container)
    registerResumeContainer(container)
    root.setAttribute('data-e-resume', 'resumed')

    if (options?.replayEvent) {
      await dispatchDocumentEventReady(container, options.replayEvent)
    }
  } finally {
    resolveResumeReady()
    container.resumeReadyPromise = null
  }
}
