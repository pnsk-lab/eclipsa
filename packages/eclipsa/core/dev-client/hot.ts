import type { Component } from '../component.ts'
import {
  __eclipsaComponent,
  getComponentMeta,
  getExternalComponentMeta,
  setExternalComponentMeta,
} from '../internal.ts'

const HOT_COMPONENT_TARGET_KEY = Symbol.for('eclipsa.hot-component-target')

interface ViteHotContext {
  off(event: string, listener: (data: { url: string }) => void): void
  on(event: string, listener: (data: { url: string }) => void): void
}

const unwrapHotComponent = (Component: Component): Component =>
  ((Component as Component & { [HOT_COMPONENT_TARGET_KEY]?: Component })[
    HOT_COMPONENT_TARGET_KEY
  ] ?? Component) as Component

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
      hot.off('update-client', handler)
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
  const current = { value: unwrapHotComponent(Component) }
  const componentMeta = getComponentMeta(Component)
  const externalMeta = getExternalComponentMeta(Component)

  meta.registry.components.set(meta.name, {
    update(newComponent) {
      current.value = unwrapHotComponent(newComponent)
    },
    Component: current.value,
  })

  const HotComponent = ((props: unknown) => {
    return current.value(props)
  }) as Component & {
    [HOT_COMPONENT_TARGET_KEY]?: Component
  }
  HotComponent[HOT_COMPONENT_TARGET_KEY] = current.value
  if (!componentMeta) {
    return externalMeta ? setExternalComponentMeta(HotComponent, externalMeta) : HotComponent
  }
  const wrapped = __eclipsaComponent(
    HotComponent,
    componentMeta.symbol,
    componentMeta.captures,
    componentMeta.projectionSlots,
    {
      external: componentMeta.external,
      optimizedRoot: componentMeta.optimizedRoot,
    },
  )
  return externalMeta ? setExternalComponentMeta(wrapped, externalMeta) : wrapped
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
