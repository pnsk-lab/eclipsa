import { motion } from '@eclipsa/motion'
import { Link, useLocation, useSignal } from 'eclipsa'

export default (props: { children?: unknown }) => {
  const open = useSignal(true)
  const location = useLocation()

  return (
    <div>
      <nav>
        <button
          type="button"
          data-testid="slot-motion-nav-toggle"
          aria-expanded={open.value}
          onClick={() => {
            open.value = !open.value
          }}
        >
          Toggle nav
        </button>
        <span data-testid="slot-motion-nav-toggle-state">{open.value ? 'open' : 'closed'}</span>
        <motion.div
          data-testid="slot-motion-nav-panel"
          initial={false}
          animate={{
            maxHeight: open.value ? 96 : 0,
            opacity: open.value ? 1 : 0,
          }}
          transition={{ duration: 0.12 }}
          class="overflow-hidden"
        >
          <Link
            href="/slot-motion-nav/overview"
            class={location.pathname === '/slot-motion-nav/overview' ? 'active' : 'inactive'}
            data-testid="slot-motion-nav-overview-link"
          >
            Overview
          </Link>
          <Link
            href="/slot-motion-nav/quick-start"
            class={location.pathname === '/slot-motion-nav/quick-start' ? 'active' : 'inactive'}
            data-testid="slot-motion-nav-quick-start-link"
          >
            Quick Start
          </Link>
        </motion.div>
      </nav>
      <main>{props.children}</main>
    </div>
  )
}
