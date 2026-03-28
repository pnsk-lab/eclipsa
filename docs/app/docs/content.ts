import { getCollection, getEntry, render, type ContentHeading } from '@eclipsa/content'
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
  const entries = await getCollection(docs)
  const entry =
    entries.find(
      (candidate) => candidate.id.endsWith('/overview') || candidate.id === 'overview',
    ) ?? entries[0]
  if (!entry) {
    throw new Error('Expected at least one docs markdown entry.')
  }
  return `/docs/${entry.id}`
}

const attachHeadingIds = (html: string, headings: ContentHeading[]) => {
  let headingIndex = 0

  return html.replace(/<h([1-6])([^>]*)>/g, (match, depth, attrs) => {
    const heading = headings[headingIndex]
    if (!heading || heading.depth !== Number(depth)) {
      return match
    }
    headingIndex += 1

    if (/\sid=/.test(attrs)) {
      return match
    }

    return `<h${depth}${attrs} id="${heading.slug}">`
  })
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
  const html = attachHeadingIds(rendered.html, rendered.headings)
  return {
    description:
      typeof entry.data.description === 'string'
        ? entry.data.description
        : 'Markdown rendered with @eclipsa/content.',
    headings: rendered.headings,
    html,
    title: typeof entry.data.title === 'string' ? entry.data.title : entry.id,
  }
}
