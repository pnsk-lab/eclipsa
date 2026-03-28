import type {
  ContentSearchDocument,
  ContentSearchField,
  ContentSearchIndex,
  ContentSearchOptions,
  ContentSearchQueryOptions,
  ContentSearchResult,
  ContentSearchPosting,
  ResolvedContentSearchOptions,
} from './types.ts'

const DEFAULT_SEARCH_OPTIONS: ResolvedContentSearchOptions = {
  enabled: true,
  hotkey: '/',
  limit: 10,
  placeholder: 'Search docs...',
  prefix: true,
}

const SEARCH_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'with',
])

const SEARCH_K1 = 1.2
const SEARCH_B = 0.75

const isCjkChar = (char: string) => /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(char)

const tokenizeValue = (text: string, query: boolean) => {
  const tokens: string[] = []
  let current = ''

  for (const char of text) {
    if (isCjkChar(char)) {
      if (current !== '') {
        const token = current.toLowerCase()
        if (query || (token.length >= 2 && !SEARCH_STOPWORDS.has(token))) {
          tokens.push(token)
        }
        current = ''
      }
      tokens.push(char)
      continue
    }
    if (/[\p{L}\p{N}_]/u.test(char)) {
      current += char
      continue
    }
    if (current !== '') {
      const token = current.toLowerCase()
      if (query || (token.length >= 2 && !SEARCH_STOPWORDS.has(token))) {
        tokens.push(token)
      }
      current = ''
    }
  }

  if (current !== '') {
    const token = current.toLowerCase()
    if (query || (token.length >= 2 && !SEARCH_STOPWORDS.has(token))) {
      tokens.push(token)
    }
  }

  return tokens
}

const tokenizeIndex = (text: string) => tokenizeValue(text, false)

const tokenizeQuery = (text: string) => tokenizeValue(text, true)

const getFieldBoost = (field: ContentSearchField) => {
  switch (field) {
    case 'title':
      return 10
    case 'heading':
      return 5
    case 'code':
      return 0.5
    case 'body':
    default:
      return 1
  }
}

const addDocumentFieldTerms = (
  map: Map<string, { field: ContentSearchField; tf: number }>,
  field: ContentSearchField,
  text: string,
) => {
  for (const token of tokenizeIndex(text)) {
    const existing = map.get(token)
    if (existing) {
      existing.tf += 1
      continue
    }
    map.set(token, { field, tf: 1 })
  }
}

const getSnippet = (body: string, matches: string[], maxLength = 150) => {
  if (body === '') {
    return ''
  }
  const lowerBody = body.toLowerCase()
  let firstMatchIndex = -1
  for (const match of matches) {
    const index = lowerBody.indexOf(match.toLowerCase())
    if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
      firstMatchIndex = index
    }
  }
  const start = Math.max(0, firstMatchIndex - 50)
  const end = Math.min(body.length, start + maxLength)
  let snippet = body.slice(start, end).trim()
  if (start > 0) {
    snippet = `...${snippet}`
  }
  if (end < body.length) {
    snippet = `${snippet}...`
  }
  return snippet
}

export const resolveContentSearchOptions = (
  options: boolean | ContentSearchOptions | undefined,
): ResolvedContentSearchOptions => {
  if (options === false) {
    return {
      ...DEFAULT_SEARCH_OPTIONS,
      enabled: false,
    }
  }
  const normalized = typeof options === 'object' ? options : {}
  return {
    enabled: normalized.enabled ?? true,
    hotkey: normalized.hotkey ?? DEFAULT_SEARCH_OPTIONS.hotkey,
    limit: normalized.limit ?? DEFAULT_SEARCH_OPTIONS.limit,
    placeholder: normalized.placeholder ?? DEFAULT_SEARCH_OPTIONS.placeholder,
    prefix: normalized.prefix ?? DEFAULT_SEARCH_OPTIONS.prefix,
  }
}

export const buildContentSearchIndex = (
  documents: ContentSearchDocument[],
  options: ResolvedContentSearchOptions,
): ContentSearchIndex => {
  const index: Record<string, ContentSearchPosting[]> = {}
  const df: Record<string, number> = {}
  let totalDocumentLength = 0

  documents.forEach((document, docIdx) => {
    const docTerms = new Map<string, { field: ContentSearchField; tf: number }>()

    addDocumentFieldTerms(docTerms, 'title', document.title)
    for (const heading of document.headings) {
      addDocumentFieldTerms(docTerms, 'heading', heading)
    }
    addDocumentFieldTerms(docTerms, 'body', document.body)
    for (const code of document.code) {
      addDocumentFieldTerms(docTerms, 'code', code)
    }

    totalDocumentLength += tokenizeIndex(document.body).length

    for (const [term, posting] of docTerms) {
      df[term] = (df[term] ?? 0) + 1
      const postings = index[term] ?? []
      postings.push({
        docIdx,
        field: posting.field,
        tf: posting.tf,
      })
      index[term] = postings
    }
  })

  return {
    avgDl: documents.length === 0 ? 0 : totalDocumentLength / documents.length,
    df,
    docCount: documents.length,
    documents,
    index,
    options,
  }
}

export const searchContentIndex = (
  searchIndex: ContentSearchIndex,
  query: string,
  options: ContentSearchQueryOptions = {},
): ContentSearchResult[] => {
  if (query.trim() === '' || searchIndex.docCount === 0) {
    return []
  }

  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) {
    return []
  }

  const limit = options.limit ?? searchIndex.options.limit
  const prefix = options.prefix ?? searchIndex.options.prefix
  const docScores = new Map<number, { matches: Set<string>; score: number }>()

  tokens.forEach((token, index) => {
    const isLastToken = index === tokens.length - 1
    const matchingTerms =
      prefix && isLastToken && token.length >= 2
        ? Object.keys(searchIndex.index).filter((term) => term.startsWith(token))
        : searchIndex.index[token]
          ? [token]
          : []

    for (const term of matchingTerms) {
      const postings = searchIndex.index[term] ?? []
      const df = searchIndex.df[term] ?? 1
      const idf = Math.log((searchIndex.docCount - df + 0.5) / (df + 0.5) + 1)

      for (const posting of postings) {
        const document = searchIndex.documents[posting.docIdx]
        if (!document) {
          continue
        }
        const docLength = Math.max(1, tokenizeIndex(document.body).length)
        const score =
          idf *
          ((posting.tf * (SEARCH_K1 + 1)) /
            (posting.tf + SEARCH_K1 * (1 - SEARCH_B + (SEARCH_B * docLength) / Math.max(1, searchIndex.avgDl)))) *
          getFieldBoost(posting.field)

        const current = docScores.get(posting.docIdx) ?? {
          matches: new Set<string>(),
          score: 0,
        }
        current.score += score
        current.matches.add(term)
        docScores.set(posting.docIdx, current)
      }
    }
  })

  return [...docScores.entries()]
    .map(([docIdx, value]) => {
      const document = searchIndex.documents[docIdx]!
      const matches = [...value.matches]
      return {
        collection: document.collection,
        id: document.id,
        matches,
        score: value.score,
        snippet: getSnippet(document.body, matches),
        title: document.title,
        url: document.url,
      } satisfies ContentSearchResult
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

export const generateContentSearchRuntimeModule = (
  assetPath: string,
  options: ResolvedContentSearchOptions,
) => `let searchIndexPromise = null
const searchOptions = ${JSON.stringify(options)}

const loadSearchIndex = async () => {
  if (searchIndexPromise) {
    return searchIndexPromise
  }
  searchIndexPromise = fetch(${JSON.stringify(assetPath)})
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to load search index.')
      }
      return response.json()
    })
    .catch(() => null)
  return searchIndexPromise
}

const isCjkChar = (char) => /[\\u3400-\\u4dbf\\u4e00-\\u9fff\\u3040-\\u30ff\\uac00-\\ud7af]/u.test(char)

const tokenizeQuery = (text) => {
  const tokens = []
  let current = ''
  for (const char of text) {
    if (isCjkChar(char)) {
      if (current !== '') {
        tokens.push(current.toLowerCase())
        current = ''
      }
      tokens.push(char)
      continue
    }
    if (/[\\p{L}\\p{N}_]/u.test(char)) {
      current += char
      continue
    }
    if (current !== '') {
      tokens.push(current.toLowerCase())
      current = ''
    }
  }
  if (current !== '') {
    tokens.push(current.toLowerCase())
  }
  return tokens
}

const getFieldBoost = (field) => {
  switch (field) {
    case 'title':
      return 10
    case 'heading':
      return 5
    case 'code':
      return 0.5
    case 'body':
    default:
      return 1
  }
}

const getSnippet = (body, matches, maxLength = 150) => {
  if (body === '') {
    return ''
  }
  const lowerBody = body.toLowerCase()
  let firstMatchIndex = -1
  for (const match of matches) {
    const index = lowerBody.indexOf(match.toLowerCase())
    if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
      firstMatchIndex = index
    }
  }
  const start = Math.max(0, firstMatchIndex - 50)
  const end = Math.min(body.length, start + maxLength)
  let snippet = body.slice(start, end).trim()
  if (start > 0) {
    snippet = '...' + snippet
  }
  if (end < body.length) {
    snippet = snippet + '...'
  }
  return snippet
}

export const search = async (
  query,
  options = {},
) => {
  const searchIndex = await loadSearchIndex()
  if (!searchIndex || query.trim() === '') {
    return []
  }
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) {
    return []
  }
  const limit = options.limit ?? searchOptions.limit
  const prefix = options.prefix ?? searchOptions.prefix
  const docScores = new Map()

  tokens.forEach((token, tokenIndex) => {
    const isLastToken = tokenIndex === tokens.length - 1
    const matchingTerms =
      prefix && isLastToken && token.length >= 2
        ? Object.keys(searchIndex.index).filter((term) => term.startsWith(token))
        : searchIndex.index[token]
          ? [token]
          : []

    for (const term of matchingTerms) {
      const postings = searchIndex.index[term] ?? []
      const df = searchIndex.df[term] ?? 1
      const idf = Math.log((searchIndex.docCount - df + 0.5) / (df + 0.5) + 1)

      for (const posting of postings) {
        const document = searchIndex.documents[posting.docIdx]
        if (!document) {
          continue
        }
        const docLength = Math.max(1, document.body.split(/\\s+/u).filter(Boolean).length)
        const score =
          idf *
          ((posting.tf * (1.2 + 1)) /
            (posting.tf + 1.2 * (1 - 0.75 + (0.75 * docLength) / Math.max(1, searchIndex.avgDl)))) *
          getFieldBoost(posting.field)

        const current = docScores.get(posting.docIdx) ?? {
          matches: new Set(),
          score: 0,
        }
        current.score += score
        current.matches.add(term)
        docScores.set(posting.docIdx, current)
      }
    }
  })

  return [...docScores.entries()]
    .map(([docIdx, value]) => {
      const document = searchIndex.documents[docIdx]
      const matches = [...value.matches]
      return {
        collection: document.collection,
        id: document.id,
        matches,
        score: value.score,
        snippet: getSnippet(document.body, matches),
        title: document.title,
        url: document.url,
      }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

export { searchOptions }
export default { search, searchOptions }
`
