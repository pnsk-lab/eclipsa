import {
  createHostCallbackRegistry,
  createHostObjectRegistry,
  createQuickJSRuntimeBridge,
  createRuntimeModuleRegistry,
  createRuntimeTaskScheduler,
} from './quickjs.ts'
import { describe, expect, it } from 'vitest'

describe('native-core quickjs bridge helpers', () => {
  it('stores host object references until they are deleted', () => {
    const registry = createHostObjectRegistry()
    const reference = registry.create({ platform: 'swiftui' })

    expect(registry.get(reference)).toEqual({ platform: 'swiftui' })
    expect(registry.delete(reference)).toBe(true)
    expect(registry.has(reference)).toBe(false)
  })

  it('registers callbacks and modules and flushes queued tasks', () => {
    const callbacks = createHostCallbackRegistry()
    const modules = createRuntimeModuleRegistry()
    const scheduler = createRuntimeTaskScheduler()
    const steps: string[] = []

    callbacks.register('boot', (mode: string) => {
      steps.push(`callback:${mode}`)
    })
    modules.register({ code: 'export const answer = 42', id: 'app.ts' })
    scheduler.queue(() => {
      steps.push('task:first')
    })
    scheduler.queue(() => {
      steps.push(`module:${modules.get('app.ts').id}`)
      callbacks.invoke('boot', 'dev')
    })

    scheduler.flush()

    expect(steps).toEqual(['task:first', 'module:app.ts', 'callback:dev'])
    expect(
      createQuickJSRuntimeBridge({ callbacks, modules, scheduler }).modules.has('app.ts'),
    ).toBe(true)
  })
})
