import { onVisible, useNavigate, type MetadataContext } from 'eclipsa'

export const metadata = ({ url }: MetadataContext) => ({
  canonical: url.pathname,
  title: 'Docs',
})

export default () => {
  const nav = useNavigate()
  onVisible(() => {
    nav('/docs/getting-started/overview')
  })
  return <div />
}
