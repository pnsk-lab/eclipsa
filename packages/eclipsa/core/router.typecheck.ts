import type { GetStaticPaths, StaticPath } from './router-shared.ts'

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Expect<T extends true> = T

const getStaticPaths: GetStaticPaths = async () => [
  {
    params: {
      lang: undefined,
      slug: ['guide', 'getting-started'],
    },
  },
]

type StaticPaths = Awaited<ReturnType<typeof getStaticPaths>>
type _StaticPaths = Expect<Equal<StaticPaths, StaticPath[]>>

// @ts-expect-error static path params must be string, string[], or undefined.
const invalidStaticPaths: GetStaticPaths = () => [{ params: { slug: 1 } }]

void invalidStaticPaths
