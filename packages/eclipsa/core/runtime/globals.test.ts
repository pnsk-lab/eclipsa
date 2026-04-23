import { afterEach, describe, expect, it } from 'vitest'
import {
  ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY,
  CONTAINER_STACK_KEY,
  CONTEXT_VALUE_STACK_KEY,
  FRAME_STACK_KEY,
  RESUME_CONTAINERS_KEY,
} from './constants.ts'

const globalRecord = globalThis as Record<PropertyKey, unknown>
const GLOBAL_KEYS = [
  CONTAINER_STACK_KEY,
  CONTEXT_VALUE_STACK_KEY,
  FRAME_STACK_KEY,
  RESUME_CONTAINERS_KEY,
  ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY,
] as const

const snapshotGlobalValues = () =>
  new Map<PropertyKey, unknown>(GLOBAL_KEYS.map((key) => [key, globalRecord[key]]))

const restoreGlobalValues = (snapshot: Map<PropertyKey, unknown>) => {
  for (const key of GLOBAL_KEYS) {
    const value = snapshot.get(key)
    if (value === undefined) {
      delete globalRecord[key]
      continue
    }
    globalRecord[key] = value
  }
}

let previousGlobals = snapshotGlobalValues()

afterEach(() => {
  restoreGlobalValues(previousGlobals)
  previousGlobals = snapshotGlobalValues()
})

describe('runtime globals', () => {
  it('reuses existing global stores instead of replacing them', async () => {
    const containerStack: unknown[] = []
    const contextStack: unknown[] = []
    const frameStack: unknown[] = []
    const resumeContainers = new Set<unknown>()
    const asyncCache = new Map<string, unknown>([['signal', 'value']])

    globalRecord[CONTAINER_STACK_KEY] = containerStack
    globalRecord[CONTEXT_VALUE_STACK_KEY] = contextStack
    globalRecord[FRAME_STACK_KEY] = frameStack
    globalRecord[RESUME_CONTAINERS_KEY] = resumeContainers
    globalRecord[ASYNC_SIGNAL_SNAPSHOT_CACHE_KEY] = asyncCache

    const {
      getContainerStack,
      getContextValueStack,
      getFrameStack,
      getResumeContainers,
      readAsyncSignalSnapshot,
    } = await import('./globals.ts?runtime-globals-test=1')

    expect(getContainerStack()).toBe(containerStack)
    expect(getContextValueStack()).toBe(contextStack)
    expect(getFrameStack()).toBe(frameStack)
    expect(getResumeContainers()).toBe(resumeContainers)
    expect(readAsyncSignalSnapshot('signal', null)).toBe('value')
  })
})
