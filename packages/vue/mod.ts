import type { Component } from 'eclipsa'
import { setExternalComponentMeta, type ExternalComponentMeta } from 'eclipsa/internal'
import {
  createSSRApp,
  h,
  nextTick,
  shallowReactive,
  type App,
  type Component as VueComponent,
  type VNode,
} from 'vue'
import { renderToString } from 'vue/server-renderer'

const SLOT_HOST_TAG = 'e-slot-host'

interface VueExternalInstance {
  app: App
  slotDom: Map<string, Node[]>
  state: {
    props: Record<string, unknown>
  }
  slotNames: string[]
}

const waitForExternalDomCommit = async () => {
  await nextTick()
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        resolve()
      })
      return
    }
    setTimeout(resolve, 0)
  })
}

const findSlotHost = (host: HTMLElement, name: string) => {
  if (typeof host.querySelectorAll !== 'function') {
    return host.querySelector?.(`${SLOT_HOST_TAG}[data-e-slot="${name}"]`) ?? null
  }
  const matches = [...host.querySelectorAll<HTMLElement>(`${SLOT_HOST_TAG}[data-e-slot="${name}"]`)]
  if (matches.length === 0) {
    return null
  }
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = matches[index]!
    if (candidate.childNodes.length > 0 || (candidate.innerHTML ?? '') !== '') {
      return candidate
    }
  }
  return matches[0]!
}

const captureSlotDom = (host: HTMLElement, slotNames: string[]) => {
  const captured = new Map<string, Node[]>()
  if (typeof host.querySelector !== 'function') {
    for (const name of slotNames) {
      captured.set(name, [])
    }
    return captured
  }
  for (const name of slotNames) {
    const slotHost = findSlotHost(host, name)
    captured.set(name, slotHost ? [...slotHost.childNodes] : [])
  }
  return captured
}

const mergeSlotDom = (previous: Map<string, Node[]> | undefined, next: Map<string, Node[]>) => {
  const merged = new Map<string, Node[]>()
  for (const [name, nodes] of next) {
    if (nodes.length === 0 && (previous?.get(name)?.length ?? 0) > 0) {
      merged.set(name, previous!.get(name)!)
      continue
    }
    merged.set(name, nodes)
  }
  return merged
}

const restoreSlotNodes = (slotHost: Element, nodes: Node[]) => {
  if (
    slotHost.childNodes.length === nodes.length &&
    nodes.every((node, index) => slotHost.childNodes[index] === node)
  ) {
    return
  }
  while (slotHost.firstChild) {
    slotHost.firstChild.remove()
  }
  for (const node of nodes) {
    slotHost.appendChild(node)
  }
}

const restoreSlotDom = (host: HTMLElement, slotDom?: Map<string, Node[]>) => {
  if (!slotDom || typeof host.querySelector !== 'function') {
    return
  }
  for (const [name, nodes] of slotDom) {
    const slotHost = findSlotHost(host, name)
    if (!slotHost) {
      continue
    }
    restoreSlotNodes(slotHost, nodes)
  }
}

const scheduleSlotDomRestore = (host: HTMLElement, instance: VueExternalInstance) => {
  instance.slotDom = mergeSlotDom(instance.slotDom, captureSlotDom(host, instance.slotNames))
  restoreSlotDom(host, instance.slotDom)
  if (typeof setTimeout !== 'function') {
    return
  }
  for (const delay of [0, 16, 100]) {
    setTimeout(() => {
      instance.slotDom = mergeSlotDom(instance.slotDom, captureSlotDom(host, instance.slotNames))
      restoreSlotDom(host, instance.slotDom)
    }, delay)
  }
}

const toVueInput = (props: Record<string, unknown>, slotNames: string[]) => {
  const nextProps: Record<string, unknown> = { ...props }
  const slots: Record<string, () => VNode> = {}
  for (const name of slotNames) {
    if (name === 'children') {
      delete nextProps.children
      slots.default = () =>
        h(SLOT_HOST_TAG, {
          'data-allow-mismatch': 'children',
          'data-e-slot': name,
        })
      continue
    }
    delete nextProps[name]
    slots[name] = () =>
      h(SLOT_HOST_TAG, {
        'data-allow-mismatch': 'children',
        'data-e-slot': name,
      })
  }
  return {
    props: nextProps,
    slots,
  }
}

const createVueRoot = (
  component: VueComponent,
  state: {
    props: Record<string, unknown>
  },
  slotNames: string[],
) => ({
  render() {
    const { props, slots } = toVueInput(state.props, slotNames)
    return h(component as VueComponent, props, slots)
  },
})

const syncRecord = (target: Record<string, unknown>, next: Record<string, unknown>) => {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(next, key)) {
      delete target[key]
    }
  }
  for (const [key, value] of Object.entries(next)) {
    target[key] = value
  }
}

export const eclipsifyVue = <TProps extends Record<string, unknown>>(
  component: VueComponent,
  options?: {
    slots?: readonly string[]
  },
): Component<TProps> => {
  const slotNames = [...(options?.slots ?? ['children'])]
  const meta: ExternalComponentMeta = {
    async hydrate(host, props) {
      let slotDom = captureSlotDom(host, slotNames)
      const componentId =
        host.getAttribute('data-e-external-snapshot') ??
        host.getAttribute('data-e-external-component')
      const snapshotStore = (
        globalThis as typeof globalThis & {
          __eclipsaExternalSlotSnapshotStore?: Record<
            string,
            {
              dom?: Map<string, Node[]>
            }
          >
        }
      ).__eclipsaExternalSlotSnapshotStore
      const snapshotMap = (
        globalThis as typeof globalThis & {
          __eclipsaExternalSlotSnapshotMap?: Map<
            HTMLElement,
            {
              dom?: Map<string, Node[]>
            }
          >
        }
      ).__eclipsaExternalSlotSnapshotMap
      const snapshotEntry =
        (componentId ? snapshotStore?.[componentId] : undefined) ??
        (() => {
          if (!snapshotStore) {
            return undefined
          }
          const entries = Object.values(snapshotStore)
          return entries.length === 1 ? entries[0] : undefined
        })()
      const snapshotByHost = snapshotMap?.get(host)
      if ([...slotDom.values()].every((nodes) => nodes.length === 0)) {
        slotDom = snapshotByHost?.dom ?? snapshotEntry?.dom ?? slotDom
      }
      const state = shallowReactive({
        props: { ...props } as Record<string, unknown>,
      })
      const app = createSSRApp(createVueRoot(component, state, slotNames))
      app.mount(host)
      await waitForExternalDomCommit()
      const instance = {
        app,
        slotDom,
        state,
        slotNames,
      } satisfies VueExternalInstance
      scheduleSlotDomRestore(host, instance)
      return instance
    },
    kind: 'vue',
    async renderToString(props) {
      const app = createSSRApp({
        render() {
          const input = toVueInput(props, slotNames)
          return h(component as VueComponent, input.props, input.slots)
        },
      })
      return renderToString(app)
    },
    slots: slotNames,
    async unmount(instance) {
      ;(instance as VueExternalInstance | undefined)?.app.unmount()
    },
    async update(instance, host, props) {
      const resolved = instance as VueExternalInstance
      const slotDom = mergeSlotDom(resolved.slotDom, captureSlotDom(host, slotNames))
      syncRecord(resolved.state.props, props)
      await waitForExternalDomCommit()
      resolved.slotDom = slotDom
      scheduleSlotDomRestore(host, resolved)
      return resolved
    },
  }

  return setExternalComponentMeta((() => null) as Component<TProps>, meta)
}
