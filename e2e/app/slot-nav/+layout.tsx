import { Link, useComputed$, useLocation, useSignal } from 'eclipsa'

const Dir = (props: { children?: unknown }) => {
  return (
    <div>
      <button type="button">Getting Started</button>
      <div>{props.children}</div>
    </div>
  )
}

const PageLink = (props: { href: string; label: string; stateTestId: string }) => {
  const location = useLocation()
  const isActive = useComputed$(() => location.pathname === props.href)

  return (
    <Link
      href={props.href}
      class={isActive.value ? 'link active' : 'link inactive'}
      data-testid={`${props.stateTestId}-link`}
    >
      <span data-testid={props.stateTestId}>{isActive.value ? ' active' : ' inactive'}</span>
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
        {open.value && (
          <Dir>
            <PageLink
              href="/slot-nav/overview"
              label="Overview"
              stateTestId="slot-nav-overview-state"
            />
            <PageLink
              href="/slot-nav/quick-start"
              label="Quick Start"
              stateTestId="slot-nav-quick-start-state"
            />
          </Dir>
        )}
      </nav>
      <main>{props.children}</main>
    </div>
  )
}
