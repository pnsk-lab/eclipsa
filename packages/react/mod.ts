import type { Component } from 'eclipsa'
import { setExternalComponentMeta, type ExternalComponentMeta } from 'eclipsa/internal'
import { createElement, type ComponentType, type ReactElement } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

const SLOT_HOST_TAG = 'e-slot-host'

interface ReactExternalInstance {
  root: Root
  slotDom: Map<string, Node[]>
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

const captureSlotDom = (host: HTMLElement, slotNames: string[]) => {
  const preserved = new Map<string, Node[]>()
  if (typeof host.querySelector !== 'function') {
    for (const name of slotNames) {
      preserved.set(name, [])
    }
    return preserved
  }
  for (const name of slotNames) {
    const slotHost = host.querySelector(`${SLOT_HOST_TAG}[data-e-slot="${name}"]`)
    if (!slotHost) {
      preserved.set(name, [])
      continue
    }
    preserved.set(name, [...slotHost.childNodes])
  }
  return preserved
}

const restoreSlotDom = (host: HTMLElement, slotDom: Map<string, Node[]>) => {
  if (typeof host.querySelector !== 'function') {
    return
  }
  for (const [name, nodes] of slotDom) {
    const slotHost = host.querySelector(`${SLOT_HOST_TAG}[data-e-slot="${name}"]`)
    if (!slotHost) {
      continue
    }
    for (const child of [...slotHost.childNodes]) {
      child.remove()
    }
    for (const node of nodes) {
      slotHost.appendChild(node)
    }
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

const toReactProps = (props: Record<string, unknown>, slotNames: string[]) => {
  const nextProps: Record<string, unknown> = { ...props }
  for (const name of slotNames) {
    nextProps[name] = createElement(SLOT_HOST_TAG, {
      'data-e-slot': name,
      suppressHydrationWarning: true,
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
      const slotDom = captureSlotDom(host, slotNames)
      const root = hydrateRoot(
        host,
        createElement(component, toReactProps(props, slotNames) as TProps) as ReactElement,
      )
      await waitForExternalDomCommit()
      restoreSlotDom(host, slotDom)
      return {
        root,
        slotDom,
      } satisfies ReactExternalInstance
    },
    kind: 'react',
    renderToString(props) {
      return renderToString(
        createElement(component, toReactProps(props, slotNames) as TProps) as ReactElement,
      )
    },
    slots: slotNames,
    async unmount(instance) {
      const resolved = instance as ReactExternalInstance | Root | undefined
      if (!resolved) {
        return
      }
      if ('root' in resolved) {
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
      root.render(
        createElement(component, toReactProps(props, slotNames) as TProps) as ReactElement,
      )
      await waitForExternalDomCommit()
      if ('root' in resolved && slotDom) {
        restoreSlotDom(host, slotDom)
        resolved.slotDom = slotDom
      }
      return resolved
    },
  }

  return setExternalComponentMeta((() => null) as Component<TProps>, meta)
}
