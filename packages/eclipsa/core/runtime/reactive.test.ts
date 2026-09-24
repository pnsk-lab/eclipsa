import { describe, expect, test } from 'vitest'
import { effect, popCleanupScope, pushCleanupScope, signal } from './reactive.ts'

describe('effect', () => {
  test('unsubscribes from signals when the enclosing cleanup scope is disposed', () => {
    const source = signal(0)
    const cleanups: (() => void)[] = []
    let runs = 0

    const previous = pushCleanupScope(cleanups)
    effect(() => {
      void source.value
      runs += 1
    })
    popCleanupScope(previous)
    expect(runs).toBe(1)

    source.value = 1
    expect(runs).toBe(2)

    for (const cleanup of cleanups) {
      cleanup()
    }
    source.value = 2
    expect(runs).toBe(2)
  })

  test('drops dependencies that are no longer read on rerun', () => {
    const toggle = signal(true)
    const left = signal(0)
    const right = signal(0)
    let runs = 0

    effect(() => {
      runs += 1
      if (toggle.value) {
        void left.value
      } else {
        void right.value
      }
    })
    expect(runs).toBe(1)

    toggle.value = false
    expect(runs).toBe(2)

    left.value = 1
    expect(runs).toBe(2)

    right.value = 1
    expect(runs).toBe(3)
  })

  test('keeps tracking the outer effect after a nested effect finishes', () => {
    const outer = signal(0)
    const inner = signal(0)
    let outerRuns = 0

    effect(() => {
      outerRuns += 1
      effect(() => {
        void inner.value
      })
      void outer.value
    })
    expect(outerRuns).toBe(1)

    outer.value = 1
    expect(outerRuns).toBe(2)
  })
})
