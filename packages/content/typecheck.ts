import { defineCollection, getEntries, getEntry, getCollection, glob, type CollectionEntry } from './mod.ts'
import type { StandardSchemaV1 } from 'eclipsa'

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Expect<T extends true> = T

const schema = {
  '~standard': {
    types: undefined as unknown as {
      input: {
        title: string
      }
      output: {
        order: number
        title: string
      }
    },
    validate(value: unknown) {
      return {
        value: value as {
          order: number
          title: string
        },
      }
    },
    vendor: 'typecheck',
    version: 1 as const,
  },
} satisfies StandardSchemaV1<
  {
    title: string
  },
  {
    order: number
    title: string
  }
>

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

declare const entry: CollectionEntry<typeof docs>

type _Id = Expect<Equal<typeof entry.id, string>>
type _Collection = Expect<Equal<typeof entry.collection, string>>
type _Data = Expect<
  Equal<
    typeof entry.data,
    {
      order: number
      title: string
    }
  >
>

declare const filter: Parameters<typeof getCollection<typeof docs>>[1]
declare const refsPromise: ReturnType<typeof getEntries<[{
  collection: typeof docs
  id: 'guide/start-here'
}]>>
declare const entryPromise: ReturnType<typeof getEntry<typeof docs>>

type _Filter = Expect<Equal<typeof filter, ((entry: CollectionEntry<typeof docs>) => boolean | Promise<boolean>) | undefined>>
type _GetEntry = Expect<Equal<typeof entryPromise, Promise<CollectionEntry<typeof docs> | undefined>>>
type _GetEntries = Expect<
  Equal<
    typeof refsPromise,
    Promise<[CollectionEntry<typeof docs> | undefined]>
  >
>
