import { describe, expect, it } from 'vitest'
import { createNativeDevClientRuntime } from './dev-client.ts'

const silentLogger = {
  debug() {},
  error() {},
}

describe('native-core dev client runtime', () => {
  it('applies accepted dependency updates through the shared hmr graph', async () => {
    const imported: string[] = []
    const invalidated: string[][] = []
    let depVersion = 0

    const runtime = createNativeDevClientRuntime({
      entry: '/entry.js',
      logger: silentLogger,
      runner: {
        clearCache() {},
        importModule(url) {
          imported.push(url)
          return {
            default: url === '/dep.js' ? `dep:${++depVersion}` : `module:${url}`,
          }
        },
        invalidateModules(urls) {
          invalidated.push([...urls])
        },
      },
    })

    const hot = runtime.createHotContext('/entry.js')
    let updatedModule: string | undefined
    hot.accept('/dep.js', (module) => {
      updatedModule = module?.default as string | undefined
    })

    await runtime.handlePayload({
      type: 'update',
      updates: [
        {
          acceptedPath: '/dep.js',
          firstInvalidatedBy: '/source.js',
          invalidates: ['/nested.js'],
          path: '/entry.js',
          type: 'js-update',
        },
      ],
    })

    expect(invalidated).toEqual([['/dep.js', '/entry.js', '/source.js', '/nested.js']])
    expect(imported).toEqual(['/dep.js'])
    expect(updatedModule).toBe('dep:1')
  })

  it('keeps hot data across self-accepted updates', async () => {
    let entryVersion = 0

    const runtime = createNativeDevClientRuntime({
      entry: '/entry.js',
      logger: silentLogger,
      runner: {
        clearCache() {},
        importModule() {
          entryVersion += 1
          return {
            default: `entry:${entryVersion}`,
          }
        },
        invalidateModules() {},
      },
    })

    const hot = runtime.createHotContext('/entry.js')
    hot.dispose((data) => {
      data.version = entryVersion
    })
    hot.accept(() => undefined)

    await runtime.handlePayload({
      type: 'update',
      updates: [
        {
          acceptedPath: '/entry.js',
          path: '/entry.js',
          type: 'js-update',
        },
      ],
    })

    const nextHot = runtime.createHotContext('/entry.js')
    expect(nextHot.data.version).toBe(0)
  })

  it('reimports the entry module on full reload payloads', async () => {
    const imported: string[] = []
    let clearCount = 0

    const runtime = createNativeDevClientRuntime({
      entry: '/entry.js',
      logger: silentLogger,
      runner: {
        clearCache() {
          clearCount += 1
        },
        importModule(url) {
          imported.push(url)
          return {
            default: url,
          }
        },
        invalidateModules() {},
      },
    })

    await runtime.handlePayload({
      type: 'full-reload',
    })

    expect(clearCount).toBe(1)
    expect(imported).toEqual(['/entry.js'])
  })
})
