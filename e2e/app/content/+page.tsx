import { Content, getCollection, getEntry, render } from '@eclipsa/content'
import { For, Link, loader, type MetadataContext } from 'eclipsa'
import { docs } from '../content.config.ts'

export const metadata = ({ url }: MetadataContext) => ({
  canonical: url.pathname,
  openGraph: {
    title: 'E2E Content OG',
  },
  title: `Content | ${url.pathname}`,
})

const useContentLoader = loader(async () => {
  const entries = await getCollection(docs)
  const entry = await getEntry(docs, 'guide/start-here')
  if (!entry) {
    throw new Error('Expected guide/start-here content entry to exist.')
  }
  const rendered = await render(entry)
  return {
    description: entry.data.description,
    entries: entries.map((resolvedEntry) => ({
      id: resolvedEntry.id,
      title: resolvedEntry.data.title,
    })),
    headings: rendered.headings,
    html: rendered.html,
  }
})

export default () => {
  const content = useContentLoader()
  const data = content.data

  return (
    <section>
      <h2>Content Playground</h2>
      <p data-testid="content-description">{data?.description ?? 'missing description'}</p>
      <p>Validated frontmatter and Markdown content loaded through @eclipsa/content.</p>
      <p>
        <Link href="/">Home</Link>
      </p>
      <section>
        <h3>Entry Ids</h3>
        <ul data-testid="content-entry-ids">
          <For
            arr={data?.entries ?? []}
            fn={(entry) => (
              <li key={entry.id}>
                {entry.id} :: {entry.title}
              </li>
            )}
          />
        </ul>
      </section>
      <section>
        <h3>Headings</h3>
        <ul data-testid="content-headings">
          <For
            arr={data?.headings ?? []}
            fn={(heading) => (
              <li key={`${heading.depth}:${heading.slug}`}>
                h{heading.depth} :: {heading.slug}
              </li>
            )}
          />
        </ul>
      </section>
      <Content as="article" data-testid="content-body" html={data?.html ?? ''} />
    </section>
  )
}
