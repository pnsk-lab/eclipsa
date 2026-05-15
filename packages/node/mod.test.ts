import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EclipsaServerAdapterPlugin } from 'eclipsa/vite'
import { node } from './mod.ts'

describe('@eclipsa/node', () => {
  it('emits a Node host entry that loads the default server handler', () => {
    const plugin = node() as EclipsaServerAdapterPlugin
    const files = plugin.eclipsaServerAdapter?.buildFiles({
      clientDir: '/workspace/app/dist/client',
      root: '/workspace/app',
      serverDir: '/workspace/app/dist/server',
    })

    expect(plugin.name).toBe('@eclipsa/node')
    expect(files).toEqual([
      {
        path: 'node.mjs',
        contents: expect.stringContaining('import createHandler from "./index.mjs";'),
      },
    ])
  })

  it('is available from the publish workflow package choices', async () => {
    const publishWorkflow = await readFile(
      path.join(import.meta.dirname, '../../.github/workflows/publish.yml'),
      'utf8',
    )

    expect(publishWorkflow).toContain('- node')
    expect(publishWorkflow).toContain('package_dir="packages/node"')
  })
})
