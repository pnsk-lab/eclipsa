import {
  ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY,
  CONTAINER_STACK_KEY,
  CONTEXT_VALUE_STACK_KEY,
  FRAME_STACK_KEY,
  RESUME_CONTAINERS_KEY,
} from './constants.ts'
import type { RenderFrame, RuntimeContainer, RuntimeContextValue } from './types.ts'

export const getContainerStack = (): RuntimeContainer[] => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[CONTAINER_STACK_KEY]
  if (Array.isArray(existing)) {
    return existing as RuntimeContainer[]
  }
  const created: RuntimeContainer[] = []
  globalRecord[CONTAINER_STACK_KEY] = created
  return created
}

export const getContextValueStack = (): RuntimeContextValue[] => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[CONTEXT_VALUE_STACK_KEY]
  if (Array.isArray(existing)) {
    return existing as RuntimeContextValue[]
  }
  const created: RuntimeContextValue[] = []
  globalRecord[CONTEXT_VALUE_STACK_KEY] = created
  return created
}

export const getFrameStack = (): RenderFrame[] => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[FRAME_STACK_KEY]
  if (Array.isArray(existing)) {
    return existing as RenderFrame[]
  }
  const created: RenderFrame[] = []
  globalRecord[FRAME_STACK_KEY] = created
  return created
}

export const getResumeContainers = () => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>
  const existing = globalRecord[RESUME_CONTAINERS_KEY]
  if (existing instanceof Set) {
    return existing as Set<RuntimeContainer>
  }
  const created = new Set<RuntimeContainer>()
  globalRecord[RESUME_CONTAINERS_KEY] = created
  return created
}

export const getCurrentContainer = (): RuntimeContainer | null => {
  const stack = getContainerStack()
  return stack.length > 0 ? stack[stack.length - 1]! : null
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
