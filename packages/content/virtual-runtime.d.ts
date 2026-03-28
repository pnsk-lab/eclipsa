declare module 'virtual:eclipsa-content:runtime' {
  export function getCollection<Collection extends import('./types.ts').AnyCollection>(
    collection: Collection,
    filter?: import('./mod.ts').ContentFilter<Collection>,
  ): Promise<import('./mod.ts').CollectionEntry<Collection>[]>
  export function getEntries<Entries extends readonly import('./types.ts').ContentEntryReference<any>[]>(
    entries: Entries,
  ): Promise<import('./types.ts').ResolvedContentEntries<Entries>>
  export function getEntry<Collection extends import('./types.ts').AnyCollection>(
    collection: Collection,
    id: string,
  ): Promise<import('./mod.ts').CollectionEntry<Collection> | undefined>
  export function render<Collection extends import('./types.ts').AnyCollection>(
    entry: import('./mod.ts').CollectionEntry<Collection>,
  ): Promise<import('./types.ts').RenderedContent>
}

declare module 'virtual:eclipsa-content:search' {
  export const searchOptions: import('./types.ts').ResolvedContentSearchOptions
  export function search(
    query: string,
    options?: import('./types.ts').ContentSearchQueryOptions,
  ): Promise<import('./types.ts').ContentSearchResult[]>
}
