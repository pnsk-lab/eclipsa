import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { docs } from '../content.config.ts'
import { getDocPage, getDocsStaticPaths, getFirstDocHref } from './content.ts'

describe('docs markdown page', () => {
  it('defines a content collection and a markdown source page', async () => {
    const source = await readFile(
      path.join(import.meta.dirname, '..', 'content', 'docs', 'getting-started.md'),
      'utf8',
    )

    expect(docs.__eclipsa_content_collection__).toBe(true)
    expect(source).toContain('# Render Markdown with `@eclipsa/content`')
    expect(source).toContain('A minimal markdown page rendered by @eclipsa/content.')
  })

  it('maps content entry ids into getStaticPaths params', async () => {
    await expect(getDocsStaticPaths()).resolves.toEqual([
      {
        params: {
          slug: ['getting-started'],
        },
      },
    ])
    await expect(getFirstDocHref()).resolves.toBe('/docs/getting-started')
  })

  it('loads and renders a markdown entry from a catch-all slug', async () => {
    const page = await getDocPage(['getting-started'])

    expect(page.title).toBe('Content Rendering')
    expect(page.html).toContain('Render Markdown with')
    expect(page.description).toBe('A minimal markdown page rendered by @eclipsa/content.')
  })
})
