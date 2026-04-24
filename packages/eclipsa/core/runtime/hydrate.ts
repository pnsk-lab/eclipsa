import type { Component } from '../component.ts'
import { renderNodes, type Insertable } from './dom-compiled.ts'
import { setRuntimeSymbols } from './kernel.ts'

export const hydrate = (
  Component: Component,
  target: HTMLElement,
  options?: {
    snapshot?: unknown[]
    symbols?: Record<string, string>
  },
) => {
  setRuntimeSymbols(options?.symbols)
  if (target.childNodes.length > 0 || options?.snapshot != null) {
    void import('eclipsa/runtime/resume').then((client) =>
      client.hydrate(Component, target, options),
    )
    return
  }

  const nodes = renderNodes((Component as () => Insertable)())
  for (const node of nodes) {
    target.appendChild(node)
  }
}
