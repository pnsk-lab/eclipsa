import fg from 'fast-glob'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import YAML from 'yaml'
import type { StandardSchemaIssue, StandardSchemaV1 } from 'eclipsa'
import { highlightHtml } from './highlight.ts'
import { buildContentSearchIndex, resolveContentSearchOptions } from './search.ts'
import type { CollectionEntry, ContentFilter, ContentRuntimeModule } from './mod.ts'
import { CONTENT_COLLECTION_MARKER } from './types.ts'
import type {
  AnyCollection,
  BaseContentEntry,
  ContentMarkdownOptions,
  ContentComponentProps,
  ContentEntryReference,
  ContentHeading,
  ContentLoader,
  ContentLoaderContext,
  ContentLoaderObject,
  ContentSearchDocument,
  ContentSearchIndex,
  ResolvedContentSearchOptions,
  ContentSourceEntry,
  DefinedCollection,
  GlobLoader,
  RenderedContent,
  ResolvedContentEntries,
} from './types.ts'

interface ParsedFrontmatter {
  body: string
  data: Record<string, unknown>
}

interface ResolvedManifest {
  collections: Map<AnyCollection, BaseContentEntry[]>
  markdownByCollectionName: Map<string, ContentMarkdownOptions | undefined>
  searchByCollectionName: Map<string, ResolvedContentSearchOptions>
  entriesByCollection: Map<AnyCollection, Map<string, BaseContentEntry>>
}

interface CreateContentRuntimeOptions {
  collectionsModule: Record<string, unknown>
  configPath: string
  root: string
}

const MARKDOWN_EXTENSION_RE = /\.md$/i
const require = createRequire(import.meta.url)
let markdownTransform: typeof import('@ox-content/napi').transform | null = null

export class ContentCollectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentCollectionError'
  }
}

const normalizeSlashes = (value: string) => value.replaceAll('\\', '/')

const formatIssuePath = (pathValue: StandardSchemaIssue['path']) => {
  if (!pathValue || pathValue.length === 0) {
    return ''
  }
  return pathValue
    .map((segment) =>
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? String(segment.key)
        : String(segment),
    )
    .join('.')
}

const createSchemaError = (
  collection: string,
  filePath: string,
  issues: readonly StandardSchemaIssue[],
) => {
  const detail = issues
    .map((issue) => {
      const issuePath = formatIssuePath(issue.path)
      return issuePath === '' ? issue.message : `${issuePath}: ${issue.message}`
    })
    .join('; ')
  return new ContentCollectionError(
    `Invalid frontmatter in collection "${collection}" for ${filePath}: ${detail}`,
  )
}

const parseFrontmatter = (source: string): ParsedFrontmatter => {
  if (!source.startsWith('---')) {
    return {
      body: source,
      data: {},
    }
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(source)
  if (!match) {
    return {
      body: source,
      data: {},
    }
  }
  const raw = YAML.parse(match[1] ?? '')
  if (raw == null) {
    return {
      body: source.slice(match[0].length),
      data: {},
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ContentCollectionError('Markdown frontmatter must resolve to an object.')
  }
  return {
    body: source.slice(match[0].length),
    data: { ...(raw as Record<string, unknown>) },
  }
}

const normalizeIdSegment = (segment: string) =>
  segment
    .trim()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^a-zA-Z0-9/_-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^[-/]+|[-/]+$/g, '')

const normalizeEntryId = (value: string) =>
  normalizeSlashes(value).split('/').map(normalizeIdSegment).filter(Boolean).join('/')

const toEntryIdFromRelativePath = (relativePath: string) => {
  const withoutExt = normalizeSlashes(relativePath).replace(MARKDOWN_EXTENSION_RE, '')
  const segments = withoutExt.split('/').filter(Boolean)
  if (segments[segments.length - 1] === 'index' && segments.length > 1) {
    segments.pop()
  }
  return normalizeEntryId(segments.join('/')) || 'index'
}

const validateData = async (
  collection: string,
  schema: StandardSchemaV1<any, any> | undefined,
  filePath: string,
  data: Record<string, unknown>,
) => {
  if (!schema) {
    return data
  }
  const result = await schema['~standard'].validate(data)
  if ('issues' in result && result.issues !== undefined) {
    throw createSchemaError(collection, filePath, result.issues)
  }
  return result.value as Record<string, unknown>
}

const resolveGlobLoaderEntries = async (
  collection: string,
  loader: GlobLoader,
  context: ContentLoaderContext,
): Promise<ContentSourceEntry[]> => {
  const baseDir = path.resolve(path.dirname(context.configPath), loader.base)
  const matches = await fg(loader.pattern, {
    absolute: true,
    cwd: baseDir,
    onlyFiles: true,
  })
  return Promise.all(
    matches.map(async (filePath) => {
      const source = await fs.readFile(filePath, 'utf8')
      const relativePath = normalizeSlashes(path.relative(baseDir, filePath))
      const parsed = parseFrontmatter(source)
      const slug = typeof parsed.data.slug === 'string' ? parsed.data.slug : undefined
      delete parsed.data.slug
      return {
        body: parsed.body,
        data: parsed.data,
        filePath,
        id: slug ? normalizeEntryId(slug) : toEntryIdFromRelativePath(relativePath),
      } satisfies ContentSourceEntry
    }),
  )
}

const resolveLoaderEntries = async (
  collection: string,
  loader: ContentLoader,
  context: ContentLoaderContext,
) => {
  if ((loader as GlobLoader).kind === 'glob') {
    return resolveGlobLoaderEntries(collection, loader as GlobLoader, context)
  }
  return [...(await (loader as ContentLoaderObject).load(context))]
}

const normalizeResolvedEntry = async (
  collection: string,
  schema: StandardSchemaV1<any, any> | undefined,
  entry: ContentSourceEntry,
  index: number,
) => {
  const parsed =
    entry.data === undefined
      ? parseFrontmatter(entry.body)
      : {
          body: entry.body,
          data: { ...entry.data },
        }
  const filePath = entry.filePath ?? `${collection}:${entry.id ?? index}`
  const slug = typeof parsed.data.slug === 'string' ? parsed.data.slug : undefined
  delete parsed.data.slug
  const id =
    normalizeEntryId(entry.id ?? slug ?? `${collection}-${index}`) || `${collection}-${index}`
  return {
    body: parsed.body,
    collection,
    data: await validateData(collection, schema, filePath, parsed.data),
    filePath,
    id,
  } satisfies BaseContentEntry
}

const isDefinedCollection = (value: unknown): value is DefinedCollection<any> =>
  typeof value === 'object' &&
  value !== null &&
  CONTENT_COLLECTION_MARKER in value &&
  (value as Record<string, unknown>)[CONTENT_COLLECTION_MARKER] === true

export const resolveCollections = async ({
  collectionsModule,
  configPath,
  root,
}: CreateContentRuntimeOptions): Promise<ResolvedManifest> => {
  const byCollection = new Map<AnyCollection, BaseContentEntry[]>()
  const entriesByCollection = new Map<AnyCollection, Map<string, BaseContentEntry>>()
  const markdownByCollectionName = new Map<string, ContentMarkdownOptions | undefined>()
  const searchByCollectionName = new Map<string, ResolvedContentSearchOptions>()
  const definedCollections = Object.entries(collectionsModule).filter(
    (entry): entry is [string, DefinedCollection<any>] => isDefinedCollection(entry[1]),
  )
  for (const [collectionName, definition] of definedCollections) {
    const context: ContentLoaderContext = {
      collection: collectionName,
      configPath,
      root,
    }
    const rawEntries = await resolveLoaderEntries(collectionName, definition.loader, context)
    const resolvedEntries = await Promise.all(
      rawEntries.map((entry, index) =>
        normalizeResolvedEntry(collectionName, definition.schema, entry, index),
      ),
    )
    resolvedEntries.sort((left, right) => left.id.localeCompare(right.id))
    const entriesById = new Map<string, BaseContentEntry>()
    for (const entry of resolvedEntries) {
      if (entriesById.has(entry.id)) {
        throw new ContentCollectionError(
          `Duplicate content id "${entry.id}" in collection "${collectionName}".`,
        )
      }
      entriesById.set(entry.id, entry)
    }
    byCollection.set(definition, resolvedEntries)
    entriesByCollection.set(definition, entriesById)
    markdownByCollectionName.set(collectionName, definition.markdown)
    searchByCollectionName.set(collectionName, resolveContentSearchOptions(definition.search))
  }
  return {
    collections: byCollection,
    markdownByCollectionName,
    searchByCollectionName,
    entriesByCollection,
  }
}

const createContentRenderer =
  (html: string) =>
  (props: Omit<ContentComponentProps, 'html'> = {}) => ({
    isStatic: false,
    props: {
      ...props,
      dangerouslySetInnerHTML: html,
    },
    type: props.as ?? 'article',
  })

const resolveOxContentNapiPath = () => {
  const resolvePaths = [
    process.cwd(),
    path.join(process.cwd(), 'node_modules', '@eclipsa', 'content'),
  ]
  try {
    return require.resolve('@ox-content/napi', { paths: resolvePaths })
  } catch {
    return '@ox-content/napi'
  }
}

const loadMarkdownTransform = async () => {
  markdownTransform ??= (require(resolveOxContentNapiPath()) as typeof import('@ox-content/napi'))
    .transform
  return markdownTransform
}

const decodeHtmlEntities = (value: string) =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')

const stripHtml = (html: string) =>
  decodeHtmlEntities(
    html
      .replaceAll(/<style[\s\S]*?<\/style>/gu, ' ')
      .replaceAll(/<script[\s\S]*?<\/script>/gu, ' ')
      .replaceAll(/<[^>]+>/gu, ' ')
      .replaceAll(/\s+/gu, ' ')
      .trim(),
  )

const extractMarkdownCode = (source: string) => {
  const codeBlocks = new Set<string>()
  for (const match of source.matchAll(/```[\t ]*[^\n\r]*\r?\n([\s\S]*?)```/gu)) {
    const code = match[1]?.trim()
    if (code) {
      codeBlocks.add(code)
    }
  }
  for (const match of source.matchAll(/`([^`\n\r]+)`/gu)) {
    const code = match[1]?.trim()
    if (code) {
      codeBlocks.add(code)
    }
  }
  return [...codeBlocks]
}

const resolveSearchUrl = (base: string, entry: BaseContentEntry) => {
  const normalizedBase = base === '' ? '/' : base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}${entry.collection}/${entry.id}`.replaceAll(/\/+/g, '/')
}

const transformMarkdownEntry = async (entry: BaseContentEntry) => {
  const transform = await loadMarkdownTransform()
  const result = transform(entry.body, {
    autolinks: true,
    footnotes: true,
    gfm: true,
    sourcePath: entry.filePath,
    strikethrough: true,
    tables: true,
    taskLists: true,
    tocMaxDepth: 6,
  })
  if (result.errors.length > 0) {
    throw new ContentCollectionError(
      `Failed to render markdown for ${entry.filePath}: ${result.errors.join('; ')}`,
    )
  }
  return result
}

const createSearchDocument = async (
  entry: BaseContentEntry,
  base: string,
): Promise<ContentSearchDocument> => {
  const result = await transformMarkdownEntry(entry)
  const headings = result.toc.map((heading) => heading.text)
  const title =
    typeof entry.data.title === 'string'
      ? entry.data.title
      : (result.toc.find((heading) => heading.depth === 1)?.text ?? entry.id)

  return {
    body: stripHtml(result.html),
    code: extractMarkdownCode(entry.body),
    collection: entry.collection,
    headings,
    id: entry.id,
    title,
    url: resolveSearchUrl(base, entry),
  }
}

const renderMarkdown = async (
  entry: BaseContentEntry,
  markdownOptions: ContentMarkdownOptions | undefined,
): Promise<RenderedContent> => {
  const result = await transformMarkdownEntry(entry)
  const headings = result.toc.map(
    (heading) =>
      ({
        depth: heading.depth,
        slug: heading.slug,
        text: heading.text,
      }) satisfies ContentHeading,
  )
  const html = await highlightHtml(result.html, markdownOptions?.highlight)
  return {
    Content: createContentRenderer(html),
    headings,
    html,
  }
}

export const createContentSearch = async ({
  collectionsModule,
  configPath,
  root,
  base,
}: CreateContentRuntimeOptions & {
  base: string
}): Promise<{
  index: ContentSearchIndex
  options: ResolvedContentSearchOptions
}> => {
  const manifest = await resolveCollections({
    collectionsModule,
    configPath,
    root,
  })
  const documents: ContentSearchDocument[] = []
  let resolvedOptions = resolveContentSearchOptions(false)

  for (const entries of manifest.collections.values()) {
    const collectionName = entries[0]?.collection
    if (!collectionName) {
      continue
    }
    const searchOptions = manifest.searchByCollectionName.get(collectionName)
    if (!searchOptions?.enabled) {
      continue
    }
    if (!resolvedOptions.enabled) {
      resolvedOptions = searchOptions
    }
    for (const entry of entries) {
      documents.push(await createSearchDocument(entry, base))
    }
  }

  return {
    index: buildContentSearchIndex(documents, resolvedOptions),
    options: resolvedOptions,
  }
}

export const createContentRuntime = ({
  collectionsModule,
  configPath,
  root,
}: CreateContentRuntimeOptions): ContentRuntimeModule => {
  let manifestPromise: Promise<ResolvedManifest> | null = null
  const renderCache = new Map<string, RenderedContent>()
  const getManifest = () => {
    manifestPromise ??= resolveCollections({
      collectionsModule,
      configPath,
      root,
    })
    return manifestPromise
  }
  return {
    async getCollection<Collection extends AnyCollection>(
      collection: Collection,
      filter?: ContentFilter<Collection>,
    ) {
      const manifest = await getManifest()
      const entries = (manifest.collections.get(collection) ?? []) as CollectionEntry<Collection>[]
      if (!filter) {
        return [...entries]
      }
      const filtered: CollectionEntry<Collection>[] = []
      for (const entry of entries) {
        if (await filter(entry)) {
          filtered.push(entry)
        }
      }
      return filtered
    },
    async getEntries<Entries extends readonly ContentEntryReference<any>[]>(entries: Entries) {
      const manifest = await getManifest()
      return entries.map((entry) => {
        const collectionEntries = manifest.entriesByCollection.get(entry.collection)
        return collectionEntries?.get(entry.id)
      }) as ResolvedContentEntries<Entries>
    },
    async getEntry<Collection extends AnyCollection>(collection: Collection, id: string) {
      const manifest = await getManifest()
      return manifest.entriesByCollection.get(collection)?.get(id) as
        | CollectionEntry<Collection>
        | undefined
    },
    async render<Collection extends AnyCollection>(entry: CollectionEntry<Collection>) {
      const key = `${entry.collection}:${entry.id}`
      const cached = renderCache.get(key)
      if (cached) {
        return cached
      }
      const manifest = await getManifest()
      const rendered = await renderMarkdown(
        entry,
        manifest.markdownByCollectionName.get(entry.collection),
      )
      renderCache.set(key, rendered)
      return rendered
    },
  }
}

export { parseFrontmatter, toEntryIdFromRelativePath }
