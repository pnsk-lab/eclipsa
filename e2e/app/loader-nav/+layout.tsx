import { Link, useComputed$, useLocation } from 'eclipsa'

const PageLink = (props: { href: string; label: string; stateTestId: string }) => {
  const location = useLocation()
  const isActive = useComputed$(() => location.pathname === props.href)

  return (
    <Link
      href={props.href}
      class={isActive.value ? 'link active' : 'link inactive'}
      data-testid={`${props.stateTestId}-link`}
    >
      <span data-testid={props.stateTestId}>
        {isActive.value ? ' active' : ' inactive'}
      </span>
      <span data-testid={`${props.stateTestId}-label`}>{props.label}</span>
    </Link>
  )
}

export default (props: { children?: unknown }) => {
  return (
    <div>
      <nav>
        <PageLink
          href="/loader-nav/overview"
          label="Overview"
          stateTestId="loader-nav-overview-state"
        />
        <span> | </span>
        <PageLink
          href="/loader-nav/quick-start"
          label="Quick Start"
          stateTestId="loader-nav-quick-start-state"
        />
      </nav>
      <main>{props.children}</main>
    </div>
  )
}
