import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { promptForScaffoldOptions, scaffoldApp } from './mod.ts'

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
  it('scaffolds a Node SSR starter with vite into an empty directory', async () => {
    const target = await createTempDir()

    const result = await scaffoldApp(target, {
      packageName: 'demo-app',
      toolchain: 'vite',
    })

    expect(result.packageName).toBe('demo-app')
    expect(result.toolchain).toBe('vite')
    await expect(fs.readFile(path.join(target, 'package.json'), 'utf8')).resolves.toContain(
      '"name": "demo-app"',
    )
    await expect(fs.readFile(path.join(target, 'package.json'), 'utf8')).resolves.toContain(
      '"dev": "vite dev"',
    )
    await expect(fs.readFile(path.join(target, 'package.json'), 'utf8')).resolves.toContain(
      '"vite": "latest"',
    )
    await expect(fs.readFile(path.join(target, 'vite.config.ts'), 'utf8')).resolves.toContain(
      "from 'vite'",
    )
    await expect(fs.readFile(path.join(target, 'vite.config.ts'), 'utf8')).resolves.toContain(
      'plugins: [eclipsa()]',
    )
    await expect(fs.readFile(path.join(target, 'app/+page.tsx'), 'utf8')).resolves.toContain(
      'Hello from Eclipsa',
    )
    await expect(
      fs.readFile(path.join(target, 'app/+ssr-root.tsx'), 'utf8'),
    ).resolves.not.toContain("import './vite-env.d.ts'")
  })

  it('scaffolds a Node SSR starter with vite-plus commands', async () => {
    const target = await createTempDir()

    const result = await scaffoldApp(target, {
      packageName: 'demo-app',
      toolchain: 'vite-plus',
    })

    expect(result.toolchain).toBe('vite-plus')
    await expect(fs.readFile(path.join(target, 'package.json'), 'utf8')).resolves.toContain(
      '"dev": "vp dev"',
    )
    await expect(fs.readFile(path.join(target, 'package.json'), 'utf8')).resolves.toContain(
      '"build": "vp build"',
    )
    await expect(fs.readFile(path.join(target, 'package.json'), 'utf8')).resolves.toContain(
      '"vite-plus": "^0.1.4"',
    )
    await expect(fs.readFile(path.join(target, 'vite.config.ts'), 'utf8')).resolves.toContain(
      "from 'vite-plus'",
    )
  })

  it('rejects non-empty target directories', async () => {
    const target = await createTempDir()
    await fs.writeFile(path.join(target, 'README.md'), 'busy')

    await expect(scaffoldApp(target)).rejects.toThrow(/not empty/)
  })

  it('prompts for project name and toolchain with defaults', async () => {
    const answers = ['my-project', 'vite-plus']
    const result = await promptForScaffoldOptions(
      {
        targetDir: 'my-eclipsa-app',
        toolchain: 'vite',
      },
      async () => answers.shift() ?? '',
    )

    expect(result).toEqual({
      targetDir: 'my-project',
      toolchain: 'vite-plus',
    })
  })
})
