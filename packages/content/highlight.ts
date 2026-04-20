import { createHighlighter, type Highlighter } from 'shiki'
import type { ContentHighlightOptions } from './types.ts'

const DEFAULT_THEME = 'github-dark'
const CODE_BLOCK_RE = /<pre\b[^>]*>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/giu
const CLASS_ATTR_RE = /\bclass=(['"])(.*?)\1/iu
const HTML_ENTITY_RE = /&(?:#(\d+)|#x([\da-fA-F]+)|amp|lt|gt|quot|#39);/g
const highlighterCache = new Map<string, Promise<Highlighter>>()
const loadedLanguagesByTheme = new Map<string, Set<string>>()

const decodeHtmlEntities = (value: string) =>
  value.replace(HTML_ENTITY_RE, (entity, decimal, hex) => {
    if (decimal) {
      return String.fromCodePoint(Number(decimal))
    }
    if (hex) {
      return String.fromCodePoint(Number.parseInt(hex, 16))
    }
    switch (entity) {
      case '&amp;':
        return '&'
      case '&lt;':
        return '<'
      case '&gt;':
        return '>'
      case '&quot;':
        return '"'
      case '&#39;':
        return "'"
      default:
        return entity
    }
  })

const getLanguageFromCodeAttributes = (attributes: string) => {
  const classAttr = CLASS_ATTR_RE.exec(attributes)?.[2]
  if (!classAttr) {
    return null
  }
  for (const token of classAttr.split(/\s+/)) {
    if (token.startsWith('language-')) {
      return token.slice('language-'.length)
    }
  }
  return null
}

const resolveTheme = (options: boolean | ContentHighlightOptions | undefined) => {
  if (!options) {
    return null
  }
  return options === true ? DEFAULT_THEME : (options.theme ?? DEFAULT_THEME)
}

const getHighlighter = (theme: string) => {
  const cached = highlighterCache.get(theme)
  if (cached) {
    return cached
  }
  const next = createHighlighter({
    langs: [],
    themes: [theme],
  })
  highlighterCache.set(theme, next)
  loadedLanguagesByTheme.set(theme, new Set())
  return next
}

const ensureLanguageLoaded = async (theme: string, language: string) => {
  const loadedLanguages = loadedLanguagesByTheme.get(theme) ?? new Set<string>()
  loadedLanguagesByTheme.set(theme, loadedLanguages)
  if (loadedLanguages.has(language)) {
    return
  }
  const highlighter = await getHighlighter(theme)
  await highlighter.loadLanguage(language as any)
  loadedLanguages.add(language)
}

export const highlightHtml = async (
  html: string,
  options: boolean | ContentHighlightOptions | undefined,
) => {
  const theme = resolveTheme(options)
  if (!theme) {
    return html
  }

  const highlighter = await getHighlighter(theme)
  let highlightedHtml = ''
  let lastIndex = 0

  for (const match of html.matchAll(CODE_BLOCK_RE)) {
    const index = match.index ?? 0
    const fullMatch = match[0]
    const codeAttributes = match[1] ?? ''
    const encodedCode = match[2] ?? ''
    const language = getLanguageFromCodeAttributes(codeAttributes)

    highlightedHtml += html.slice(lastIndex, index)
    lastIndex = index + fullMatch.length

    if (!language) {
      highlightedHtml += fullMatch
      continue
    }

    try {
      await ensureLanguageLoaded(theme, language)
      highlightedHtml += highlighter.codeToHtml(decodeHtmlEntities(encodedCode), {
        lang: language,
        theme,
      })
    } catch {
      highlightedHtml += fullMatch
    }
  }

  if (lastIndex === 0) {
    return html
  }

  highlightedHtml += html.slice(lastIndex)
  return highlightedHtml
}
