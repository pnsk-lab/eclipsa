import { getRuntimeContainer } from '../core/runtime.ts'
import { onCleanup, onMount, useSignal, type Signal } from '../core/signal.ts'

export interface BoundingClientRect {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
  x: number
  y: number
}

export type BoundingClientRectTargetSignal<T extends Element = Element> = Signal<T | undefined>

const createEmptyBoundingClientRect = (): BoundingClientRect => ({
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
})

const readBoundingClientRect = (element: Element): BoundingClientRect => {
  const rect = element.getBoundingClientRect()
  return {
    bottom: rect.bottom ?? 0,
    height: rect.height ?? 0,
    left: rect.left ?? 0,
    right: rect.right ?? 0,
    top: rect.top ?? 0,
    width: rect.width ?? 0,
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
  }
}

const areBoundingClientRectsEqual = (a: BoundingClientRect, b: BoundingClientRect) =>
  a.bottom === b.bottom &&
  a.height === b.height &&
  a.left === b.left &&
  a.right === b.right &&
  a.top === b.top &&
  a.width === b.width &&
  a.x === b.x &&
  a.y === b.y

export const useBoundingClientRect = <T extends Element = Element>(
  target: BoundingClientRectTargetSignal<T>,
): Signal<BoundingClientRect> => {
  const rect = useSignal<BoundingClientRect>(createEmptyBoundingClientRect())
  const runtimeDocument =
    getRuntimeContainer()?.doc ?? (typeof document !== 'undefined' ? document : undefined)

  onMount(() => {
    const element = target.value
    const doc = element?.ownerDocument ?? runtimeDocument
    const view = doc?.defaultView

    if (!element) {
      return
    }

    const update = () => {
      const next = readBoundingClientRect(element)
      if (areBoundingClientRectsEqual(rect.value, next)) {
        return
      }
      rect.value = next
    }

    update()
    doc?.addEventListener('scroll', update, { capture: true, passive: true })
    view?.addEventListener('scroll', update, { passive: true })
    view?.addEventListener('resize', update)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(update)
      resizeObserver.observe(element)
    }

    onCleanup(() => {
      doc?.removeEventListener('scroll', update, true)
      view?.removeEventListener('scroll', update)
      view?.removeEventListener('resize', update)
      resizeObserver?.disconnect()
    })
  })

  return rect
}

export const useBoudingClientRect = useBoundingClientRect
