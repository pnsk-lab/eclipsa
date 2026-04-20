import { getRuntimeContainer } from '../core/runtime.ts'
import { onCleanup, onMount, useSignal, type Signal } from '../core/signal.ts'

export interface ScrollPosition {
  x: number
  y: number
}

export type ScrollTargetSignal<T extends Element = Element> = Signal<T | undefined>

const readDocumentScrollPosition = (doc: Document) => {
  const scrollingElement =
    doc.scrollingElement ??
    (doc as Document & { documentElement?: Element | null }).documentElement ??
    doc.body
  const view = doc.defaultView

  return {
    x: view?.scrollX ?? view?.pageXOffset ?? scrollingElement?.scrollLeft ?? 0,
    y: view?.scrollY ?? view?.pageYOffset ?? scrollingElement?.scrollTop ?? 0,
  }
}

const readElementScrollPosition = (element: Element) => ({
  x: element.scrollLeft ?? 0,
  y: element.scrollTop ?? 0,
})

export const useScroll = <T extends Element = Element>(
  target?: ScrollTargetSignal<T>,
): Signal<ScrollPosition> => {
  const position = useSignal<ScrollPosition>({
    x: 0,
    y: 0,
  })
  const runtimeDocument =
    getRuntimeContainer()?.doc ?? (typeof document !== 'undefined' ? document : undefined)

  onMount(() => {
    const doc = target?.value?.ownerDocument ?? runtimeDocument
    if (!doc) {
      return
    }

    const scrollTarget = target?.value
    const eventTarget = scrollTarget ?? doc
    const update = () => {
      const next = scrollTarget
        ? readElementScrollPosition(scrollTarget)
        : readDocumentScrollPosition(doc)
      if (position.value.x === next.x && position.value.y === next.y) {
        return
      }
      position.value = next
    }

    update()
    eventTarget.addEventListener('scroll', update, { passive: true })
    onCleanup(() => {
      eventTarget.removeEventListener('scroll', update)
    })
  })

  return position
}
