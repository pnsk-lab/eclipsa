import * as fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import rootConfig from '../vite.config.ts'
import { createPublishPackageJson } from '../../../scripts/release/write-dist-package-json.ts'

const readPackageJson = async (relativePath: string) =>
  JSON.parse(await fs.readFile(new URL(relativePath, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >

describe('publish package metadata', () => {
  it('packs eclipsa internal exports and build entries consistently', async () => {
    const packageJson = await readPackageJson('../package.json')
    const publishPackageJson = createPublishPackageJson(packageJson)
    const exportsMap = publishPackageJson.exports as Record<string, Record<string, string>>
    const packConfig = Array.isArray(rootConfig.pack) ? rootConfig.pack[0] : rootConfig.pack

    expect(packConfig?.entry).toContain('core/internal.ts')
    expect(packConfig?.entry).toContain('web-utils/mod.ts')
    expect(publishPackageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/pnsk-lab/eclipsa.git',
      directory: 'packages/eclipsa',
    })
    expect(exportsMap['./internal']).toEqual({
      types: './core/internal.d.mts',
      import: './core/internal.mjs',
    })
    expect(exportsMap['./web-utils']).toEqual({
      types: './web-utils/mod.d.mts',
      import: './web-utils/mod.mjs',
    })
    expect(exportsMap['.']).toEqual({
      types: './mod.d.mts',
      import: './mod.mjs',
    })
  })

  it('rewrites create-eclipsa metadata for dist publishing', async () => {
    const packageJson = await readPackageJson('../../create-eclipsa/package.json')
    const publishPackageJson = createPublishPackageJson(packageJson)

    expect(publishPackageJson.version).toBe('0.1.0-alpha.0')
    expect(publishPackageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/pnsk-lab/eclipsa.git',
      directory: 'packages/create-eclipsa',
    })
    expect(publishPackageJson.bin).toEqual({
      'create-eclipsa': './mod.mjs',
    })
    expect(publishPackageJson.exports).toEqual({
      '.': {
        types: './mod.d.mts',
        import: './mod.mjs',
      },
    })
  })

  it('rewrites @eclipsa/image metadata for dist publishing', async () => {
    const packageJson = await readPackageJson('../../image/package.json')
    const publishPackageJson = createPublishPackageJson(
      packageJson,
      new Map([['eclipsa', '0.1.0']]),
    )
    const exportsMap = publishPackageJson.exports as Record<string, Record<string, string>>

    expect(publishPackageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/pnsk-lab/eclipsa.git',
      directory: 'packages/image',
    })
    expect(publishPackageJson.dependencies).toEqual({
      eclipsa: '0.1.0',
      sharp: '^0.34.5',
    })
    expect(exportsMap['.']).toEqual({
      types: './mod.d.mts',
      import: './mod.mjs',
    })
    expect(exportsMap['./client']).toEqual({
      types: './client.d.ts',
      import: './client.mjs',
    })
    expect(exportsMap['./vite']).toEqual({
      types: './vite.d.mts',
      import: './vite.mjs',
    })
  })

  it('rewrites workspace protocol dependency ranges for publishing', () => {
    const publishPackageJson = createPublishPackageJson(
      {
        name: '@eclipsa/test-package',
        version: '1.2.3',
        dependencies: {
          eclipsa: 'workspace:*',
          '@eclipsa/image': 'workspace:^',
          sharp: '^0.34.5',
        },
        peerDependencies: {
          vite: 'workspace:~',
        },
        optionalDependencies: {
          helper: 'workspace:2.0.0',
        },
      },
      new Map([
        ['eclipsa', '0.1.0'],
        ['@eclipsa/image', '0.2.0'],
        ['vite', '7.1.0'],
        ['helper', '2.1.0'],
      ]),
    )

    expect(publishPackageJson.dependencies).toEqual({
      eclipsa: '0.1.0',
      '@eclipsa/image': '^0.2.0',
      sharp: '^0.34.5',
    })
    expect(publishPackageJson.peerDependencies).toEqual({
      vite: '~7.1.0',
    })
    expect(publishPackageJson.optionalDependencies).toEqual({
      helper: '2.0.0',
    })
  })
})
