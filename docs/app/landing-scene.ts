import { onCleanup } from 'eclipsa'

const SHIELD_RADIUS = 100

export interface LandingElements {
  canvas: HTMLCanvasElement
  cursor: HTMLDivElement
  root: HTMLDivElement
}

export const setupLandingScene = ({ canvas, cursor, root }: LandingElements) => {
  const initialContext = canvas.getContext('2d')
  if (!initialContext) {
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

      if (distance > 0 && distance < SHIELD_RADIUS && dy < 0) {
        const force = (SHIELD_RADIUS - distance) / SHIELD_RADIUS
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
      SHIELD_RADIUS,
    )
    gradient.addColorStop(0, 'rgba(157, 0, 255, 0.08)')
    gradient.addColorStop(1, 'rgba(157, 0, 255, 0)')

    drawingContext.fillStyle = gradient
    drawingContext.beginPath()
    drawingContext.arc(mouseX, mouseY, SHIELD_RADIUS, Math.PI, 0)
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
    cursor.hidden = false
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

  onCleanup(() => {
    window.removeEventListener('resize', resize)
    document.removeEventListener('mousemove', handleMove)
    window.cancelAnimationFrame(animationFrame)

    for (const node of interactiveNodes) {
      node.removeEventListener('mouseenter', handleEnter)
      node.removeEventListener('mouseleave', handleLeave)
    }
  })
}
