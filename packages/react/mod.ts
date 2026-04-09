import type { Component } from 'eclipsa'
import { setExternalComponentMeta, type ExternalComponentMeta } from 'eclipsa/internal'
import {
  Component as ReactComponent,
  createElement,
  type ComponentType,
  type ReactElement,
} from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

const SLOT_HOST_TAG = 'e-slot-host'

interface ReactExternalInstance {
  observer?: MutationObserver
  restoreScheduled: boolean
  restoring: boolean
  root: Root
  slotDom: Map<string, Node[]>
  slotHtml: Map<string, string>
  slotNames: string[]
}

const restoreSlotNodes = (slotHost: Element, nodes: Node[]) => {
  if (
    slotHost.childNodes.length === nodes.length &&
    nodes.every((node, index) => slotHost.childNodes[index] === node)
  ) {
    return
  }
  for (const child of [...slotHost.childNodes]) {
    child.remove()
  }
  for (const node of nodes) {
    slotHost.appendChild(node)
  }
}

class ExternalSlotHost extends ReactComponent<{
  name: string
  slotState: Pick<ReactExternalInstance, 'slotDom' | 'slotHtml'>
}> {
  private host: HTMLElement | null = null

  componentDidMount() {
    this.restore()
  }

  componentDidUpdate() {
    this.restore()
  }

  private restore() {
    if (!this.host) {
      return
    }
    restoreSlotNodes(this.host, this.props.slotState.slotDom.get(this.props.name) ?? [])
    this.props.slotState.slotHtml.delete(this.props.name)
  }

  render() {
    const html = this.props.slotState.slotHtml.get(this.props.name) ?? ''
    return createElement(SLOT_HOST_TAG, {
      'data-e-slot': this.props.name,
      ...(html === '' ? {} : { dangerouslySetInnerHTML: { __html: html } }),
      ref: (node: Element | null) => {
        this.host = node as HTMLElement | null
        if (this.host) {
          restoreSlotNodes(this.host, this.props.slotState.slotDom.get(this.props.name) ?? [])
          this.props.slotState.slotHtml.delete(this.props.name)
        }
      },
      suppressHydrationWarning: true,
    })
  }
}

const waitForExternalDomCommit = async () => {
  await new Promise<void>((resolve) => {
    queueMicrotask(resolve)
  })
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
  const matches = [
    ...host.querySelectorAll<HTMLElement>(`${SLOT_HOST_TAG}[data-e-slot="${name}"]`),
  ]
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
  const preserved = new Map<string, Node[]>()
  if (typeof host.querySelector !== 'function') {
    for (const name of slotNames) {
      preserved.set(name, [])
    }
    return preserved
  }
  for (const name of slotNames) {
    const slotHost = findSlotHost(host, name)
    if (!slotHost) {
      preserved.set(name, [])
      continue
    }
    preserved.set(name, [...slotHost.childNodes])
  }
  return preserved
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
    const slotHost = findSlotHost(host, name)
    captured.set(name, slotHost?.innerHTML ?? '')
  }
  return captured
}

const restoreSlotDom = (host: HTMLElement, slotDom: Map<string, Node[]>) => {
  if (typeof host.querySelector !== 'function') {
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

const scheduleSlotDomRestore = (host: HTMLElement, instance: ReactExternalInstance) => {
  if (instance.restoreScheduled) {
    return
  }
  instance.restoreScheduled = true
  queueMicrotask(() => {
    instance.restoreScheduled = false
    instance.restoring = true
    try {
      instance.slotDom = mergeSlotDom(instance.slotDom, captureSlotDom(host, instance.slotNames))
      restoreSlotDom(host, instance.slotDom)
    } finally {
      instance.restoring = false
    }
  })
}

const scheduleDeferredSlotDomRestore = (host: HTMLElement, instance: ReactExternalInstance) => {
  scheduleSlotDomRestore(host, instance)
  if (typeof setTimeout !== 'function') {
    return
  }
  for (const delay of [0, 16, 100]) {
    setTimeout(() => {
      scheduleSlotDomRestore(host, instance)
    }, delay)
  }
}

const observeSlotDom = (
  host: HTMLElement,
  slotNames: string[],
  instance: ReactExternalInstance,
) => {
  if (typeof MutationObserver !== 'function') {
    return
  }
  const observer = new MutationObserver(() => {
    if (instance.restoring) {
      return
    }
    instance.slotDom = mergeSlotDom(instance.slotDom, captureSlotDom(host, slotNames))
    scheduleSlotDomRestore(host, instance)
  })
  observer.observe(host, {
    childList: true,
    subtree: true,
  })
  instance.observer = observer
}

const toReactProps = (
  props: Record<string, unknown>,
  slotNames: string[],
  slotState: Pick<ReactExternalInstance, 'slotDom' | 'slotHtml'>,
) => {
  const nextProps: Record<string, unknown> = { ...props }
  for (const name of slotNames) {
    nextProps[name] = createElement(ExternalSlotHost, {
      key: `slot:${name}`,
      name,
      slotState,
    })
  }
  return nextProps
}

export const eclipsifyReact = <TProps extends Record<string, unknown>>(
  component: ComponentType<TProps>,
  options?: {
    slots?: readonly string[]
  },
): Component<TProps> => {
  const slotNames = [...(options?.slots ?? ['children'])]
  const meta: ExternalComponentMeta = {
    async hydrate(host, props) {
      let slotDom = captureSlotDom(host, slotNames)
      let slotHtml = captureSlotHtml(host, slotNames)
      const componentId =
        host.getAttribute('data-e-external-snapshot') ??
        host.getAttribute('data-e-external-component')
      const snapshotStore = (globalThis as typeof globalThis & {
        __eclipsaExternalSlotSnapshotStore?: Record<
          string,
          {
            dom?: Map<string, Node[]>
            html?: Map<string, string>
          }
        >
      }).__eclipsaExternalSlotSnapshotStore
      const snapshotMap = (globalThis as typeof globalThis & {
        __eclipsaExternalSlotSnapshotMap?: Map<
          HTMLElement,
          {
            dom?: Map<string, Node[]>
            html?: Map<string, string>
          }
        >
      }).__eclipsaExternalSlotSnapshotMap
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
      if ([...slotHtml.values()].every((html) => html === '')) {
        slotHtml = snapshotByHost?.html ?? snapshotEntry?.html ?? slotHtml
      }
      const instance: ReactExternalInstance = {
        restoreScheduled: false,
        restoring: false,
        root: null as unknown as Root,
        slotDom,
        slotHtml,
        slotNames,
      }
      const root = hydrateRoot(
        host,
        createElement(component, toReactProps(props, slotNames, instance) as TProps) as ReactElement,
      )
      instance.root = root
      observeSlotDom(host, slotNames, instance)
      await waitForExternalDomCommit()
      scheduleDeferredSlotDomRestore(host, instance)
      await waitForExternalDomCommit()
      return instance
    },
    kind: 'react',
    renderToString(props) {
      return renderToString(
        createElement(
          component,
          toReactProps(props, slotNames, { slotDom: new Map(), slotHtml: new Map() }) as TProps,
        ) as ReactElement,
      )
    },
    slots: slotNames,
    async unmount(instance) {
      const resolved = instance as ReactExternalInstance | Root | undefined
      if (!resolved) {
        return
      }
      if ('root' in resolved) {
        resolved.observer?.disconnect()
        resolved.root.unmount()
        return
      }
      resolved.unmount()
    },
    async update(instance, host, props) {
      const resolved = instance as ReactExternalInstance | Root
      const root = 'root' in resolved ? resolved.root : resolved
      const slotDom =
        'root' in resolved
          ? mergeSlotDom(resolved.slotDom, captureSlotDom(host, slotNames))
          : undefined
      if ('root' in resolved && slotDom) {
        resolved.slotDom = slotDom
      }
      const slotState = 'root' in resolved ? resolved : { slotDom: new Map(), slotHtml: new Map() }
      root.render(
        createElement(component, toReactProps(props, slotNames, slotState) as TProps) as ReactElement,
      )
      await waitForExternalDomCommit()
      if ('root' in resolved && slotDom) {
        scheduleDeferredSlotDomRestore(host, resolved)
        await waitForExternalDomCommit()
      }
      return resolved
    },
  }

  return setExternalComponentMeta((() => null) as Component<TProps>, meta)
}
