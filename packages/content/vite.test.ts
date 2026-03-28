import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Plugin } from 'vite'
import { eclipsaContent } from './vite.ts'

const DEV_APP_INVALIDATORS_KEY = Symbol.for('eclipsa.dev-app-invalidators')
const createdRoots: string[] = []
const contentEntryImportPath = JSON.stringify(path.resolve(__dirname, 'mod.ts'))

const createTempRoot = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eclipsa-content-vite-'))
  createdRoots.push(root)
  await fs.mkdir(path.join(root, 'app'), {
    recursive: true,
  })
  return root
}

const getPlugin = (): Plugin => {
  const plugin = eclipsaContent()
  if (!Array.isArray(plugin)) {
    throw new Error('Expected eclipsaContent() to return a plugin array')
  }
  return plugin[0] as Plugin
}

const getHotUpdate = (plugin: Plugin) => {
  const hook = plugin.hotUpdate
  if (typeof hook === 'function') {
    return hook
  }
  return hook?.handler
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('@eclipsa/content vite plugin', () => {
  it('returns a failing runtime module when content config is missing', async () => {
    const root = await createTempRoot()
    const plugin = getPlugin()
    const configResolved =
      typeof plugin.configResolved === 'function'
        ? plugin.configResolved
        : plugin.configResolved?.handler
    await configResolved?.call({} as any, {
      root,
    } as any)

    const load = typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler
    const code = await load?.call({} as any, '\0eclipsa-content:runtime')

    expect(code).toContain('Missing app/content.config.ts')
  })

  it('builds a runtime module that imports the app content config', async () => {
    const root = await createTempRoot()
    await fs.writeFile(path.join(root, 'app', 'content.config.ts'), 'export const docs = {}')
    const plugin = getPlugin()
    const configResolved =
      typeof plugin.configResolved === 'function'
        ? plugin.configResolved
        : plugin.configResolved?.handler
    await configResolved?.call({} as any, {
      root,
    } as any)

    const load = typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler
    const code = await load?.call({} as any, '\0eclipsa-content:runtime')

    expect(code).toContain('@eclipsa/content/internal')
    expect(code).toContain('app/content.config.ts')
  })

  it('builds a search runtime module when search is enabled', async () => {
    const root = await createTempRoot()
    await fs.mkdir(path.join(root, 'app', 'content', 'docs'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(root, 'app', 'content.config.ts'),
      `
import { defineCollection, glob } from ${contentEntryImportPath}

export const docs = defineCollection({
  loader: glob({
    base: './content/docs',
    pattern: '**/*.md',
  }),
  search: {
    placeholder: 'Search docs',
  },
})
`,
    )
    await fs.writeFile(
      path.join(root, 'app', 'content', 'docs', 'page.md'),
      `---
title: Search Page
---
# Search Page

Find the comet needle.
`,
    )

    const plugin = getPlugin()
    const configResolved =
      typeof plugin.configResolved === 'function'
        ? plugin.configResolved
        : plugin.configResolved?.handler
    await configResolved?.call({} as any, {
      base: '/',
      root,
    } as any)

    const load = typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler
    const code = await load?.call({ environment: { name: 'client' } } as any, '\0eclipsa-content:search')

    expect(code).toContain('__eclipsa_content_search__.json')
    expect(code).toContain('searchOptions')
    expect(code).not.toContain('import type')
    expect(code).not.toContain(': Promise<')
  })

  it('stubs content config collections in the client environment', async () => {
    const root = await createTempRoot()
    const configPath = path.join(root, 'app', 'content.config.ts')
    await fs.writeFile(
      configPath,
      `
import { defineCollection } from '@eclipsa/content'
import { z } from 'zod'

export const docs = defineCollection({ loader: { load: () => [] }, schema: z.object({ title: z.string() }) })
export const posts = defineCollection({ loader: { load: () => [] } })
`,
    )
    const plugin = getPlugin()
    const configResolved =
      typeof plugin.configResolved === 'function'
        ? plugin.configResolved
        : plugin.configResolved?.handler
    await configResolved?.call({} as any, {
      root,
    } as any)

    const load = typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler
    const code = await load?.call(
      {
        environment: {
          name: 'client',
        },
      } as any,
      configPath,
    )

    expect(code).toContain('export const docs = Object.freeze')
    expect(code).toContain('export const posts = Object.freeze')
    expect(code).not.toContain('zod')
  })

  it('invalidates registered dev apps and emits a content HMR event for markdown changes', async () => {
    const root = await createTempRoot()
    const plugin = getPlugin()
    const configResolved =
      typeof plugin.configResolved === 'function'
        ? plugin.configResolved
        : plugin.configResolved?.handler
    await configResolved?.call({} as any, {
      root,
    } as any)

    const invalidate = vi.fn()
    const send = vi.fn()
    const hotUpdate = getHotUpdate(plugin)

    const result = await hotUpdate?.call({} as any, {
      file: path.join(root, 'app', 'content', 'docs', 'guide', 'page.md'),
      modules: [],
      read: () => '',
      server: {
        [DEV_APP_INVALIDATORS_KEY]: new Set([invalidate]),
        environments: {
          ssr: {
            moduleGraph: {
              getModuleById: vi.fn(),
              invalidateModule: vi.fn(),
            },
          },
        },
        ws: {
          send,
        },
      },
      timestamp: Date.now(),
      type: 'update',
    } as any)

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('eclipsa:content-update')
    expect(result).toEqual([])
  })

  it('emits a search index asset during bundle generation when search is enabled', async () => {
    const root = await createTempRoot()
    await fs.mkdir(path.join(root, 'app', 'content', 'docs'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(root, 'app', 'content.config.ts'),
      `
import { defineCollection, glob } from ${contentEntryImportPath}

export const docs = defineCollection({
  loader: glob({
    base: './content/docs',
    pattern: '**/*.md',
  }),
  search: true,
})
`,
    )
    await fs.writeFile(
      path.join(root, 'app', 'content', 'docs', 'page.md'),
      '# Search Asset\n\nMeteor shard token.',
    )

    const plugin = getPlugin()
    const configResolved =
      typeof plugin.configResolved === 'function'
        ? plugin.configResolved
        : plugin.configResolved?.handler
    await configResolved?.call({} as any, {
      base: '/',
      root,
    } as any)

    const emitFile = vi.fn()
    const generateBundle =
      typeof plugin.generateBundle === 'function'
        ? plugin.generateBundle
        : plugin.generateBundle?.handler

    await generateBundle?.call({ emitFile } as any, {} as any, {} as any, false)

    expect(emitFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: '__eclipsa_content_search__.json',
        type: 'asset',
      }),
    )
  })
})
