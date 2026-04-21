import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('workspace scripts', () => {
  it('exposes root native build passthrough scripts for filtered bun invocations', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(import.meta.dirname, '../../package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['build:native']).toBe('turbo run build:native')
    expect(packageJson.scripts?.['build:native:dev']).toBe('turbo run build:native:dev')
  })

  it('declares matching turbo tasks for root native build passthrough scripts', async () => {
    const turboConfig = JSON.parse(
      await readFile(path.join(import.meta.dirname, '../../turbo.json'), 'utf8'),
    ) as {
      tasks?: Record<string, unknown>
    }

    expect(turboConfig.tasks?.['build:native']).toBeTruthy()
    expect(turboConfig.tasks?.['build:native:dev']).toBeTruthy()
  })
})
