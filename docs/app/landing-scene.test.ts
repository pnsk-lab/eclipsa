import { beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  cleanupCallbacks: [] as Array<() => void>,
}))

vi.mock('eclipsa', () => ({
  onCleanup(callback: () => void) {
    lifecycle.cleanupCallbacks.push(callback)
  },
}))

import { setupLandingScene } from './landing-scene.ts'

class FakeEventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()

  addEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set())
      }

      this.listeners.get(type)?.add(listener)
    },
  )

  removeEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      this.listeners.get(type)?.delete(listener)
    },
  )

  emit(type: string, event: object) {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener(event as Event)
        continue
      }

      listener.handleEvent(event as Event)
    }
  }
}

const createCanvas = () => {
  const drawCalls = {
    lineTo: [] as Array<[number, number]>,
    moveTo: [] as Array<[number, number]>,
  }

  const context = {
    beginPath() {},
    moveTo(x: number, y: number) {
      drawCalls.moveTo.push([x, y])
    },
    lineTo(x: number, y: number) {
      drawCalls.lineTo.push([x, y])
    },
    stroke() {},
    fillRect() {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'round',
  } as unknown as CanvasRenderingContext2D

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement

  return { canvas, drawCalls }
}

const stubDom = (options: { pointerEvents: boolean }) => {
  const windowTarget = new FakeEventTarget()
  const documentTarget = new FakeEventTarget()
  let animationFrame: FrameRequestCallback | undefined

  const fakeWindow = Object.assign(windowTarget, {
    innerWidth: 375,
    innerHeight: 667,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      animationFrame = callback
      return 1
    }),
    cancelAnimationFrame: vi.fn(),
    ...(options.pointerEvents ? { PointerEvent: class FakePointerEvent {} } : {}),
  })

  vi.stubGlobal('window', fakeWindow)
  vi.stubGlobal('document', documentTarget)

  return {
    documentTarget,
    runFrame() {
      animationFrame?.(0)
    },
  }
}

describe('setupLandingScene', () => {
  beforeEach(() => {
    lifecycle.cleanupCallbacks.length = 0
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the closest active touch pointer when multiple touch pointers are down', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const { canvas, drawCalls } = createCanvas()
    const { documentTarget, runFrame } = stubDom({ pointerEvents: true })

    setupLandingScene({ canvas })

    documentTarget.emit('pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      pointerType: 'touch',
    })
    documentTarget.emit('pointerdown', {
      clientX: 197.5,
      clientY: 356.625,
      pointerId: 2,
      pointerType: 'touch',
    })

    runFrame()

    expect(drawCalls.lineTo[0]?.[0]).toBeGreaterThan(drawCalls.moveTo[0]?.[0] ?? 0)
    expect(documentTarget.addEventListener).toHaveBeenCalledWith(
      'pointerup',
      expect.any(Function),
      expect.objectContaining({ passive: true }),
    )
  })

  it('falls back to all active touches when pointer events are unavailable', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const { canvas, drawCalls } = createCanvas()
    const { documentTarget, runFrame } = stubDom({ pointerEvents: false })

    setupLandingScene({ canvas })

    documentTarget.emit('touchmove', {
      changedTouches: [
        { clientX: 0, clientY: 0 },
        { clientX: 197.5, clientY: 356.625 },
      ],
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 197.5, clientY: 356.625 },
      ],
    })

    runFrame()

    expect(drawCalls.lineTo[0]?.[0]).toBeGreaterThan(drawCalls.moveTo[0]?.[0] ?? 0)
    expect(documentTarget.addEventListener).toHaveBeenCalledWith(
      'touchend',
      expect.any(Function),
      expect.objectContaining({ passive: true }),
    )
  })
})
