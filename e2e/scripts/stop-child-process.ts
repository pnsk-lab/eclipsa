import type { ChildProcess } from 'node:child_process'

export const stopChildProcess = async (child: ChildProcess, graceMs = 5_000) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
    }, graceMs)
    child.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill('SIGTERM')
  })
}
