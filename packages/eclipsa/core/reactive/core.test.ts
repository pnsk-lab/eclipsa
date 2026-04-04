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

  it('does not re-run effects for equal primitive values or the same object reference', () => {
    const count = signal(1)
    const initialObject = { label: 'same' }
    const state = signal(initialObject)

    const cb = vi.fn()
    effect(() => {
      cb(`${count.get()}:${state.get() === initialObject ? 'same' : 'new'}`)
    })

    count.set(1)
    state.set(initialObject)
    state.set({ label: 'same' })
    count.set(2)

    expect(cb).toHaveBeenCalledTimes(3)
    expect(cb).toHaveBeenNthCalledWith(1, '1:same')
    expect(cb).toHaveBeenNthCalledWith(2, '1:new')
    expect(cb).toHaveBeenNthCalledWith(3, '2:new')
  })
})
