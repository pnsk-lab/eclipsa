import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Plugin } from 'vite'
import { eclipsaContent } from './vite.ts'

const DEV_APP_INVALIDATORS_KEY = Symbol.for('eclipsa.dev-app-invalidators')
const createdRoots: string[] = []

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

  it('invalidates registered dev apps and triggers a full reload for markdown changes', async () => {
    const root = await createTempRoot()
    const plugin = getPlugin()
    const configResolved =
      typeof plugin.configResolved === 'function'
        ? plugin.configResolved
        : plugin.configResolved?.handler
    await configResolved?.call({} as any, {
      root,
    } as any)

    const handlers = new Map<string, (filePath: string) => void>()
    const invalidate = vi.fn()
    const send = vi.fn()
    const configureServer =
      typeof plugin.configureServer === 'function'
        ? plugin.configureServer
        : plugin.configureServer?.handler

    await configureServer?.call({} as any, {
      [DEV_APP_INVALIDATORS_KEY]: new Set([invalidate]),
      environments: {
        ssr: {
          moduleGraph: {
            getModuleById: vi.fn(),
            invalidateModule: vi.fn(),
          },
        },
      },
      watcher: {
        on(event: string, handler: (filePath: string) => void) {
          handlers.set(event, handler)
        },
      },
      ws: {
        send,
      },
    } as any)

    handlers.get('change')?.(path.join(root, 'app', 'content', 'docs', 'guide', 'page.md'))

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      path: '*',
      type: 'full-reload',
    })
  })
})
