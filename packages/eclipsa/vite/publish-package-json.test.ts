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
    const publishPackageJson = createPublishPackageJson(
      packageJson,
      new Map([['@eclipsa/optimizer', '0.2.0']]),
    )
    const exportsMap = publishPackageJson.exports as Record<string, Record<string, string>>

    expect(publishPackageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/pnsk-lab/eclipsa.git',
      directory: 'packages/eclipsa',
    })
    expect(publishPackageJson.dependencies).toEqual({
      '@eclipsa/optimizer': '^0.2.0',
      'fast-glob': '^3.3.2',
      hono: '^4.6.4',
    })
    expect(exportsMap['./internal']).toEqual({
      types: './core/internal.d.mts',
      import: './core/internal.mjs',
    })
    expect(exportsMap['./web-utils']).toEqual({
      types: './web-utils/mod.d.mts',
      import: './web-utils/mod.mjs',
    })
    expect(exportsMap['./signal']).toEqual({
      types: './signal.d.mts',
      import: './signal.mjs',
    })
    expect(exportsMap['./flow']).toEqual({
      types: './flow.d.mts',
      import: './flow.mjs',
    })
    expect(exportsMap['./meta']).toEqual({
      types: './meta.d.mts',
      import: './meta.mjs',
    })
    expect(exportsMap['./compiled-client']).toEqual({
      types: './compiled-client.d.mts',
      import: './compiled-client.mjs',
    })
    expect(exportsMap['./vite/build/runtime']).toEqual({
      types: './vite/build/runtime.d.mts',
      import: './vite/build/runtime.mjs',
    })
    expect(exportsMap['.']).toEqual({
      types: './mod.d.mts',
      import: './mod.mjs',
    })
  })

  it('keeps publish pack entries aligned with generated exports', () => {
    const packConfig = Array.isArray(rootConfig.pack) ? rootConfig.pack[0] : rootConfig.pack

    expect(packConfig?.entry).toEqual(
      expect.arrayContaining([
        'core/internal.ts',
        'compiled-client.ts',
        'flow.ts',
        'meta.ts',
        'signal.ts',
        'web-utils/mod.ts',
        'vite/build/runtime.ts',
      ]),
    )
  })

  it('rewrites create-eclipsa metadata for dist publishing', async () => {
    const packageJson = await readPackageJson('../../create-eclipsa/package.json')
    const publishPackageJson = createPublishPackageJson(packageJson)

    expect(publishPackageJson.version).toBe('0.0.0')
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

  it('rewrites @eclipsa/content metadata for dist publishing', async () => {
    const packageJson = await readPackageJson('../../content/package.json')
    const publishPackageJson = createPublishPackageJson(
      packageJson,
      new Map([['eclipsa', '0.2.0-alpha.0']]),
    )
    const exportsMap = publishPackageJson.exports as Record<string, Record<string, string>>

    expect(publishPackageJson.private).toBe(false)
    expect(publishPackageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/pnsk-lab/eclipsa.git',
      directory: 'packages/content',
    })
    expect(publishPackageJson.dependencies).toEqual({
      '@ox-content/napi': '^0.17.0',
      eclipsa: '0.2.0-alpha.0',
      'fast-glob': '^3.3.2',
      shiki: '^4.0.2',
      yaml: '^2.8.1',
    })
    expect(exportsMap['.']).toEqual({
      types: './mod.d.mts',
      import: './mod.mjs',
    })
    expect(exportsMap['./vite']).toEqual({
      types: './vite.d.mts',
      import: './vite.mjs',
    })
    expect(exportsMap['./internal']).toEqual({
      types: './internal.d.mts',
      import: './internal.mjs',
    })
  })

  it('rewrites @eclipsa/motion metadata for dist publishing', async () => {
    const packageJson = await readPackageJson('../../motion/package.json')
    const publishPackageJson = createPublishPackageJson(
      packageJson,
      new Map([['eclipsa', '0.2.0-alpha.0']]),
    )

    expect(publishPackageJson.private).toBe(false)
    expect(publishPackageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/pnsk-lab/eclipsa.git',
      directory: 'packages/motion',
    })
    expect(publishPackageJson.dependencies).toEqual({
      eclipsa: '0.2.0-alpha.0',
      'motion-dom': '12.38.0',
      'motion-utils': '12.36.0',
    })
    expect(publishPackageJson.exports).toEqual({
      '.': {
        types: './mod.d.mts',
        import: './mod.mjs',
      },
    })
  })

  it('rewrites @eclipsa/markdown metadata for dist publishing', async () => {
    const packageJson = await readPackageJson('../../markdown/package.json')
    const publishPackageJson = createPublishPackageJson(
      packageJson,
      new Map([['eclipsa', '0.2.0-alpha.0']]),
    )

    expect(publishPackageJson.private).toBe(false)
    expect(publishPackageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/pnsk-lab/eclipsa.git',
      directory: 'packages/markdown',
    })
    expect(publishPackageJson.dependencies).toEqual({
      eclipsa: '0.2.0-alpha.0',
    })
    expect(publishPackageJson.exports).toEqual({
      '.': {
        types: './mod.d.mts',
        import: './mod.mjs',
      },
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

  it('pins the optimizer dependency to the synchronized eclipsa release version', async () => {
    const packageJson = await readPackageJson('../package.json')
    const publishPackageJson = createPublishPackageJson(
      packageJson,
      new Map([['@eclipsa/optimizer', '3.4.5']]),
    )

    expect(publishPackageJson.dependencies).toMatchObject({
      '@eclipsa/optimizer': '^3.4.5',
    })
  })
})
