import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { expect, test, vi } from 'vitest'
import { stopChildProcess } from './stop-child-process.ts'

const fakeChild = (graceful: boolean) => {
  const child = new EventEmitter() as ChildProcess
  child.exitCode = null
  child.signalCode = null
  const signals: string[] = []
  child.kill = (signal) => {
    signals.push(String(signal))
    if (graceful || signal === 'SIGKILL') {
      queueMicrotask(() => {
        child.signalCode = signal as NodeJS.Signals
        child.emit('close', null, signal)
      })
    }
    return true
  }
  return { child, signals }
}

test('stops a child gracefully without leaving a shutdown timer', async () => {
  const { child, signals } = fakeChild(true)
  await stopChildProcess(child, 10)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(signals).toEqual(['SIGTERM'])
})

test('forces shutdown when the dev server ignores SIGTERM', async () => {
  const { child, signals } = fakeChild(false)
  await stopChildProcess(child, 10)
  expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
})

test('leaves an already exited child alone', async () => {
  const { child, signals } = fakeChild(true)
  child.exitCode = 0
  await stopChildProcess(child, 10)
  expect(signals).toEqual([])
})

test('stops descendants even when their launcher has already exited', async () => {
  const { child } = fakeChild(true)
  Object.assign(child, { pid: 12345, exitCode: 0 })
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  try {
    await stopChildProcess(child, 10, true)
    expect(kill.mock.calls).toEqual([
      [-12345, 'SIGTERM'],
      [-12345, 'SIGKILL'],
    ])
  } finally {
    kill.mockRestore()
  }
})
