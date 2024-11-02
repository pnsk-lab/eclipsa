import type { ViteHotContext } from 'vite/types/hot'
import type { Component } from '../component.ts'
import { useSignal } from '../signal.ts'
import type { JSX } from '../../jsx/jsx-runtime.ts'

export const initHot = (hot: ViteHotContext | undefined, stringURL: string, registry: HotRegistry) => {
  if (!hot) {
    return
  }
  const url = new URL(stringURL)
  const id = url.pathname

  hot.on('update-client', async data => {
    const hotTargetId: string = data.url
    if (hotTargetId === id) {
      // Update module
      const newModURL = new URL(hotTargetId, stringURL)
      newModURL.searchParams.append('t', Date.now().toString())
      const newMod = await import(/* @vite-ignore */newModURL.href)
      
      const newRegistry: HotRegistry | undefined = newMod.__eclipsa$hotRegistry
      if (!newRegistry) {
        return
      }
      for (const [name, newHotComponentData] of newRegistry.components) {
        const oldHotComponentData = registry.components.get(name)
        if (!oldHotComponentData) {
          // new component detected
          // full page reloading
          // TODO: without full page reloading
          console.info('[Eclipsa HMR]: New component detected, reloading page...')
          location.reload()
          return
        }
        if (oldHotComponentData.hash === newHotComponentData.hash) {
          // No change for this component
          // Do nothing
          return
        }
        // Run HMR
        oldHotComponentData.update(newHotComponentData.Component)
      }
    }
  })
}

interface ComponentMetaInput {
  registry: HotRegistry
  name: string
}
interface HotComponent {
  (): () => Component
}
export const defineHotComponent = (Component: Component, meta: ComponentMetaInput): HotComponent => {
  const comp = useSignal(Component)

  const hash = Component.toString() // TODO

  meta.registry.components.set(meta.name, {
    hash,
    update(newComponent) {
      comp.value = newComponent
    },
    Component
  })

  return () => () => comp.value
}

interface HotComponentData {
  hash: string
  update(newComponent: Component): void
  Component: Component
}
interface HotRegistry {
  components: Map<string, HotComponentData>
}
export const createHotRegistry = (): HotRegistry => {
  return {
    components: new Map()
  }
}
