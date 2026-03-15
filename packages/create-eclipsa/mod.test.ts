import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scaffoldApp } from './mod.ts'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((target) => fs.rm(target, { force: true, recursive: true })),
  )
})

const createTempDir = async () => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'create-eclipsa-'))
  tempDirs.push(target)
  return target
}

describe('create-eclipsa', () => {
  it('scaffolds a Node SSR starter into an empty directory', async () => {
    const target = await createTempDir()

    const result = await scaffoldApp(target, {
      packageName: 'demo-app',
    })

    expect(result.packageName).toBe('demo-app')
    await expect(fs.readFile(path.join(target, 'package.json'), 'utf8')).resolves.toContain(
      '"name": "demo-app"',
    )
    await expect(fs.readFile(path.join(target, 'vite.config.ts'), 'utf8')).resolves.toContain(
      'plugins: [eclipsa()]',
    )
    await expect(fs.readFile(path.join(target, 'app/+page.tsx'), 'utf8')).resolves.toContain(
      'Hello from Eclipsa',
    )
  })

  it('rejects non-empty target directories', async () => {
    const target = await createTempDir()
    await fs.writeFile(path.join(target, 'README.md'), 'busy')

    await expect(scaffoldApp(target)).rejects.toThrow(/not empty/)
  })
})
