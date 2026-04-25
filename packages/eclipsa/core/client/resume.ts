import { jsxDEV } from '../../jsx/jsx-dev-runtime.ts'
import type { Component } from '../component.ts'
import {
  createDetachedRuntimeContainer,
  installResumeEventListeners,
  renderClientInsertable,
  restoreSignalRefs,
  withRuntimeContainer,
} from '../runtime.ts'
import {
  hasRememberedManagedAttributesForSubtree,
  markManagedAttributesForSubtreeRemembered,
  rememberManagedAttributesForNode,
  rememberManagedAttributesForSubtree,
} from '../runtime/dom.ts'
import { withSignalSnapshot } from '../snapshot.ts'

export const hydrate = (
  Component: Component,
  target: HTMLElement,
  options?: {
    snapshot?: unknown[]
    symbols?: Record<string, string>
  },
) => {
  const runtimeContainer = createDetachedRuntimeContainer()
  const targetWasEmpty = target.childNodes.length === 0
  runtimeContainer.doc = target.ownerDocument
  runtimeContainer.rootElement = target
  for (const [symbolId, url] of Object.entries(options?.symbols ?? {})) {
    runtimeContainer.symbols.set(symbolId, url)
  }
  if (!targetWasEmpty || options?.snapshot != null) {
    installResumeEventListeners(runtimeContainer)
  }
  const render = () =>
    withRuntimeContainer(runtimeContainer, () =>
      renderClientInsertable(jsxDEV(Component as any, {}, null, false, {}), runtimeContainer),
    )
  const nodes = (targetWasEmpty && options?.snapshot == null
    ? render()
    : withSignalSnapshot(options?.snapshot ?? null, render).result) as unknown as Node[]

  while (target.childNodes.length > 0) {
    target.lastChild?.remove()
  }

  for (const node of nodes) {
    target.appendChild(node)
  }
  if (targetWasEmpty && nodes.every((node) => hasRememberedManagedAttributesForSubtree(node))) {
    rememberManagedAttributesForNode(target)
    markManagedAttributesForSubtreeRemembered(target)
  } else {
    rememberManagedAttributesForSubtree(target)
  }
  if (runtimeContainer.hasRuntimeRefMarkers) {
    restoreSignalRefs(runtimeContainer, target)
  }
}
