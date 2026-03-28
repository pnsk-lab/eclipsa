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
          data-testid="resume-motion-toggle"
          aria-expanded={open.value}
          onClick={() => {
            open.value = !open.value
          }}
        >
          Toggle nav
        </button>
        <span data-testid="resume-motion-toggle-state">{open.value ? 'open' : 'closed'}</span>
        <motion.div
          data-testid="resume-motion-panel"
          initial={false}
          animate={{
            maxHeight: open.value ? 96 : 0,
            opacity: open.value ? 1 : 0,
          }}
          transition={{ duration: 0.12 }}
          class="overflow-hidden"
        >
          <Link
            href="/resume-motion-root/overview"
            class={location.pathname === '/resume-motion-root/overview' ? 'active' : 'inactive'}
            data-testid="resume-motion-overview-link"
          >
            Overview
          </Link>
          <Link
            href="/resume-motion-root/quick-start"
            class={location.pathname === '/resume-motion-root/quick-start' ? 'active' : 'inactive'}
            data-testid="resume-motion-quick-start-link"
          >
            Quick Start
          </Link>
        </motion.div>
      </nav>
      <main>{props.children}</main>
    </div>
  )
}
