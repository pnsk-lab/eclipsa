import { component$, onVisible, useSignal } from 'eclipsa'

type Cleanup = () => void

export default component$(() => {
  const rootRef = useSignal<HTMLDivElement | undefined>()
  const canvasRef = useSignal<HTMLCanvasElement | undefined>()
  const cursorRef = useSignal<HTMLDivElement | undefined>()

  onVisible(() => {
    const globalWindow = window as Window & {
      __eclipsaLandingCleanup__?: Cleanup
    }
    const root = rootRef.value
    const canvas = canvasRef.value
    const cursor = cursorRef.value

    globalWindow.__eclipsaLandingCleanup__?.()
    if (!root || !canvas || !cursor) {
      globalWindow.__eclipsaLandingCleanup__ = undefined
      return
    }

    const initialContext = canvas.getContext('2d')
    if (!initialContext) {
      globalWindow.__eclipsaLandingCleanup__ = undefined
      return
    }
    const drawingContext: CanvasRenderingContext2D = initialContext

    const prefersFinePointer = window.matchMedia?.('(pointer: fine)').matches ?? true
    const interactiveNodes = prefersFinePointer
      ? Array.from(root.querySelectorAll<HTMLElement>('[data-interactive]'))
      : []

    let mouseX = window.innerWidth / 2
    let mouseY = window.innerHeight / 2
    let width = 0
    let height = 0
    let animationFrame = 0
    const shieldRadius = 100

    class RainDrop {
      x = 0
      y = 0
      z = 1
      len = 0
      speed = 0
      color = ''
      vx = 0

      constructor() {
        this.reset()
        this.y = Math.random() * height
      }

      reset() {
        this.x = Math.random() * width
        this.y = -Math.random() * 100
        this.z = Math.random() * 0.5 + 0.5
        this.len = Math.random() * 20 + 10
        this.speed = (Math.random() * 15 + 10) * this.z
        this.color = `rgba(157, 0, 255, ${Math.random() * 0.4 + 0.1})`
        this.vx = 0
      }

      update() {
        this.y += this.speed
        this.x += this.vx
        this.vx *= 0.95

        const dx = this.x - mouseX
        const dy = this.y - mouseY
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance > 0 && distance < shieldRadius && dy < 0) {
          const force = (shieldRadius - distance) / shieldRadius
          this.vx = (dx / distance) * force * 20
          this.y -= this.speed * force * 0.8
        }

        if (this.y > height || this.x < 0 || this.x > width) {
          this.reset()
        }
      }

      draw() {
        drawingContext.beginPath()
        drawingContext.moveTo(this.x, this.y)
        drawingContext.lineTo(this.x - this.vx, this.y - this.len)
        drawingContext.strokeStyle = this.color
        drawingContext.lineWidth = 1.5 * this.z
        drawingContext.lineCap = 'round'
        drawingContext.stroke()
      }
    }

    const drops: RainDrop[] = []

    const syncCursor = () => {
      cursor.style.left = `${mouseX}px`
      cursor.style.top = `${mouseY}px`
    }

    const repopulateDrops = () => {
      drops.length = 0
      const count = window.innerWidth < 768 ? 150 : 400
      for (let index = 0; index < count; index += 1) {
        drops.push(new RainDrop())
      }
    }

    const resize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
      repopulateDrops()
    }

    const handleMove = (event: MouseEvent) => {
      mouseX = event.clientX
      mouseY = event.clientY
      syncCursor()
    }

    const handleEnter = () => {
      cursor.classList.add('h-[60px]', 'w-[60px]', 'bg-[rgba(157,0,255,0.1)]')
      cursor.classList.remove('h-10', 'w-10')
    }

    const handleLeave = () => {
      cursor.classList.remove('h-[60px]', 'w-[60px]', 'bg-[rgba(157,0,255,0.1)]')
      cursor.classList.add('h-10', 'w-10')
    }

    const animate = () => {
      drawingContext.fillStyle = 'rgba(5, 5, 5, 0.3)'
      drawingContext.fillRect(0, 0, width, height)

      const gradient = drawingContext.createRadialGradient(
        mouseX,
        mouseY,
        0,
        mouseX,
        mouseY,
        shieldRadius,
      )
      gradient.addColorStop(0, 'rgba(157, 0, 255, 0.08)')
      gradient.addColorStop(1, 'rgba(157, 0, 255, 0)')

      drawingContext.fillStyle = gradient
      drawingContext.beginPath()
      drawingContext.arc(mouseX, mouseY, shieldRadius, Math.PI, 0)
      drawingContext.fill()

      for (const drop of drops) {
        drop.update()
        drop.draw()
      }

      animationFrame = window.requestAnimationFrame(animate)
    }

    resize()
    syncCursor()

    if (prefersFinePointer) {
      document.addEventListener('mousemove', handleMove)
      for (const node of interactiveNodes) {
        node.addEventListener('mouseenter', handleEnter)
        node.addEventListener('mouseleave', handleLeave)
      }
    } else {
      cursor.hidden = true
    }

    window.addEventListener('resize', resize)
    animationFrame = window.requestAnimationFrame(animate)

    globalWindow.__eclipsaLandingCleanup__ = () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('mousemove', handleMove)
      window.cancelAnimationFrame(animationFrame)

      for (const node of interactiveNodes) {
        node.removeEventListener('mouseenter', handleEnter)
        node.removeEventListener('mouseleave', handleLeave)
      }
    }
  })

  return (
    <div
      class="relative flex min-h-screen flex-col overflow-x-hidden bg-[#050505] text-white antialiased [font-family:'Space_Grotesk',sans-serif] selection:bg-purple-500 selection:text-white cursor-none"
      ref={rootRef}
    >
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
        aria-hidden="true"
        class="pointer-events-none fixed left-0 top-0 z-[9999] h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgba(157,0,255,0.5)] shadow-[0_0_20px_rgba(157,0,255,0.3)] mix-blend-screen transition-[width,height,background-color] duration-200"
        ref={cursorRef}
      ></div>

      <nav class="fixed top-0 z-50 flex w-full items-center justify-between bg-[linear-gradient(to_bottom,rgba(5,5,5,1),rgba(5,5,5,0))] px-6 py-6">
        <a
          class="flex items-center gap-2 text-xl font-bold uppercase tracking-[0.2em] [font-family:'Archivo_Black',sans-serif] cursor-none"
          data-interactive=""
          href="#hero"
        >
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
          <span>Eclipsa</span>
        </a>

        <div class="hidden items-center gap-8 text-sm font-bold uppercase tracking-[0.3em] text-zinc-400 md:flex">
          <a class="transition-colors hover:text-white cursor-none" data-interactive="" href="#hero">
            Docs
          </a>
          <a
            class="transition-colors hover:text-white cursor-none"
            data-interactive=""
            href="#features"
          >
            Components
          </a>
          <a
            class="transition-colors hover:text-white cursor-none"
            data-interactive=""
            href="#footer"
          >
            Ecosystem
          </a>
        </div>

        <a
          aria-label="GitHub"
          class="text-white transition-colors hover:text-[#9d00ff] cursor-none"
          data-interactive=""
          href="#"
        >
          <svg
            aria-hidden="true"
            class="h-6 w-6"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20.1 4.77 5.07 5.07 0 0 0 20 1s-1.18-.35-4 1.48a13.38 13.38 0 0 0-7 0C6.18.65 5 1 5 1a5.07 5.07 0 0 0-.1 3.77A5.44 5.44 0 0 0 3.5 8.5c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
          </svg>
        </a>
      </nav>

      <main
        class="relative z-20 flex min-h-screen flex-1 flex-col items-center justify-center px-4 pb-20 pt-32 text-center"
        id="hero"
      >
        <h1 class="relative z-10 mb-8 w-full select-none text-[clamp(5rem,22vw,20rem)] leading-[0.75] tracking-[-0.02em] text-white [font-family:'Archivo_Black',sans-serif]">
          eclipsa
        </h1>

        <div class="z-20 mt-2 flex flex-col items-center">
          <p class="mb-6 text-sm font-bold uppercase tracking-[0.3em] text-[#9d00ff] md:text-base">
            The Storm is Here
          </p>
          <p class="mb-6 max-w-3xl text-xl font-bold uppercase tracking-wide text-white [font-family:'Archivo_Black',sans-serif] md:text-2xl">
            Final-Generation Web Framework
          </p>
          <p class="mx-auto mb-12 max-w-2xl text-sm font-medium leading-relaxed text-zinc-400 md:text-base">
            Beautifully crafted, uncompromisingly fast.
            <br class="hidden md:block" />
            Eclipsa provides the ultimate umbrella against the chaos of modern web
            development.
          </p>

          <div class="flex flex-col gap-6 sm:flex-row">
            <button
              class="relative isolate flex items-center justify-center gap-3 overflow-hidden border border-[rgba(157,0,255,0.5)] px-10 py-4 text-sm font-bold uppercase tracking-[0.1em] text-white transition duration-300 before:absolute before:inset-y-0 before:left-[-100%] before:-z-10 before:w-full before:bg-[linear-gradient(90deg,transparent,rgba(157,0,255,0.4),transparent)] before:content-[''] before:transition-[left] before:duration-500 hover:border-[#9d00ff] hover:shadow-[0_0_20px_rgba(157,0,255,0.4)] hover:before:left-[100%] cursor-none"
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

            <a
              class="self-center border-b border-transparent pb-1 text-sm font-bold uppercase tracking-[0.3em] text-zinc-400 transition-all hover:border-[#9d00ff] hover:text-white cursor-none"
              data-interactive=""
              href="#features"
            >
              Read the Docs
            </a>
          </div>
        </div>
      </main>

      <div
        aria-hidden="true"
        class="mx-0 my-16 h-[2px] w-full bg-[linear-gradient(90deg,transparent,#9d00ff,transparent)] shadow-[0_0_15px_#9d00ff]"
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
            <h2 class="mb-3 text-xl uppercase tracking-wide text-white [font-family:'Archivo_Black',sans-serif]">
              Lightning Fast
            </h2>
            <p class="text-sm leading-relaxed text-zinc-400">
              Zero-overhead rendering. Eclipsa compiles away leaving only pure,
              optimized JavaScript that hits your users like a lightning strike.
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
            <h2 class="mb-3 text-xl uppercase tracking-wide text-white [font-family:'Archivo_Black',sans-serif]">
              Rainproof State
            </h2>
            <p class="text-sm leading-relaxed text-zinc-400">
              A deeply integrated, unbreakable state management system that keeps
              your data dry and predictable, no matter how heavy the downpour.
            </p>
          </article>

          <article
            class="group relative overflow-hidden rounded-lg border border-white/5 border-t-[rgba(157,0,255,0.3)] bg-[rgba(20,20,25,0.6)] p-8 backdrop-blur-[10px] transition duration-300 hover:-translate-y-2"
            data-interactive=""
          >
            <div aria-hidden="true" class="pointer-events-none absolute -bottom-4 -right-4 opacity-10">
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
            <h2 class="relative z-10 mb-3 text-xl uppercase tracking-wide text-white [font-family:'Archivo_Black',sans-serif]">
              Fluid Design
            </h2>
            <p class="relative z-10 text-sm leading-relaxed text-zinc-400">
              Built-in styling solutions that flow naturally across breakpoints.
              Eclipsa makes responsive design as effortless as water flowing
              downhill.
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
})
