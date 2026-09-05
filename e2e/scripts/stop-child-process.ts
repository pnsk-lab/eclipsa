import type { ChildProcess } from 'node:child_process'

export const stopChildProcess = async (
  child: ChildProcess,
  graceMs = 5_000,
  processGroup = false,
) => {
  const kill = (signal: NodeJS.Signals) => {
    if (processGroup && child.pid !== undefined) {
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    } else {
      child.kill(signal)
    }
  }
  if (processGroup) {
    kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, graceMs))
    // The launcher can exit before its Vite descendants release inherited pipes.
    kill('SIGKILL')
    return
  }
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => kill('SIGKILL'), graceMs)
    child.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })
    kill('SIGTERM')
  })
}
