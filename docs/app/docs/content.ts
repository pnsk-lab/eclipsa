import { getCollection, getEntry, render } from '@eclipsa/content'
import { notFound, type GetStaticPaths } from 'eclipsa'
import { docs } from '../content.config.ts'

const normalizeSlugParam = (slug: string | string[] | undefined) => {
  if (Array.isArray(slug)) {
    return slug.join('/')
  }
  return typeof slug === 'string' ? slug : ''
}

export const getDocsStaticPaths: GetStaticPaths = async () => {
  const entries = await getCollection(docs)
  return entries.map((entry) => ({
    params: {
      slug: entry.id.split('/'),
    },
  }))
}

export const getFirstDocHref = async () => {
  const [entry] = await getCollection(docs)
  if (!entry) {
    throw new Error('Expected at least one docs markdown entry.')
  }
  return `/docs/${entry.id}`
}

export const getDocPage = async (slug: string | string[] | undefined) => {
  const id = normalizeSlugParam(slug)
  if (id === '') {
    return notFound()
  }

  const entry = await getEntry(docs, id)
  if (!entry) {
    return notFound()
  }

  const rendered = await render(entry)
  return {
    description:
      typeof entry.data.description === 'string'
        ? entry.data.description
        : 'Markdown rendered with @eclipsa/content.',
    html: rendered.html,
    title: typeof entry.data.title === 'string' ? entry.data.title : entry.id,
  }
}
