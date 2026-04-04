import { getRuntimeContainer } from '../core/runtime.ts'
import { onCleanup, onMount, useSignal, type Signal } from '../core/signal.ts'

export interface WindowSize {
  height: number
  width: number
}

const readWindowSize = (view: Window) => ({
  height: view.innerHeight ?? 0,
  width: view.innerWidth ?? 0,
})

export const useWindowSize = (): Signal<WindowSize> => {
  const windowSize = useSignal<WindowSize>({
    height: 0,
    width: 0,
  })
  const runtimeWindow =
    getRuntimeContainer()?.doc?.defaultView ?? (typeof window !== 'undefined' ? window : undefined)

  onMount(() => {
    const view = runtimeWindow
    if (!view) {
      return
    }

    const update = () => {
      const next = readWindowSize(view)
      if (windowSize.value.width === next.width && windowSize.value.height === next.height) {
        return
      }
      windowSize.value = next
    }

    update()
    view.addEventListener('resize', update)
    onCleanup(() => {
      view.removeEventListener('resize', update)
    })
  })

  return windowSize
}
