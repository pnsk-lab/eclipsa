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
  slotHtml: Map<string, string>
  state: {
    props: Record<string, unknown>
  }
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

const captureSlotHtml = (host: HTMLElement, slotNames: string[]) => {
  const captured = new Map<string, string>()
  if (typeof host.querySelector !== 'function') {
    for (const name of slotNames) {
      captured.set(name, '')
    }
    return captured
  }
  for (const name of slotNames) {
    const slotHost = host.querySelector<HTMLElement>(`${SLOT_HOST_TAG}[data-e-slot="${name}"]`)
    captured.set(name, slotHost?.innerHTML ?? '')
  }
  return captured
}

const mergeSlotHtml = (previous: Map<string, string> | undefined, next: Map<string, string>) => {
  const merged = new Map<string, string>()
  for (const [name, html] of next) {
    if (html === '' && (previous?.get(name) ?? '') !== '') {
      merged.set(name, previous!.get(name)!)
      continue
    }
    merged.set(name, html)
  }
  return merged
}

const restoreSlotHtml = (host: HTMLElement, slotHtml?: Map<string, string>) => {
  if (!slotHtml || typeof host.querySelector !== 'function') {
    return
  }
  for (const [name, html] of slotHtml) {
    const slotHost = host.querySelector<HTMLElement>(`${SLOT_HOST_TAG}[data-e-slot="${name}"]`)
    if (!slotHost || slotHost.innerHTML === html) {
      continue
    }
    slotHost.innerHTML = html
  }
}

const scheduleSlotHtmlRestore = (host: HTMLElement, slotHtml: Map<string, string>) => {
  restoreSlotHtml(host, slotHtml)
  if (typeof setTimeout !== 'function') {
    return
  }
  for (const delay of [0, 16, 100]) {
    setTimeout(() => {
      restoreSlotHtml(host, slotHtml)
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
      const slotHtml = captureSlotHtml(host, slotNames)
      const state = shallowReactive({
        props: { ...props } as Record<string, unknown>,
      })
      const app = createSSRApp(createVueRoot(component, state, slotNames))
      app.mount(host)
      await waitForExternalDomCommit()
      scheduleSlotHtmlRestore(host, slotHtml)
      return {
        app,
        slotHtml,
        state,
      } satisfies VueExternalInstance
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
      const slotHtml = mergeSlotHtml(resolved.slotHtml, captureSlotHtml(host, slotNames))
      syncRecord(resolved.state.props, props)
      await waitForExternalDomCommit()
      scheduleSlotHtmlRestore(host, slotHtml)
      resolved.slotHtml = slotHtml
      return resolved
    },
  }

  return setExternalComponentMeta((() => null) as Component<TProps>, meta)
}
