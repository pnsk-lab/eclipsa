import clsx from 'clsx'
import { motion } from '@eclipsa/motion'
import { Link, loader, useLocation, useSignal } from 'eclipsa'
import type { JSX } from 'eclipsa/jsx-runtime'
import { getDocPage } from '../content'

type DocLink = {
  href: string
  label: string
}

type DocSection = {
  icon: string
  links: DocLink[]
  title: string
  gradientClass: string
}

type TocHeading = {
  depth: number
  slug: string
  text: string
}

const DOC_SECTIONS: DocSection[] = [
  {
    title: 'Getting Started',
    icon: 'i-tabler-north-star',
    links: [
      { label: 'Overview', href: '/docs/getting-started/overview' },
      { label: 'Quick Start', href: '/docs/getting-started/quick-start' },
    ],
    gradientClass: 'bg-linear-to-br from-emerald-700 to-teal-400',
  },
  {
    title: 'Materials',
    icon: 'i-tabler-square-rotated',
    links: [
      { label: 'Routing', href: '/docs/materials/routing' },
      { label: 'Signal', href: '/docs/materials/signal' },
      { label: 'Atom', href: '/docs/materials/atom' },
      { label: 'Lifecycle', href: '/docs/materials/lifecycle' },
      { label: 'Loader', href: '/docs/materials/loader' },
      { label: 'Action', href: '/docs/materials/action' },
    ],
    gradientClass: 'bg-linear-to-br from-blue-700 to-cyan-400',
  },
  {
    title: 'Integrations',
    icon: 'i-tabler-plug-connected',
    links: [
      { label: 'Motion', href: '/docs/integrations/motion' },
      { label: 'Ox Content', href: '/docs/integrations/content' },
    ],
    gradientClass: 'bg-linear-to-br from-purple-700 to-pink-400',
  },
]

const useDocPage = loader(async (c) => {
  try {
    return await getDocPage(c.req.param('slug'))
  } catch {
    return null
  }
})

const Dir = (props: {
  activeHref: string
  links: { href: string; label: string }[]
  title: string
  icon: string
  gradientClass: string
  onLinkClick?: () => void
}) => {
  const { activeHref, icon, links, title, onLinkClick } = props
  const open = useSignal(true)
  const handleLinkClick = () => {
    onLinkClick?.()
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open.value}
        class="mb-1 flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-xl py-1 transition-colors hover:bg-[color:var(--docs-panel-hover)] active:bg-[color:var(--docs-panel-hover)]"
        onClick={() => {
          open.value = !open.value
        }}
      >
        <div class={`${props.gradientClass} rounded-lg p-1`}>
          <div class={`${icon} text-white`} />
        </div>
        <div class="text-[color:var(--docs-text)] text-base font-medium">{title}</div>
        <div class="grow" />
        <motion.div
          class="i-tabler-chevron-down"
          initial={false}
          animate={{
            rotate: open.value ? 0 : -90,
          }}
          transition={{
            duration: 0.2,
          }}
        />
      </button>
      <motion.div
        class="overflow-hidden"
        initial={false}
        animate={{
          maxHeight: open.value ? links.length * 32 : 0,
          opacity: open.value ? 1 : 0,
          y: open.value ? 0 : -4,
        }}
        transition={{
          duration: 0.2,
        }}
      >
        {links.map((link) =>
          onLinkClick ? (
            <Link
              key={link.href}
              href={link.href}
              class={clsx(
                'flex h-8 items-center rounded-lg transition-colors',
                activeHref === link.href
                  ? 'bg-[color:var(--docs-accent-bg)] text-[color:var(--docs-accent-fg)]'
                  : 'hover:bg-[color:var(--docs-accent-bg-soft)] text-[color:var(--docs-text-muted)]',
              )}
              onClick={handleLinkClick}
            >
              <div
                class={clsx(
                  'h-full w-px bg-[color:var(--docs-border-strong)] transition-all',
                  activeHref === link.href ? 'scale-y-60 bg-[color:var(--docs-accent-line)]' : '',
                )}
              ></div>
              <div class="pl-4 py-1 text-sm">{link.label}</div>
            </Link>
          ) : (
            <Link
              key={link.href}
              href={link.href}
              class={clsx(
                'flex h-8 items-center rounded-lg transition-colors',
                activeHref === link.href
                  ? 'bg-[color:var(--docs-accent-bg)] text-[color:var(--docs-accent-fg)]'
                  : 'hover:bg-[color:var(--docs-accent-bg-soft)] text-[color:var(--docs-text-muted)]',
              )}
            >
              <div
                class={clsx(
                  'h-full w-px bg-[color:var(--docs-border-strong)] transition-all',
                  activeHref === link.href ? 'scale-y-60 bg-[color:var(--docs-accent-line)]' : '',
                )}
              ></div>
              <div class="pl-4 py-1 text-sm">{link.label}</div>
            </Link>
          ),
        )}
      </motion.div>
    </div>
  )
}

const OnThisPageNav = (props: {
  headings: TocHeading[]
  titleClass?: string
  wrapperClass?: string
}) => {
  const { headings, titleClass, wrapperClass } = props

  return (
    <div class={clsx('flex flex-col gap-4', wrapperClass)}>
      <div
        class={clsx(
          'flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--docs-text-soft)]',
          titleClass,
        )}
      >
        <div class="i-tabler-list-details text-base" />
        <span>On this page</span>
      </div>

      <div class="flex flex-col gap-1.5">
        {headings.map((heading) => (
          <OnThisPageLink key={heading.slug} heading={heading} />
        ))}
      </div>
    </div>
  )
}

const OnThisPageLink = (props: { heading: TocHeading }) => {
  const { heading } = props
  const jumpToHeading = (slug: string) => {
    if (typeof document === 'undefined') return
    const target = document.getElementById(slug)
    if (!(target instanceof HTMLElement)) return
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    history.replaceState(null, '', `#${slug}`)
  }

  return (
    <a
      class={clsx(
        'rounded-xl px-3 py-2 text-sm leading-5 text-[color:var(--docs-text-muted)] transition-colors hover:bg-[color:var(--docs-panel-hover)] hover:text-[color:var(--docs-text)]',
        heading.depth > 2 ? 'ml-4 text-[13px] text-[color:var(--docs-text-soft)]' : '',
      )}
      href={`#${heading.slug}`}
      onClick={(event) => {
        event.preventDefault()
        jumpToHeading(heading.slug)
      }}
    >
      {heading.text}
    </a>
  )
}

export default function DocsLayout(props: { children: JSX.Childable }) {
  const loc = useLocation()
  const page = useDocPage()
  const mobileNavOpen = useSignal(false)
  const currentDocLabel =
    DOC_SECTIONS.flatMap((section) => section.links).find((link) => link.href === loc.pathname)
      ?.label ?? 'Browse Docs'
  const tocHeadings = (page.data?.headings ?? []).filter(
    (heading) => heading.depth > 1 && heading.depth <= 3,
  )

  const blurActiveElement = () => {
    if (typeof document === 'undefined') return
    if (!(document.activeElement instanceof HTMLElement)) return
    document.activeElement.blur()
  }

  const closeMobileNav = () => {
    blurActiveElement()
    mobileNavOpen.value = false
  }

  return (
    <div class="flex w-full flex-col px-4 pb-12 pt-0 sm:px-6 md:pt-18 lg:flex-row lg:items-start lg:px-8">
      <div class="-mx-4 sticky top-0 z-[60] border-y border-[color:var(--docs-border)] bg-[color:var(--docs-nav-bg)] text-[color:var(--docs-text)] backdrop-blur sm:-mx-6 lg:hidden">
        <div class="flex items-center justify-between px-4 py-3 sm:px-6">
          <button
            aria-controls="docs-mobile-drawer"
            aria-expanded={mobileNavOpen.value}
            class="flex items-center gap-3 text-sm font-semibold"
            data-testid="docs-mobile-nav-toggle"
            type="button"
            onClick={() => {
              mobileNavOpen.value = !mobileNavOpen.value
            }}
          >
            <div class="i-tabler-menu-2 text-base" />
            <span>Menu</span>
          </button>

          <div class="truncate text-sm font-medium text-[color:var(--docs-text-muted)]">
            {currentDocLabel}
          </div>
        </div>
      </div>

      <div
        class={clsx(
          'fixed inset-0 z-[60] transition-opacity lg:hidden',
          mobileNavOpen.value ? '' : 'pointer-events-none',
        )}
        id="docs-mobile-drawer-shell"
      >
        <button
          class={clsx(
            'absolute inset-0 bg-black/45 transition-opacity',
            mobileNavOpen.value ? 'opacity-100' : 'opacity-0',
          )}
          type="button"
          onClick={closeMobileNav}
        />

        <motion.aside
          aria-label="Docs navigation"
          class="absolute inset-y-0 left-0 flex w-[82vw] max-w-sm flex-col overflow-y-auto border-r border-[color:var(--docs-border)] bg-[color:var(--docs-panel)] px-4 pb-8 pt-6 text-[color:var(--docs-text-muted)] shadow-[24px_0_80px_rgba(15,23,42,0.16)] sm:px-5"
          id="docs-mobile-drawer"
          initial={false}
          animate={{
            opacity: mobileNavOpen.value ? 1 : 0,
            x: mobileNavOpen.value ? 0 : -36,
          }}
          transition={{
            duration: 0.24,
          }}
        >
          <div class="mb-4 flex items-center justify-between border-b border-[color:var(--docs-border)] pb-4">
            <div>
              <div class="text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--docs-text-soft)]">
                Docs
              </div>
              <div class="mt-1 text-lg font-semibold text-[color:var(--docs-text)]">
                {currentDocLabel}
              </div>
            </div>
            <button
              aria-label="Close docs navigation"
              class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--docs-border)] text-[color:var(--docs-text)] transition-colors hover:bg-[color:var(--docs-panel-hover)]"
              type="button"
              onClick={closeMobileNav}
            >
              <div class="i-tabler-x text-lg" />
            </button>
          </div>

          <div class="flex flex-col gap-4 text-[color:var(--docs-text-muted)]">
            {DOC_SECTIONS.map((section) => (
              <Dir
                key={section.title}
                activeHref={loc.pathname}
                icon={section.icon}
                links={[...section.links]}
                title={section.title}
                gradientClass={section.gradientClass}
                onLinkClick={closeMobileNav}
              />
            ))}
          </div>
        </motion.aside>
      </div>

      <div class="hidden text-[color:var(--docs-text-muted)] lg:sticky lg:top-22 lg:flex lg:w-72 lg:shrink-0 lg:self-start lg:flex-col lg:gap-4 lg:px-2 lg:py-6">
        {DOC_SECTIONS.map((section) => (
          <Dir
            key={section.title}
            activeHref={loc.pathname}
            icon={section.icon}
            links={[...section.links]}
            title={section.title}
            gradientClass={section.gradientClass}
          />
        ))}
      </div>

      <div class="min-w-0 flex-1 pt-6 lg:px-8">
        <div class="mx-auto max-w-2xl">{props.children}</div>
      </div>

      <aside class="hidden lg:sticky lg:top-22 lg:flex lg:w-64 lg:shrink-0 lg:self-start lg:justify-end lg:py-6">
        <OnThisPageNav headings={tocHeadings} wrapperClass="w-full max-w-56" />
      </aside>
    </div>
  )
}
