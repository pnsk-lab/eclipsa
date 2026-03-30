import { Link, onCleanup, onMount, useSignal } from 'eclipsa'
import { setupLandingScene } from './landing-scene.ts'

export default () => {
  const canvasRef = useSignal<HTMLCanvasElement | undefined>()

  onMount(() => {
    const canvas = canvasRef.value

    if (!canvas) {
      return
    }

    const cleanup = setupLandingScene({ canvas })
    onCleanup(() => {
      cleanup()
    })
  })

  return (
    <div class="relative flex min-h-screen flex-col overflow-x-hidden bg-[#050505] text-white antialiased font-space-grotesk selection:bg-purple-500 selection:text-white">
      <div
        aria-hidden="true"
        class="pointer-events-none fixed inset-0 z-0 bg-[image:linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:50px_50px]"
      ></div>
      <canvas
        aria-hidden="true"
        class="pointer-events-none fixed inset-0 z-[1] h-screen w-screen"
        ref={canvasRef}
      ></canvas>

      <div
        class="relative z-20 flex h-170 max-h-screen flex-col px-4 pb-20 pt-20 text-center"
        id="hero"
      >
        <h1 class="uppercase relative z-10 mb-8 mt-15 w-full select-none text-black text-[clamp(3rem,8vw,8rem)] leading-[0.75] tracking-[-0.02em] text-white font-archivo-black">
          The{' '}
          <span class="bg-gradient-to-r from-[#9d00ff] to-[#7700ff] bg-clip-text text-transparent">
            Final
          </span>
          -Gen Frontend Framework
        </h1>

        <div class="z-20 mt-10 flex flex-col items-center">
          <p class="mb-6 max-w-3xl text-xl font-bold uppercase tracking-wide text-white font-archivo-black md:text-2xl">
            Ultrafast development, ultrafast apps.
          </p>

          <div class="flex flex-col gap-6 sm:flex-row">
            <button
              class="relative isolate flex items-center justify-center gap-3 overflow-hidden border border-[rgba(157,0,255,0.5)] px-10 py-4 text-sm font-bold uppercase tracking-[0.1em] text-white transition duration-300 before:absolute before:inset-y-0 before:left-[-100%] before:-z-10 before:w-full before:bg-[linear-gradient(90deg,transparent,rgba(157,0,255,0.4),transparent)] before:content-[''] before:transition-[left] before:duration-500 hover:border-[#9d00ff] hover:shadow-[0_0_20px_rgba(157,0,255,0.4)] hover:before:left-[100%]"
              data-interactive=""
              type="button"
            >
              <svg
                aria-hidden="true"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="m4 17 6-6-6-6" />
                <path d="M12 19h8" />
              </svg>
              <span>npm create eclipsa@latest</span>
            </button>

            <Link
              class="self-center border-b border-transparent pb-1 text-sm font-bold uppercase tracking-[0.3em] text-zinc-400 transition-all hover:border-[#9d00ff] hover:text-white"
              data-interactive=""
              href="/docs/getting-started/overview"
            >
              Read the Docs
            </Link>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        class="relative z-20 mx-0 my-16 h-[2px] w-full bg-[linear-gradient(90deg,transparent,#9d00ff,transparent)] shadow-[0_0_15px_#9d00ff]"
      ></div>

      <section class="relative z-20 mx-auto w-full max-w-7xl px-6 py-20" id="features">
        <div class="grid grid-cols-1 gap-8 md:grid-cols-3">
          <article
            class="group rounded-lg border border-white/5 border-t-[rgba(157,0,255,0.3)] bg-[rgba(20,20,25,0.6)] p-8 backdrop-blur-[10px] transition duration-300 hover:-translate-y-2"
            data-interactive=""
          >
            <div class="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(157,0,255,0.1)] transition duration-300 group-hover:scale-110">
              <svg
                aria-hidden="true"
                class="h-6 w-6 text-[#9d00ff]"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M6 19a4 4 0 1 1 .7-7.9A6 6 0 1 1 18 14h1a3 3 0 1 1 0 6Z" />
                <path d="m13 11-4 6h3l-1 6 4-6h-3Z" />
              </svg>
            </div>
            <h2 class="mb-3 text-xl uppercase tracking-wide text-white font-archivo-black">
              Resumable by Default
            </h2>
            <p class="text-sm leading-relaxed text-zinc-400">
              SSR ships resumable metadata for components, signals, visible callbacks, and watches
              so the client can wake up only the interactive work it actually needs.
            </p>
          </article>

          <article
            class="group rounded-lg border border-white/5 border-t-[rgba(157,0,255,0.3)] bg-[rgba(20,20,25,0.6)] p-8 backdrop-blur-[10px] transition duration-300 hover:-translate-y-2"
            data-interactive=""
          >
            <div class="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(157,0,255,0.1)] transition duration-300 group-hover:scale-110">
              <svg
                aria-hidden="true"
                class="h-6 w-6 text-[#9d00ff]"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M22 12a10 10 0 0 0-20 0Z" />
                <path d="M12 12v6a2 2 0 0 0 4 0" />
              </svg>
            </div>
            <h2 class="mb-3 text-xl uppercase tracking-wide text-white font-archivo-black">
              DOM-Compiled Client
            </h2>
            <p class="text-sm leading-relaxed text-zinc-400">
              Client transforms emit direct DOM operations instead of a generic hydration runtime,
              keeping updates narrow and aligned with the SSR output.
            </p>
          </article>

          <article
            class="group relative overflow-hidden rounded-lg border border-white/5 border-t-[rgba(157,0,255,0.3)] bg-[rgba(20,20,25,0.6)] p-8 backdrop-blur-[10px] transition duration-300 hover:-translate-y-2"
            data-interactive=""
          >
            <div
              aria-hidden="true"
              class="pointer-events-none absolute -bottom-4 -right-4 opacity-10"
            >
              <svg
                aria-hidden="true"
                class="h-32 w-32 text-[#9d00ff]"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M7 16a5 5 0 1 0 10 0c0-2.8-2.4-6.5-5-10-2.6 3.5-5 7.2-5 10Z" />
                <path d="M5 8a2.5 2.5 0 1 0 5 0c0-1.4-1.2-3.3-2.5-5C6.2 4.7 5 6.6 5 8Z" />
                <path d="M14 5a2 2 0 1 0 4 0c0-1.1-1-2.6-2-4-1 1.4-2 2.9-2 4Z" />
              </svg>
            </div>
            <div class="relative z-10 mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(157,0,255,0.1)] transition duration-300 group-hover:scale-110">
              <svg
                aria-hidden="true"
                class="h-6 w-6 text-[#9d00ff]"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M7 16a5 5 0 1 0 10 0c0-2.8-2.4-6.5-5-10-2.6 3.5-5 7.2-5 10Z" />
                <path d="M5 8a2.5 2.5 0 1 0 5 0c0-1.4-1.2-3.3-2.5-5C6.2 4.7 5 6.6 5 8Z" />
                <path d="M14 5a2 2 0 1 0 4 0c0-1.1-1-2.6-2-4-1 1.4-2 2.9-2 4Z" />
              </svg>
            </div>
            <h2 class="relative z-10 mb-3 text-xl uppercase tracking-wide text-white font-archivo-black">
              Full-Stack Primitives
            </h2>
            <p class="relative z-10 text-sm leading-relaxed text-zinc-400">
              Routing, loaders, actions, and symbol-aware Vite integration live in one pipeline, so
              SSR, resume, dev HMR, and build output stay consistent.
            </p>
          </article>
        </div>
      </section>

      <footer
        class="relative z-20 mt-10 border-t border-white/5 py-10 text-center text-sm text-zinc-500"
        id="footer"
      >
        <p>&copy; 2025 pnsk-lab MIT License.</p>
      </footer>
    </div>
  )
}
