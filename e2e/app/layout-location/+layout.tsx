import { Link, useLocation } from 'eclipsa'

export default (props: { children?: unknown }) => {
  const location = useLocation()
  const isOverview = location.pathname === '/layout-location/overview'

  return (
    <div>
      <nav
        class={isOverview ? 'nav overview active' : 'nav docs inactive'}
        data-testid="layout-location-nav"
      >
        <span data-testid="layout-location-state">
          {isOverview ? 'overview-active' : 'docs-active'}
        </span>
        <span> | </span>
        <Link href="/layout-location/overview">Overview</Link>
        <span> | </span>
        <Link href="/layout-location/docs">Docs</Link>
      </nav>
      <main>{props.children}</main>
    </div>
  )
}
