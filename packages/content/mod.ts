import type { StandardSchemaV1 } from 'eclipsa'
import { CONTENT_COLLECTION_MARKER } from './types.ts'
import type {
  AnyCollection,
  CollectionEntry,
  ContentCollectionDefinition,
  ContentComponentProps,
  ContentFilter,
  ContentHighlightOptions,
  ContentMarkdownOptions,
  ContentEntryReference,
  DefinedCollection,
  GlobLoader,
  GlobLoaderOptions,
  ResolvedContentEntries,
  RenderedContent,
} from './types.ts'

const ensureServerOnly = () => {
  if (typeof window !== 'undefined') {
    throw new Error('@eclipsa/content query APIs are server-only.')
  }
}

const loadRuntime = async (): Promise<ContentRuntimeModule> => {
  ensureServerOnly()
  return import('virtual:eclipsa-content:runtime')
}

export interface ContentRuntimeModule {
  getCollection<Collection extends AnyCollection>(
    collection: Collection,
    filter?: ContentFilter<Collection>,
  ): Promise<CollectionEntry<Collection>[]>
  getEntries<Entries extends readonly ContentEntryReference<any>[]>(
    entries: Entries,
  ): Promise<ResolvedContentEntries<Entries>>
  getEntry<Collection extends AnyCollection>(
    collection: Collection,
    id: string,
  ): Promise<CollectionEntry<Collection> | undefined>
  render<Collection extends AnyCollection>(entry: CollectionEntry<Collection>): Promise<RenderedContent>
}

export type {
  AnyCollection,
  BaseContentEntry,
  CollectionEntry,
  ContentCollectionDefinition,
  ContentComponentProps,
  ContentFilter,
  ContentHighlightOptions,
  ContentMarkdownOptions,
  ContentEntryReference,
  ContentHeading,
  ContentLoader,
  ContentLoaderContext,
  ContentLoaderObject,
  ContentSourceEntry,
  DefinedCollection,
  GlobLoader,
  GlobLoaderOptions,
  InferCollectionData,
  RenderedContent,
  ResolvedContentEntries,
} from './types.ts'

export type { StandardSchemaV1 } from 'eclipsa'

export const defineCollection = <
  Schema extends StandardSchemaV1<any, any> | undefined = StandardSchemaV1<any, any> | undefined,
>(
  definition: ContentCollectionDefinition<Schema>,
): DefinedCollection<Schema> =>
  ({
    ...definition,
    [CONTENT_COLLECTION_MARKER]: true,
  }) as DefinedCollection<Schema>

export const glob = (options: GlobLoaderOptions): GlobLoader => ({
  base: options.base,
  kind: 'glob',
  pattern: options.pattern,
})

export const Content = ({ as = 'article', html, ...props }: ContentComponentProps) => ({
  isStatic: false,
  props: {
    ...props,
    dangerouslySetInnerHTML: html,
  },
  type: as,
})

export const getCollection = async <Collection extends AnyCollection>(
  collection: Collection,
  filter?: ContentFilter<Collection>,
): Promise<CollectionEntry<Collection>[]> =>
  (await loadRuntime()).getCollection(collection, filter) as Promise<CollectionEntry<Collection>[]>

export const getEntry = async <Collection extends AnyCollection>(
  collection: Collection,
  id: string,
): Promise<CollectionEntry<Collection> | undefined> =>
  (await loadRuntime()).getEntry(collection, id) as Promise<CollectionEntry<Collection> | undefined>

export const getEntries = async <Entries extends readonly ContentEntryReference<any>[]>(
  entries: Entries,
): Promise<ResolvedContentEntries<Entries>> =>
  (await loadRuntime()).getEntries(entries) as Promise<ResolvedContentEntries<Entries>>

export const render = async <Collection extends AnyCollection>(
  entry: CollectionEntry<Collection>,
): Promise<RenderedContent> => (await loadRuntime()).render(entry)
