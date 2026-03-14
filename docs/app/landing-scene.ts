import { onCleanup } from 'eclipsa'

const SHIELD_RADIUS = 100
const MOBILE_DROP_COUNT = 50
const DESKTOP_DROP_COUNT = 100
const MOBILE_BREAKPOINT = 768
const PASSIVE_EVENT_OPTIONS = { passive: true }

interface ShieldPoint {
  x: number
  y: number
}

export interface LandingElements {
  canvas: HTMLCanvasElement
}

export const setupLandingScene = ({ canvas }: LandingElements) => {
  const initialContext = canvas.getContext('2d')
  if (!initialContext) {
    return
  }
  const drawingContext: CanvasRenderingContext2D = initialContext

  let shieldPoints: ShieldPoint[] = [
    {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    },
  ]
  let width = 0
  let height = 0
  let animationFrame = 0
  const activeTouchPointers = new Map<number, ShieldPoint>()

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

      let strongestForce = 0
      let strongestDx = 0
      let strongestDistance = 0

      for (const shieldPoint of shieldPoints) {
        const dx = this.x - shieldPoint.x
        const dy = this.y - shieldPoint.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance > 0 && distance < SHIELD_RADIUS && dy < 0) {
          const force = (SHIELD_RADIUS - distance) / SHIELD_RADIUS
          if (force > strongestForce) {
            strongestForce = force
            strongestDx = dx
            strongestDistance = distance
          }
        }
      }

      if (strongestForce > 0 && strongestDistance > 0) {
        this.vx = (strongestDx / strongestDistance) * strongestForce * 20
        this.y -= this.speed * strongestForce * 0.8
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

  const repopulateDrops = () => {
    drops.length = 0
    const count = window.innerWidth < MOBILE_BREAKPOINT ? MOBILE_DROP_COUNT : DESKTOP_DROP_COUNT
    for (let index = 0; index < count; index += 1) {
      drops.push(new RainDrop())
    }
  }

  const resize = () => {
    width = canvas.width = window.innerWidth
    height = canvas.height = window.innerHeight
    repopulateDrops()
  }

  const updatePointerPosition = (clientX: number, clientY: number) => {
    shieldPoints = [{ x: clientX, y: clientY }]
  }

  const updateTouchPositions = (
    touches: ArrayLike<Pick<Touch, 'clientX' | 'clientY'>>,
  ) => {
    const nextShieldPoints: ShieldPoint[] = []

    for (let index = 0; index < touches.length; index += 1) {
      nextShieldPoints.push({
        x: touches[index].clientX,
        y: touches[index].clientY,
      })
    }

    if (nextShieldPoints.length > 0) {
      shieldPoints = nextShieldPoints
    }
  }

  const handleMove = (event: MouseEvent) => {
    updatePointerPosition(event.clientX, event.clientY)
  }

  const syncActiveTouchPointers = () => {
    if (activeTouchPointers.size > 0) {
      shieldPoints = Array.from(activeTouchPointers.values())
    }
  }

  const handlePointer = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      activeTouchPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      })
      syncActiveTouchPointers()
      return
    }

    updatePointerPosition(event.clientX, event.clientY)
  }

  const handlePointerEnd = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      return
    }

    activeTouchPointers.delete(event.pointerId)
    if (activeTouchPointers.size > 0) {
      syncActiveTouchPointers()
      return
    }

    updatePointerPosition(event.clientX, event.clientY)
  }

  const handleTouch = (event: TouchEvent) => {
    updateTouchPositions(event.touches.length > 0 ? event.touches : event.changedTouches)
  }

  const animate = () => {
    drawingContext.fillStyle = 'rgba(5, 5, 5, 0.3)'
    drawingContext.fillRect(0, 0, width, height)

    for (const drop of drops) {
      drop.update()
      drop.draw()
    }

    animationFrame = window.requestAnimationFrame(animate)
  }

  resize()

  if ('PointerEvent' in window) {
    document.addEventListener('pointerdown', handlePointer, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('pointermove', handlePointer, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('pointerup', handlePointerEnd, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('pointercancel', handlePointerEnd, PASSIVE_EVENT_OPTIONS)
  } else {
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('touchstart', handleTouch, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('touchmove', handleTouch, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('touchend', handleTouch, PASSIVE_EVENT_OPTIONS)
    document.addEventListener('touchcancel', handleTouch, PASSIVE_EVENT_OPTIONS)
  }

  window.addEventListener('resize', resize)
  animationFrame = window.requestAnimationFrame(animate)

  onCleanup(() => {
    window.removeEventListener('resize', resize)
    if ('PointerEvent' in window) {
      document.removeEventListener('pointerdown', handlePointer, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('pointermove', handlePointer, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('pointerup', handlePointerEnd, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('pointercancel', handlePointerEnd, PASSIVE_EVENT_OPTIONS)
    } else {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('touchstart', handleTouch, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('touchmove', handleTouch, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('touchend', handleTouch, PASSIVE_EVENT_OPTIONS)
      document.removeEventListener('touchcancel', handleTouch, PASSIVE_EVENT_OPTIONS)
    }
    window.cancelAnimationFrame(animationFrame)
  })
}
