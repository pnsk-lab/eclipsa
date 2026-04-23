import { motion } from '@eclipsa/motion'
import { Link, useLocation, useSignal } from 'eclipsa'

const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    links: [
      { href: '/sidebar-shell/overview', label: 'Overview' },
      { href: '/sidebar-shell/quick-start', label: 'Quick Start' },
    ],
  },
  {
    id: 'materials',
    title: 'Materials',
    links: [
      { href: '/sidebar-shell/routing', label: 'Routing' },
      { href: '/sidebar-shell/signal', label: 'Signal' },
    ],
  },
]

const SidebarSection = (props: {
  activePathname: string
  id: string
  links: Array<{ href: string; label: string }>
  title: string
}) => {
  const open = useSignal(true)

  return (
    <section data-testid={`sidebar-shell-section-${props.id}`}>
      <button
        type="button"
        aria-expanded={open.value}
        data-testid={`sidebar-shell-section-button-${props.id}`}
        onClick={() => {
          open.value = !open.value
        }}
      >
        <span data-testid={`sidebar-shell-section-icon-${props.id}`}>#</span>
        <span data-testid={`sidebar-shell-section-title-${props.id}`}>{props.title}</span>
        <span data-testid={`sidebar-shell-section-spacer-${props.id}`}> </span>
        <motion.span
          data-testid={`sidebar-shell-section-chevron-${props.id}`}
          initial={false}
          animate={{ rotate: open.value ? 0 : -90 }}
        >
          v
        </motion.span>
      </button>
      <motion.div
        data-testid={`sidebar-shell-section-links-${props.id}`}
        initial={false}
        animate={{
          maxHeight: open.value ? 96 : 0,
          opacity: open.value ? 1 : 0,
        }}
      >
        {props.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            class={props.activePathname === link.href ? 'active' : 'inactive'}
            data-testid={`sidebar-shell-link-${props.id}-${link.label
              .toLowerCase()
              .replace(' ', '-')}`}
          >
            <span>{link.label}</span>
            <span data-testid={`sidebar-shell-link-state-${link.label.toLowerCase()}`}>
              {props.activePathname === link.href ? ' active' : ' inactive'}
            </span>
          </Link>
        ))}
      </motion.div>
    </section>
  )
}

export default (props: { children?: unknown }) => {
  const location = useLocation()

  return (
    <div>
      <nav aria-label="Sidebar shell navigation">
        <span data-testid="sidebar-shell-pathname">{location.pathname}</span>
        {sections.map((section) => (
          <SidebarSection
            key={section.id}
            activePathname={location.pathname}
            id={section.id}
            links={section.links}
            title={section.title}
          />
        ))}
      </nav>
      <main>{props.children}</main>
    </div>
  )
}
