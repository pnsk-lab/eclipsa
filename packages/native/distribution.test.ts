import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareNativeDist } from '../../scripts/native/distribution.ts'

describe('native distribution packaging', () => {
  const cleanup = new Set<string>()

  afterEach(async () => {
    for (const directory of cleanup) {
      await rm(directory, { force: true, recursive: true })
    }
    cleanup.clear()
  })

  it('copies bundled host artifacts into dist and writes a host manifest', async () => {
    const packageDir = await mkdtemp(path.join(tmpdir(), 'eclipsa-native-dist-'))
    cleanup.add(packageDir)

    await mkdir(path.join(packageDir, 'dist'), { recursive: true })
    await mkdir(path.join(packageDir, 'artifacts', 'darwin-arm64'), { recursive: true })
    await mkdir(path.join(packageDir, 'assets'), { recursive: true })
    await writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify(
        {
          name: '@test/native-host-package',
          version: '1.2.3',
          type: 'module',
          eclipsaNative: {
            assets: [
              {
                destination: 'resources/config.json',
                source: 'assets/config.json',
              },
            ],
            bundleDir: 'host',
            targets: [
              {
                arch: 'arm64',
                entrypoint: 'binaries/darwin-arm64/TestHost',
                files: [
                  {
                    destination: 'binaries/darwin-arm64/TestHost',
                    executable: true,
                    source: 'artifacts/darwin-arm64/TestHost',
                  },
                ],
                id: 'darwin-arm64',
                os: 'darwin',
              },
            ],
          },
          exports: {
            '.': {
              import: './mod.mjs',
              types: './mod.d.mts',
            },
          },
        },
        null,
        2,
      ),
    )
    await writeFile(path.join(packageDir, 'artifacts', 'darwin-arm64', 'TestHost'), '#!/bin/sh\n')
    await writeFile(path.join(packageDir, 'assets', 'config.json'), '{"ok":true}\n')

    const prepared = await prepareNativeDist(packageDir)
    expect(prepared.hostManifestPath).toBe(path.join(packageDir, 'dist', 'host', 'manifest.json'))

    const manifest = JSON.parse(
      await readFile(path.join(packageDir, 'dist', 'host', 'manifest.json'), 'utf8'),
    ) as {
      assets: string[]
      targets: Array<{
        entrypoint: string
        files: string[]
        id: string
      }>
    }

    expect(manifest.assets).toEqual(['./resources/config.json'])
    expect(manifest.targets).toEqual([
      {
        arch: 'arm64',
        entrypoint: './binaries/darwin-arm64/TestHost',
        files: ['./binaries/darwin-arm64/TestHost'],
        id: 'darwin-arm64',
        os: 'darwin',
      },
    ])
    expect(
      await readFile(path.join(packageDir, 'dist', 'host', 'resources', 'config.json'), 'utf8'),
    ).toBe('{"ok":true}\n')
    expect(
      await readFile(
        path.join(packageDir, 'dist', 'host', 'binaries', 'darwin-arm64', 'TestHost'),
        'utf8',
      ),
    ).toBe('#!/bin/sh\n')
  })

  it('fails in strict mode when a declared host artifact is missing', async () => {
    const packageDir = await mkdtemp(path.join(tmpdir(), 'eclipsa-native-dist-strict-'))
    cleanup.add(packageDir)

    await mkdir(path.join(packageDir, 'dist'), { recursive: true })
    await writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify(
        {
          name: '@test/native-host-package',
          version: '1.2.3',
          type: 'module',
          eclipsaNative: {
            targets: [
              {
                arch: 'x64',
                entrypoint: 'binaries/darwin-x64/TestHost',
                files: [
                  {
                    destination: 'binaries/darwin-x64/TestHost',
                    source: 'artifacts/darwin-x64/TestHost',
                  },
                ],
                id: 'darwin-x64',
                os: 'darwin',
              },
            ],
          },
          exports: {
            '.': {
              import: './mod.mjs',
              types: './mod.d.mts',
            },
          },
        },
        null,
        2,
      ),
    )

    await expect(
      prepareNativeDist(packageDir, {
        strictHostArtifacts: true,
      }),
    ).rejects.toThrow(/artifacts\/darwin-x64\/TestHost/)
  })

  it('wires native package publishing through host artifact jobs in the publish workflow', async () => {
    const publishWorkflow = await readFile(
      path.join(import.meta.dirname, '../../.github/workflows/publish.yml'),
      'utf8',
    )

    expect(publishWorkflow).toContain('- native-swiftui')
    expect(publishWorkflow).toContain('- native-android-compose')
    expect(publishWorkflow).toContain('- native-gtk4')
    expect(publishWorkflow).toContain('build_native_host_artifacts:')
    expect(publishWorkflow).toContain('path: ${{ needs.prepare.outputs.publish_dir }}/../artifacts')
    expect(publishWorkflow).toContain('ECLIPSA_NATIVE_REQUIRE_HOST_ARTIFACTS=1')
    expect(publishWorkflow).toContain('Verify native host bundle metadata')
  })

  it('keeps native host matrix filtering out of the publish workflow job condition', async () => {
    const publishWorkflow = await readFile(
      path.join(import.meta.dirname, '../../.github/workflows/publish.yml'),
      'utf8',
    )
    const jobStart = publishWorkflow.indexOf('  build_native_host_artifacts:')
    const jobEnd = publishWorkflow.indexOf('  publish_eclipsa:', jobStart)
    const nativeHostJob = publishWorkflow.slice(jobStart, jobEnd)
    const jobIfLine = nativeHostJob.match(/\n    if: .+/)?.[0] ?? ''

    expect(jobIfLine).not.toContain('matrix.')
    expect(jobIfLine).toContain("inputs.package == 'native-swiftui'")
    expect(nativeHostJob).toContain(
      'settings: ${{ fromJson(needs.prepare.outputs.native_host_matrix) }}',
    )
    expect(nativeHostJob).not.toContain('matrix.settings.package == inputs.package')
    expect(publishWorkflow).toContain('native_host_matrix:')
    expect(publishWorkflow).toContain('native_host_matrix="$(node -e "')
    expect(publishWorkflow).toContain("artifact: 'darwin-arm64'")
    expect(publishWorkflow).toContain("artifact: 'android-universal'")
  })
})
