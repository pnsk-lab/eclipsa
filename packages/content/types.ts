import type { InferStandardSchemaOutput, StandardSchemaV1 } from 'eclipsa'

export const CONTENT_COLLECTION_MARKER = '__eclipsa_content_collection__'

export interface ContentSourceEntry {
  body: string
  data?: Record<string, unknown>
  filePath?: string
  id?: string
}

export interface ContentLoaderContext {
  collection: string
  configPath: string
  root: string
}

export interface ContentLoaderObject {
  load(
    context: ContentLoaderContext,
  ): ContentSourceEntry[] | Promise<ContentSourceEntry[]> | readonly ContentSourceEntry[]
}

export interface ContentHighlightOptions {
  theme?: string
}

export interface ContentMarkdownOptions {
  highlight?: boolean | ContentHighlightOptions
}

export interface ContentSearchOptions {
  enabled?: boolean
  hotkey?: string
  limit?: number
  placeholder?: string
  prefix?: boolean
}

export interface ResolvedContentSearchOptions {
  enabled: boolean
  hotkey: string
  limit: number
  placeholder: string
  prefix: boolean
}

export type ContentSearchField = 'body' | 'code' | 'heading' | 'title'

export interface ContentSearchDocument {
  body: string
  code: string[]
  collection: string
  headings: string[]
  id: string
  title: string
  url: string
}

export interface ContentSearchPosting {
  docIdx: number
  field: ContentSearchField
  tf: number
}

export interface ContentSearchIndex {
  avgDl: number
  df: Record<string, number>
  docCount: number
  documents: ContentSearchDocument[]
  index: Record<string, ContentSearchPosting[]>
  options: ResolvedContentSearchOptions
}

export interface ContentSearchQueryOptions {
  limit?: number
  prefix?: boolean
}

export interface ContentSearchResult {
  collection: string
  id: string
  matches: string[]
  score: number
  snippet: string
  title: string
  url: string
}

export interface GlobLoaderOptions {
  base: string
  pattern: string
}

export interface GlobLoader {
  readonly base: string
  readonly kind: 'glob'
  readonly pattern: string
}

export type ContentLoader = GlobLoader | ContentLoaderObject

export interface ContentCollectionDefinition<Schema extends StandardSchemaV1<any, any> | undefined> {
  loader: ContentLoader
  markdown?: ContentMarkdownOptions
  search?: boolean | ContentSearchOptions
  schema?: Schema
}

export interface DefinedCollection<
  Schema extends StandardSchemaV1<any, any> | undefined = StandardSchemaV1<any, any> | undefined,
> extends ContentCollectionDefinition<Schema> {
  readonly [CONTENT_COLLECTION_MARKER]: true
}

export type AnyCollection = DefinedCollection<StandardSchemaV1<any, any> | undefined>

export type InferCollectionData<Collection extends AnyCollection> =
  Collection extends DefinedCollection<infer Schema>
    ? Schema extends StandardSchemaV1<any, any>
      ? InferStandardSchemaOutput<Schema>
      : Record<string, unknown>
    : Record<string, unknown>

export interface BaseContentEntry<Data = Record<string, unknown>, Collection extends string = string> {
  body: string
  collection: Collection
  data: Data
  filePath: string
  id: string
}

export interface ContentHeading {
  depth: number
  slug: string
  text: string
}

export interface ContentComponentProps extends Record<string, unknown> {
  as?: string
  html: string
}

export interface RenderedContent {
  Content: (props?: Omit<ContentComponentProps, 'html'>) => any
  headings: ContentHeading[]
  html: string
}

export type CollectionEntry<Collection extends AnyCollection = AnyCollection> = BaseContentEntry<
  InferCollectionData<Collection>
>

export type ContentFilter<Collection extends AnyCollection> = (
  entry: CollectionEntry<Collection>,
) => boolean | Promise<boolean>

export interface ContentEntryReference<Collection extends AnyCollection = AnyCollection> {
  collection: Collection
  id: string
}

export type ResolvedContentEntries<Entries extends readonly ContentEntryReference<any>[]> = {
  [Index in keyof Entries]: Entries[Index] extends ContentEntryReference<infer Collection>
    ? CollectionEntry<Collection> | undefined
    : never
}
