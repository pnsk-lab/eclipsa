import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPlaygroundCompileQueue } from './compile-queue.ts'

function createDeferred<TResult>() {
  let resolve: ((value: TResult) => void) | null = null
  const promise = new Promise<TResult>((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve(value: TResult) {
      resolve?.(value)
    },
  }
}

describe('playground compile queue', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('compiles only the latest debounced source', async () => {
    vi.useFakeTimers()
    const builds: string[] = []
    const results: string[] = []
    const queue = createPlaygroundCompileQueue({
      async build(source) {
        builds.push(source)
        return source
      },
      onResult({ result }) {
        results.push(result)
      },
    })

    queue.queue('first', 180)
    await vi.advanceTimersByTimeAsync(120)
    queue.queue('second', 180)
    await vi.advanceTimersByTimeAsync(179)

    expect(builds).toEqual([])

    await vi.advanceTimersByTimeAsync(1)

    expect(builds).toEqual(['second'])
    expect(results).toEqual(['second'])
  })

  it('recompiles the latest ready source after an in-flight compile settles', async () => {
    vi.useFakeTimers()
    const firstBuild = createDeferred<string>()
    const builds: string[] = []
    const starts: string[] = []
    const idles: string[] = []
    const results: string[] = []
    let buildCount = 0
    const queue = createPlaygroundCompileQueue({
      build(source) {
        builds.push(source)
        buildCount += 1
        if (buildCount === 1) {
          return firstBuild.promise
        }

        return Promise.resolve(`${source}:done`)
      },
      onIdle() {
        idles.push('idle')
      },
      onResult({ result }) {
        results.push(result)
      },
      onStart({ source }) {
        starts.push(source)
      },
    })

    queue.queue('first')
    queue.queue('second', 180)
    await vi.advanceTimersByTimeAsync(180)

    expect(builds).toEqual(['first'])
    expect(starts).toEqual(['first'])

    firstBuild.resolve('first:done')
    await Promise.resolve()
    await Promise.resolve()

    expect(builds).toEqual(['first', 'second'])
    expect(starts).toEqual(['first', 'second'])
    expect(results).toEqual(['first:done', 'second:done'])
    expect(idles).toHaveLength(1)
  })

  it('drops stale ready sources when newer edits arrive before the active compile settles', async () => {
    vi.useFakeTimers()
    const firstBuild = createDeferred<string>()
    const builds: string[] = []
    const results: string[] = []
    const queue = createPlaygroundCompileQueue({
      build(source) {
        builds.push(source)
        if (source === 'first') {
          return firstBuild.promise
        }

        return Promise.resolve(`${source}:done`)
      },
      onResult({ result }) {
        results.push(result)
      },
    })

    queue.queue('first')
    queue.queue('second', 180)
    await vi.advanceTimersByTimeAsync(180)

    expect(builds).toEqual(['first'])

    queue.queue('third', 180)
    firstBuild.resolve('first:done')
    await Promise.resolve()
    await Promise.resolve()

    expect(builds).toEqual(['first'])

    await vi.advanceTimersByTimeAsync(180)

    expect(builds).toEqual(['first', 'third'])
    expect(results).toEqual(['first:done', 'third:done'])
  })
})
