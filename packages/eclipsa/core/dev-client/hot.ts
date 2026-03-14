import type { Component } from '../component.ts'
import { __eclipsaComponent, getComponentMeta } from '../internal.ts'
import type { JSX } from '../../jsx/jsx-runtime.ts'

interface ViteHotContext {
  off(event: string, listener: (data: { url: string }) => void): void
  on(event: string, listener: (data: { url: string }) => void): void
}

export const initHot = (
  hot: ViteHotContext | undefined,
  stringURL: string,
  registry: HotRegistry,
) => {
  if (!hot) {
    return
  }
  const url = new URL(stringURL)
  const id = url.pathname

  const handler: Parameters<typeof hot.on>[1] = async (data: { url: string }) => {
    const hotTargetId: string = data.url
    if (hotTargetId === id) {
      // Update module
      const newModURL = new URL(hotTargetId, stringURL)
      newModURL.searchParams.append('t', Date.now().toString())
      const newMod = await import(/* @vite-ignore */ newModURL.href)

      const newRegistry: HotRegistry | undefined = newMod.__eclipsa$hotRegistry
      if (!newRegistry) {
        return
      }
      newRegistry.setIsChild()
      if (applyHotUpdate(registry, newRegistry) === 'reload') {
        console.info('[Eclipsa HMR]: Component graph changed, reloading page...')
        location.reload()
      }
      hot.on('update-client', handler)
    }
  }
  registry.setIsChild = () => {
    hot.off('update-client', handler)
  }
  hot.on('update-client', handler)
}

interface ComponentMetaInput {
  registry: HotRegistry
  name: string
}
export const defineHotComponent = (Component: Component, meta: ComponentMetaInput): Component => {
  const current = { value: Component }
  const componentMeta = getComponentMeta(Component)

  meta.registry.components.set(meta.name, {
    update(newComponent) {
      current.value = newComponent
    },
    Component,
  })

  const HotComponent = (props: unknown) => {
    return current.value(props)
  }
  if (!componentMeta) {
    return HotComponent
  }
  return __eclipsaComponent(
    HotComponent,
    componentMeta.symbol,
    componentMeta.captures,
    componentMeta.projectionSlots,
  )
}

interface HotComponentData {
  update(newComponent: Component): void
  Component: Component
}
interface HotRegistry {
  components: Map<string, HotComponentData>
  setIsChild(): void
}

export const applyHotUpdate = (registry: HotRegistry, newRegistry: HotRegistry) => {
  if (registry.components.size !== newRegistry.components.size) {
    return 'reload' as const
  }

  for (const [name, newHotComponentData] of newRegistry.components) {
    const oldHotComponentData = registry.components.get(name)
    if (!oldHotComponentData) {
      return 'reload' as const
    }
    oldHotComponentData.update(newHotComponentData.Component)
  }

  return 'updated' as const
}

export const createHotRegistry = (): HotRegistry => {
  return {
    components: new Map(),
    setIsChild: () => null,
  }
}
