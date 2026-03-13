import {
  applyResumeHmrUpdateToRegisteredContainers,
  createResumeContainer,
  installResumeListeners,
  primeRouteModules,
  restoreRegisteredRpcHandles,
  registerResumeContainer,
  type ResumePayload,
} from './runtime.ts'
import { RESUME_HMR_EVENT, type ResumeHmrUpdatePayload } from './resume-hmr.ts'
import { ROUTE_MANIFEST_ELEMENT_ID, type RouteManifest } from './router-shared.ts'

const STATE_ELEMENT_ID = 'eclipsa-resume'

interface ViteHotContext {
  on(event: string, listener: (data: ResumeHmrUpdatePayload) => void | Promise<void>): void
}

const getResumePayload = (doc: Document): ResumePayload | null => {
  const elem = doc.getElementById(STATE_ELEMENT_ID)
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
}

initResumeHmr((import.meta as ImportMeta & { hot?: ViteHotContext }).hot)

export const resumeContainer = async (source: Document | HTMLElement = document) => {
  const doc = source instanceof Document ? source : source.ownerDocument
  const root = source instanceof Document ? doc.body : source
  const payload = getResumePayload(doc)

  if (!payload) {
    return
  }

  const container = createResumeContainer(root, payload, {
    routeManifest: getRouteManifest(doc),
  })
  await primeRouteModules(container)
  restoreRegisteredRpcHandles(container)
  registerResumeContainer(container)
  root.setAttribute('data-e-resume', 'resumed')
  installResumeListeners(container)
}
