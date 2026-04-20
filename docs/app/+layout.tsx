import { motion } from '@eclipsa/motion'
import { Link, onMount, useLocation, useSignal } from 'eclipsa'
import { Logo } from '../components/logo'
import { DocsSearchDialog } from './docs/SearchDialog'
import './style.css'
import clsx from 'clsx'

type DocsTheme = 'light' | 'dark'

const DOCS_THEME_STORAGE_KEY = 'eclipsa-docs-theme'

export default (props: { children?: unknown }) => {
  const loc = useLocation()
  const isHome = loc.pathname === '/'
  const isDocsRoute = loc.pathname.startsWith('/docs')
  const mobileMenuOpen = useSignal(false)
  const docsTheme = useSignal<DocsTheme>('light')

  const applyDocsTheme = (nextTheme: DocsTheme) => {
    docsTheme.value = nextTheme

    if (typeof document === 'undefined') return
    document.documentElement.dataset.docsTheme = nextTheme
  }

  const toggleDocsTheme = () => {
    const nextTheme = docsTheme.value === 'dark' ? 'light' : 'dark'
    applyDocsTheme(nextTheme)

    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(DOCS_THEME_STORAGE_KEY, nextTheme)
    } catch {}
  }

  onMount(() => {
    if (typeof window === 'undefined') return

    try {
      const stored = window.localStorage.getItem(DOCS_THEME_STORAGE_KEY)
      applyDocsTheme(
        stored === 'light' || stored === 'dark'
          ? stored
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light',
      )
    } catch {
      applyDocsTheme('light')
    }
  })

  const blurActiveElement = () => {
    if (typeof document === 'undefined') return
    if (!(document.activeElement instanceof HTMLElement)) return
    document.activeElement.blur()
  }

  const closeMobileMenu = () => {
    blurActiveElement()
    mobileMenuOpen.value = false
  }

  return (
    <div
      class={clsx(
        isDocsRoute && 'min-h-screen bg-[color:var(--docs-bg)] text-[color:var(--docs-text)]',
      )}
    >
      <nav
        class={clsx(
          'z-50 flex w-full items-center justify-between px-4 py-4 sm:px-6',
          isHome || !isDocsRoute ? 'fixed top-0' : 'md:fixed md:top-0',
          isHome
            ? 'bg-[linear-gradient(to_bottom,rgba(5,5,5,1),rgba(5,5,5,0))] text-white'
            : isDocsRoute
              ? 'border-b border-[color:var(--docs-border)] bg-[color:var(--docs-nav-bg)] text-[color:var(--docs-text)] backdrop-blur md:border-transparent md:bg-transparent'
              : 'text-zinc-900',
        )}
      >
        <Link
          class="flex items-center gap-2 text-xl font-urbanist"
          data-interactive=""
          href="/"
          onClick={closeMobileMenu}
        >
          <Logo class="w-5 h-5" />
          <span>eclipsa</span>
        </Link>

        <div
          class={clsx(
            'hidden items-center gap-8 text-sm font-bold uppercase tracking-[0.3em] md:flex',
            isHome
              ? 'text-zinc-400'
              : isDocsRoute
                ? 'text-[color:var(--docs-text-muted)]'
                : 'text-zinc-500',
          )}
        >
          <Link
            class={clsx(
              'transition-colors',
              isHome
                ? 'hover:text-white'
                : isDocsRoute
                  ? 'hover:text-[color:var(--docs-text)]'
                  : 'hover:text-zinc-950',
            )}
            data-interactive=""
            href={`${import.meta.env.BASE_URL}docs/getting-started/overview`}
            onClick={closeMobileMenu}
          >
            Docs
          </Link>
          <Link
            class={clsx(
              'transition-colors',
              isHome
                ? 'hover:text-white'
                : isDocsRoute
                  ? 'hover:text-[color:var(--docs-text)]'
                  : 'hover:text-zinc-950',
            )}
            data-interactive=""
            href={`${import.meta.env.BASE_URL}playground`}
            onClick={closeMobileMenu}
            reloadDocument
          >
            Playground
          </Link>
        </div>

        <div class="flex items-center gap-2">
          {isDocsRoute && <DocsSearchDialog />}
          {isDocsRoute && (
            <button
              aria-label={`Switch to ${docsTheme.value === 'dark' ? 'light' : 'dark'} mode`}
              class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--docs-panel)] text-[color:var(--docs-text)] transition-colors hover:bg-[color:var(--docs-panel-hover)]"
              data-interactive=""
              data-testid="docs-theme-toggle"
              title={`Current theme: ${docsTheme.value}`}
              type="button"
              onClick={toggleDocsTheme}
            >
              <div
                aria-hidden="true"
                class={clsx(
                  docsTheme.value === 'dark' ? 'i-tabler-sun-high' : 'i-tabler-moon-stars',
                  'text-lg',
                )}
              />
            </button>
          )}
          <a
            aria-label="Discord"
            class={clsx(
              'transition-colors hover:text-[#5865F2]',
              isHome
                ? 'text-white'
                : isDocsRoute
                  ? 'text-[color:var(--docs-text)]'
                  : 'text-zinc-900',
            )}
            data-interactive=""
            href="https://discord.gg/cKbScerjFK"
          >
            <div aria-hidden="true" class="i-simple-icons-discord h-6 w-6" />
          </a>
          <a
            aria-label="GitHub"
            class={clsx(
              'transition-colors hover:text-[#9d00ff]',
              isHome
                ? 'text-white'
                : isDocsRoute
                  ? 'text-[color:var(--docs-text)]'
                  : 'text-zinc-900',
            )}
            data-interactive=""
            href="https://github.com/pnsk-lab/eclipsa"
          >
            <div aria-hidden="true" class="i-simple-icons-github h-6 w-6" />
          </a>

          <button
            aria-controls="site-mobile-menu"
            aria-expanded={mobileMenuOpen.value}
            aria-label="Toggle site navigation"
            class={clsx(
              'inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors md:hidden',
              isHome
                ? 'border border-white/10 text-white hover:border-white/30 hover:bg-white/5'
                : isDocsRoute
                  ? 'border border-[color:var(--docs-border)] text-[color:var(--docs-text)] hover:bg-[color:var(--docs-panel-hover)]'
                  : 'border border-zinc-300 text-zinc-900 hover:border-zinc-400 hover:bg-white/70',
            )}
            data-interactive=""
            type="button"
            onClick={() => {
              mobileMenuOpen.value = !mobileMenuOpen.value
            }}
          >
            <div class={clsx(mobileMenuOpen.value ? 'i-tabler-x' : 'i-tabler-menu-2', 'text-xl')} />
          </button>
        </div>
      </nav>

      <div
        class={clsx(
          'fixed inset-0 z-[80] md:hidden',
          mobileMenuOpen.value ? '' : 'pointer-events-none',
        )}
        id="site-mobile-menu-shell"
      >
        <motion.div
          class="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
          initial={false}
          animate={{
            opacity: mobileMenuOpen.value ? 1 : 0,
          }}
          transition={{
            duration: 0.18,
          }}
        >
          <button class="absolute inset-0" type="button" onClick={closeMobileMenu} />
        </motion.div>

        <motion.div
          class="absolute inset-x-4 top-18 rounded-3xl border border-[color:var(--docs-border)] bg-[color:var(--docs-panel)] p-3 text-sm font-bold uppercase tracking-[0.24em] text-[color:var(--docs-text-muted)] shadow-[var(--docs-shadow)] backdrop-blur-xl"
          id="site-mobile-menu"
          initial={false}
          animate={{
            opacity: mobileMenuOpen.value ? 1 : 0,
            scale: mobileMenuOpen.value ? 1 : 0.97,
            y: mobileMenuOpen.value ? 0 : -12,
          }}
          transition={{
            duration: 0.22,
          }}
        >
          <div class="flex flex-col gap-1">
            <Link
              class="rounded-2xl px-4 py-3 transition-colors hover:bg-[color:var(--docs-panel-hover)] hover:text-[color:var(--docs-text)]"
              data-interactive=""
              href={`${import.meta.env.BASE_URL}docs/getting-started/overview`}
              onClick={closeMobileMenu}
            >
              Docs
            </Link>
            <Link
              class="rounded-2xl px-4 py-3 transition-colors hover:bg-[color:var(--docs-panel-hover)] hover:text-[color:var(--docs-text)]"
              data-interactive=""
              href={`${import.meta.env.BASE_URL}playground`}
              onClick={closeMobileMenu}
              reloadDocument
            >
              Playground
            </Link>
          </div>
        </motion.div>
      </div>

      <div>{props.children}</div>
    </div>
  )
}
