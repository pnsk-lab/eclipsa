import { loader, type GetStaticPaths } from 'eclipsa'

const normalizeSlug = (slug: string | string[] | undefined) =>
  Array.isArray(slug) ? slug.join('/') : (slug ?? '')

export const getStaticPaths: GetStaticPaths = () => [
  {
    params: {
      slug: ['overview'],
    },
  },
  {
    params: {
      slug: ['quick-start'],
    },
  },
]

const useDoc = loader((c) => ({
  slug: normalizeSlug(c.req.param('slug')),
}))

export default () => {
  const page = useDoc()

  return <h1>{page.data?.slug ?? 'loading'}</h1>
}
