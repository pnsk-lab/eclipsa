import {
  ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY,
  CONTAINER_STACK_KEY,
  CONTEXT_VALUE_STACK_KEY,
  FRAME_STACK_KEY,
  RESUME_CONTAINERS_KEY,
} from './constants.ts'
import type { RenderFrame, RuntimeContainer, RuntimeContextValue } from './types.ts'

let containerStackCache: RuntimeContainer[] | null = null
let contextValueStackCache: RuntimeContextValue[] | null = null
let frameStackCache: RenderFrame[] | null = null
let resumeContainersCache: Set<RuntimeContainer> | null = null
let asyncSignalSnapshotCache: Map<string, unknown> | null = null

const getGlobalRecord = () => globalThis as Record<PropertyKey, unknown>

export const getContainerStack = (): RuntimeContainer[] => {
  if (containerStackCache) {
    return containerStackCache
  }
  const globalRecord = getGlobalRecord()
  const existing = globalRecord[CONTAINER_STACK_KEY]
  if (Array.isArray(existing)) {
    containerStackCache = existing as RuntimeContainer[]
    return containerStackCache
  }
  const created: RuntimeContainer[] = []
  globalRecord[CONTAINER_STACK_KEY] = created
  containerStackCache = created
  return created
}

export const getContextValueStack = (): RuntimeContextValue[] => {
  if (contextValueStackCache) {
    return contextValueStackCache
  }
  const globalRecord = getGlobalRecord()
  const existing = globalRecord[CONTEXT_VALUE_STACK_KEY]
  if (Array.isArray(existing)) {
    contextValueStackCache = existing as RuntimeContextValue[]
    return contextValueStackCache
  }
  const created: RuntimeContextValue[] = []
  globalRecord[CONTEXT_VALUE_STACK_KEY] = created
  contextValueStackCache = created
  return created
}

export const getFrameStack = (): RenderFrame[] => {
  if (frameStackCache) {
    return frameStackCache
  }
  const globalRecord = getGlobalRecord()
  const existing = globalRecord[FRAME_STACK_KEY]
  if (Array.isArray(existing)) {
    frameStackCache = existing as RenderFrame[]
    return frameStackCache
  }
  const created: RenderFrame[] = []
  globalRecord[FRAME_STACK_KEY] = created
  frameStackCache = created
  return created
}

export const getResumeContainers = () => {
  if (resumeContainersCache) {
    return resumeContainersCache
  }
  const globalRecord = getGlobalRecord()
  const existing = globalRecord[RESUME_CONTAINERS_KEY]
  if (existing instanceof Set) {
    resumeContainersCache = existing as Set<RuntimeContainer>
    return resumeContainersCache
  }
  const created = new Set<RuntimeContainer>()
  globalRecord[RESUME_CONTAINERS_KEY] = created
  resumeContainersCache = created
  return created
}

export const getCurrentContainer = (): RuntimeContainer | null => {
  const stack = containerStackCache ?? getContainerStack()
  return stack.length > 0 ? stack[stack.length - 1]! : null
}

const getAsyncSignalSnapshotCache = () => {
  if (asyncSignalSnapshotCache) {
    return asyncSignalSnapshotCache
  }
  const globalRecord = getGlobalRecord()
  const existing = globalRecord[ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY]
  if (existing instanceof Map) {
    asyncSignalSnapshotCache = existing as Map<string, unknown>
    return asyncSignalSnapshotCache
  }
  const created = new Map<string, unknown>()
  globalRecord[ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY] = created
  asyncSignalSnapshotCache = created
  return created
}

export const readAsyncSignalSnapshot = (id: string, container: RuntimeContainer | null) =>
  container?.asyncSignalStates.get(id) ??
  container?.asyncSignalSnapshotCache.get(id) ??
  getAsyncSignalSnapshotCache().get(id)

export const writeAsyncSignalSnapshot = (
  id: string,
  value: unknown,
  container: RuntimeContainer | null,
) => {
  container?.asyncSignalStates.set(id, value)
  container?.asyncSignalSnapshotCache.set(id, value)
  if (!container) {
    getAsyncSignalSnapshotCache().set(id, value)
  }
}

export const clearAsyncSignalSnapshot = (id: string, container: RuntimeContainer | null) => {
  container?.asyncSignalStates.delete(id)
  container?.asyncSignalSnapshotCache.delete(id)
  if (!container) {
    getAsyncSignalSnapshotCache().delete(id)
  }
}
