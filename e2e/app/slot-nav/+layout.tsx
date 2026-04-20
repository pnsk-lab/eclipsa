import { Link, useLocation, useSignal } from 'eclipsa'

const renderPageLink = (
  pathname: string,
  props: { href: string; label: string; stateTestId: string },
) => {
  const isActive = pathname === props.href
  return (
    <Link
      href={props.href}
      class={isActive ? 'link active' : 'link inactive'}
      data-testid={`${props.stateTestId}-link`}
    >
      <span data-testid={props.stateTestId}>{isActive ? ' active' : ' inactive'}</span>
      <span>{props.label}</span>
    </Link>
  )
}

export default (props: { children?: unknown }) => {
  const open = useSignal(true)
  const location = useLocation()

  return (
    <div>
      <nav>
        <button
          type="button"
          data-testid="slot-nav-toggle"
          onClick={() => {
            open.value = !open.value
          }}
        >
          Toggle nav
        </button>
        <span data-testid="slot-nav-toggle-state">{open.value ? 'open' : 'closed'}</span>
        <span data-testid="slot-nav-pathname">{location.pathname}</span>
        <div>
          <button type="button">Getting Started</button>
          <div>
            {renderPageLink(location.pathname, {
              href: '/slot-nav/overview',
              label: 'Overview',
              stateTestId: 'slot-nav-overview-state',
            })}
            {renderPageLink(location.pathname, {
              href: '/slot-nav/quick-start',
              label: 'Quick Start',
              stateTestId: 'slot-nav-quick-start-state',
            })}
          </div>
        </div>
      </nav>
      <main>{props.children}</main>
    </div>
  )
}
