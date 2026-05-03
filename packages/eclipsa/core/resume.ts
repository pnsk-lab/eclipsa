import { installResumeLoader, needsFullResumeOnStart } from './resume-loader.ts'
import { registerRuntimeSymbols } from './runtime/kernel.ts'
import type { ResumePayload } from './runtime/types.ts'

const RESUME_STATE_ELEMENT_ID = 'eclipsa-resume'
const RESUME_FINAL_STATE_ELEMENT_ID = 'eclipsa-resume-final'
const ROUTE_MANIFEST_ELEMENT_ID = 'eclipsa-route-manifest'
const APP_HOOKS_ELEMENT_ID = 'eclipsa-app-hooks'

interface AppHooksManifest {
  client: string | null
  routeDataEndpoint?: boolean
}

const getResumePayload = (doc: Document): ResumePayload | null => {
  const elem =
    doc.getElementById(RESUME_FINAL_STATE_ELEMENT_ID) ?? doc.getElementById(RESUME_STATE_ELEMENT_ID)
  if (!elem?.textContent) {
    return null
  }

  return JSON.parse(elem.textContent) as ResumePayload
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

const hasRouteManifest = (doc: Document) => {
  const elem = doc.getElementById(ROUTE_MANIFEST_ELEMENT_ID)
  return !!elem?.textContent && elem.textContent !== '[]'
}

const loadFullResume = (source: Document | HTMLElement, event?: Event): Promise<void> =>
  import('./resume-full.ts').then((client) =>
    client.resumeContainer(source, event ? { replayEvent: event } : undefined),
  )

export const resumeContainer = async (source: Document | HTMLElement = document) => {
  const doc = source instanceof Document ? source : source.ownerDocument
  const root = source instanceof Document ? doc.body : source
  const payload = getResumePayload(doc)

  if (!payload) {
    return
  }

  const appHooksManifest = getAppHooksManifest(doc)
  registerRuntimeSymbols(payload.symbols)

  if (
    (import.meta as ImportMeta & { hot?: unknown }).hot ||
    needsFullResumeOnStart(payload, appHooksManifest)
  ) {
    await loadFullResume(source)
    return
  }

  installResumeLoader(root, payload, {
    loadFullResume: (event) => loadFullResume(source, event),
  })
  root.setAttribute('data-e-resume', 'resumed')

  if (hasRouteManifest(doc)) {
    root.setAttribute('data-e-route-resume', 'lazy')
  }
}
