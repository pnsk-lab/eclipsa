import { Link, onVisible, useNavigate, type MetadataContext } from 'eclipsa'

export const metadata = ({ url }: MetadataContext) => ({
  canonical: url.pathname,
  title: 'Docs',
})

export default () => {
  const nav = useNavigate()
  onVisible(() => {
    void nav('/docs/getting-started/overview', { replace: true })
  })
  return (
    <Link href="/docs/getting-started/overview" replace>
      Open the documentation
    </Link>
  )
}
