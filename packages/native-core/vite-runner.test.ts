import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = import.meta.dirname
const sharedRunnerPath = path.join(packageRoot, 'vite-runner.js')
const swiftuiRunnerPath = path.join(
  packageRoot,
  '../native-swiftui/macos-swiftui/Sources/EclipsaNativeHost/Resources/vite-runner.js',
)
const composeRunnerPath = path.join(
  packageRoot,
  '../native-android-compose/android-compose/app/src/main/assets/vite-runner.js',
)

describe('native-core shared vite runner', () => {
  it('matches the runner embedded by the SwiftUI and Compose hosts', async () => {
    const [sharedRunner, swiftuiRunner, composeRunner] = await Promise.all([
      readFile(sharedRunnerPath, 'utf8'),
      readFile(swiftuiRunnerPath, 'utf8'),
      readFile(composeRunnerPath, 'utf8'),
    ])

    expect(swiftuiRunner).toBe(sharedRunner)
    expect(composeRunner).toBe(sharedRunner)
  })
})
