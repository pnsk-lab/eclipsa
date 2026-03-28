import { describe, expect, it } from 'vitest'
import { buildContentSearchIndex, resolveContentSearchOptions, searchContentIndex } from './search.ts'

describe('@eclipsa/content search', () => {
  it('resolves search options with defaults', () => {
    expect(resolveContentSearchOptions(undefined)).toEqual({
      enabled: true,
      hotkey: '/',
      limit: 10,
      placeholder: 'Search docs...',
      prefix: true,
    })
    expect(resolveContentSearchOptions(false).enabled).toBe(false)
  })

  it('ranks exact and prefix matches with snippets', () => {
    const index = buildContentSearchIndex(
      [
        {
          body: 'Build apps with eclipsa signals and resumable rendering.',
          code: ["const count = useSignal(0)"],
          collection: 'docs',
          headings: ['Signals'],
          id: 'materials/signal',
          title: 'Signals',
          url: '/docs/materials/signal',
        },
        {
          body: 'Motion primitives for transitions.',
          code: ['motion.div'],
          collection: 'docs',
          headings: ['Motion'],
          id: 'integrations/motion',
          title: 'Motion',
          url: '/docs/integrations/motion',
        },
      ],
      resolveContentSearchOptions({
        limit: 3,
      }),
    )

    const exact = searchContentIndex(index, 'signals')
    expect(exact[0]?.id).toBe('materials/signal')
    expect(exact[0]?.snippet).toContain('signals')

    const prefix = searchContentIndex(index, 'sig')
    expect(prefix[0]?.id).toBe('materials/signal')

    expect(searchContentIndex(index, '   ')).toEqual([])
  })
})
