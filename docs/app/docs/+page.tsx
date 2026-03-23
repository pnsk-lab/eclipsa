import { Link, loader, type MetadataContext } from 'eclipsa'
import { Logo } from '../../components/logo.tsx'
import { getFirstDocHref } from './content.ts'

export const metadata = ({ url }: MetadataContext) => ({
  canonical: url.pathname,
  title: 'Docs',
})

const useDocsRedirect = loader(async () => {
  return {
    href: await getFirstDocHref(),
  }
})

export default () => {
  const redirect = useDocsRedirect()
  const href = redirect.data?.href ?? '/docs'

  return (
    <div class="min-h-screen bg-[radial-gradient(circle_at_top,rgba(157,0,255,0.14),transparent_32%),linear-gradient(180deg,#050505,#0b0b10)] text-white font-space-grotesk">
      <div
        aria-hidden="true"
        class="pointer-events-none fixed inset-0 bg-[image:linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:44px_44px]"
      ></div>

      <header class="relative z-10 border-b border-white/8 bg-black/30 backdrop-blur-xl">
        <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link class="flex items-center gap-3 text-white" href="/">
            <Logo class="h-5 w-5" />
            <span class="text-sm font-bold uppercase tracking-[0.28em]">eclipsa</span>
          </Link>
          <Link class="text-xs font-bold uppercase tracking-[0.28em] text-zinc-400 hover:text-white" href="/">
            Home
          </Link>
        </div>
      </header>

      <main class="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 px-6 py-14">
        <div class="space-y-3">
          <p class="text-xs font-bold uppercase tracking-[0.32em] text-[#ff7a00]">Docs</p>
          <h1 class="text-[clamp(2.6rem,7vw,4.5rem)] leading-[0.95] tracking-[-0.04em] font-archivo-black">
            Redirecting to the docs page
          </h1>
          <p class="max-w-2xl text-base leading-8 text-zinc-300">
            The docs route is generated from markdown content and prerendered at build time.
          </p>
        </div>

        <section class="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
          <script dangerouslySetInnerHTML={`location.replace(${JSON.stringify(href)})`} />
          <p class="text-sm leading-7 text-zinc-300">
            If the redirect does not happen automatically, continue to{' '}
            <Link class="font-bold text-[#ff7a00] hover:text-white" href={href}>
              {href}
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  )
}
