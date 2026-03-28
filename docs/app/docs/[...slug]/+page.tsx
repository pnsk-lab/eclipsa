import { Content } from '@eclipsa/content'
import { Link, loader, type GetStaticPaths, type MetadataContext } from 'eclipsa'
import { Logo } from '../../../components/logo.tsx'
import { getDocPage, getDocsStaticPaths } from '../content.ts'

export const metadata = ({ url }: MetadataContext) => ({
  canonical: url.pathname,
  title: 'Docs',
})

export const getStaticPaths: GetStaticPaths = getDocsStaticPaths

const useDocsPage = loader((c) => getDocPage(c.req.param('slug')))

export default () => {
  const page = useDocsPage()

  return <Content as="div" class="markdown-content" html={page.data?.html ?? ''} />
}
