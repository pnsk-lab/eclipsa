import { effect, signal } from './core.ts'
import { assertSpyCall, spy } from '@std/testing/mock'
import { assertEquals } from '@std/assert/equals'

Deno.test('Signal value should be valid', () => {
  const count = signal(0)

  assertEquals(count.get(), 0)
})

Deno.test('Signal value should be updated', () => {
  const count = signal(0)

  count.set(1)

  assertEquals(count.get(), 1)
})

Deno.test('Effect should be called', () => {
  const count = signal(0)

  const cb = spy()
  effect(() => {
    cb(count.get())
  })
  assertSpyCall(cb, 0)

  count.set(1)
  assertSpyCall(cb, 1, {
    args: [1],
  })
})
