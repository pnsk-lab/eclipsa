import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createContentRuntime,
  createContentSearch,
  parseFrontmatter,
  toEntryIdFromRelativePath,
} from './internal.ts'
import { defineCollection, glob } from './mod.ts'

const createdRoots: string[] = []

const createTempRoot = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eclipsa-content-'))
  createdRoots.push(root)
  await fs.mkdir(path.join(root, 'app', 'content', 'docs', 'guide'), {
    recursive: true,
  })
  return root
}

afterEach(async () => {
  await Promise.all(
    createdRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('@eclipsa/content internals', () => {
  it('parses YAML frontmatter and strips the delimiter block', () => {
    expect(
      parseFrontmatter(`---
title: Hello
order: 1
---
# Heading
`),
    ).toEqual({
      body: '# Heading\n',
      data: {
        order: 1,
        title: 'Hello',
      },
    })
  })

  it('normalizes file paths into stable entry ids', () => {
    expect(toEntryIdFromRelativePath('guide/getting started.md')).toBe('guide/getting-started')
    expect(toEntryIdFromRelativePath('guide/index.md')).toBe('guide')
  })

  it('loads markdown entries, honors slug overrides, and renders headings', async () => {
    const root = await createTempRoot()
    const configPath = path.join(root, 'app', 'content.config.ts')
    await fs.writeFile(
      path.join(root, 'app', 'content', 'docs', 'guide', 'getting-started.md'),
      `---
title: Getting Started
description: Intro page
order: 2
slug: guide/start-here
---
# Getting Started

Welcome to **content**.

\`\`\`ts
const answer = 42
\`\`\`
`,
    )
    await fs.writeFile(
      path.join(root, 'app', 'content', 'docs', 'guide', 'overview.md'),
      `---
title: Overview
description: Overview page
order: 1
---
# Overview
`,
    )
    const schema = {
      '~standard': {
        types: undefined as unknown as {
          input: {
            description: string
            order: number
            title: string
          }
          output: {
            description: string
            order: number
            title: string
          }
        },
        validate(value: unknown) {
          return {
            value: value as {
              description: string
              order: number
              title: string
            },
          }
        },
        vendor: 'test',
        version: 1 as const,
      },
    }
    const docs = defineCollection({
      loader: glob({
        base: './content/docs',
        pattern: '**/*.md',
      }),
      markdown: {
        highlight: {
          theme: 'github-dark',
        },
      },
      schema,
    })
    const runtime = createContentRuntime({
      collectionsModule: {
        docs,
      },
      configPath,
      root,
    })

    const entries = await runtime.getCollection(docs)

    expect(entries.map((entry) => entry.id)).toEqual(['guide/overview', 'guide/start-here'])
    expect(entries[1]?.data).toEqual({
      description: 'Intro page',
      order: 2,
      title: 'Getting Started',
    })

    const entry = await runtime.getEntry(docs, 'guide/start-here')
    expect(entry?.body).toContain('Welcome to **content**.')

    const rendered = await runtime.render(entry!)
    expect(rendered.html).toContain('<h1>Getting Started</h1>')
    expect(rendered.html).toContain('class="shiki')
    expect(rendered.html).toContain('answer')
    expect(rendered.headings).toEqual([
      {
        depth: 1,
        slug: 'getting-started',
        text: 'Getting Started',
      },
    ])
  })

  it('surfaces frontmatter validation errors with file context', async () => {
    const root = await createTempRoot()
    const configPath = path.join(root, 'app', 'content.config.ts')
    await fs.writeFile(
      path.join(root, 'app', 'content', 'docs', 'guide', 'bad.md'),
      `---
title: Bad
---
# Bad
`,
    )
    const schema = {
      '~standard': {
        types: undefined as unknown as {
          input: {
            title: string
          }
          output: {
            title: string
          }
        },
        validate() {
          return {
            issues: [
              {
                message: 'description is required',
                path: ['description'],
              },
            ],
          } as const
        },
        vendor: 'test',
        version: 1 as const,
      },
    }
    const docs = defineCollection({
      loader: glob({
        base: './content/docs',
        pattern: '**/*.md',
      }),
      schema,
    })
    const runtime = createContentRuntime({
      collectionsModule: {
        docs,
      },
      configPath,
      root,
    })

    await expect(runtime.getCollection(docs)).rejects.toThrow(
      /Invalid frontmatter in collection "docs".*description is required/u,
    )
  })

  it('builds a search index from searchable markdown collections', async () => {
    const root = await createTempRoot()
    const configPath = path.join(root, 'app', 'content.config.ts')
    await fs.writeFile(
      path.join(root, 'app', 'content', 'docs', 'guide', 'quick-start.md'),
      `---
title: Quick Start
---
# Quick Start

Searchable nebula token.

\`\`\`ts
const searchNeedle = 'nebula'
\`\`\`
`,
    )
    const docs = defineCollection({
      loader: glob({
        base: './content/docs',
        pattern: '**/*.md',
      }),
      search: {
        hotkey: 'k',
        limit: 5,
        placeholder: 'Search docs',
      },
    })

    const result = await createContentSearch({
      base: '/',
      collectionsModule: { docs },
      configPath,
      root,
    })

    expect(result.options).toMatchObject({
      enabled: true,
      hotkey: 'k',
      limit: 5,
      placeholder: 'Search docs',
    })
    expect(result.index.documents).toHaveLength(1)
    expect(result.index.documents[0]).toMatchObject({
      collection: 'docs',
      id: 'guide/quick-start',
      title: 'Quick Start',
      url: '/docs/guide/quick-start',
    })
    expect(result.index.documents[0]?.body).toContain('Searchable nebula token.')
    expect(result.index.documents[0]?.code).toContain("const searchNeedle = 'nebula'")
    expect(result.index.documents[0]?.headings).toContain('Quick Start')
  })
})
