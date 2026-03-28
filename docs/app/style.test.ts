import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('docs markdown styles', () => {
  it('keeps inline code inside headings at the heading font size', () => {
    const styleSheet = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

    expect(styleSheet).toContain('.markdown-content :is(h1, h2, h3, h4, h5, h6) > code {')
    expect(styleSheet).toContain('font-size: inherit;')
    expect(styleSheet).toContain('line-height: inherit;')
  })

  it('defines a dark docs theme palette', () => {
    const styleSheet = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

    expect(styleSheet).toContain("html[data-docs-theme='dark'] {")
    expect(styleSheet).toContain('--docs-bg: #09090b;')
    expect(styleSheet).toContain('--docs-text: #fafafa;')
  })
})
