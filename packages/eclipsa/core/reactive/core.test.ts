import { effect, signal } from './core.ts'
import { describe, expect, it, vi } from 'vitest'

describe('signal', () => {
  it('returns the current value', () => {
    const count = signal(0)

    expect(count.get()).toBe(0)
  })

  it('updates the stored value', () => {
    const count = signal(0)

    count.set(1)

    expect(count.get()).toBe(1)
  })

  it('re-runs effects when the value changes', () => {
    const count = signal(0)

    const cb = vi.fn()
    effect(() => {
      cb(count.get())
    })

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenNthCalledWith(1, 0)

    count.set(1)

    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenNthCalledWith(2, 1)
  })
})
