import type { Component } from '../component.ts'

export const hydrate = (Component: Component, target: HTMLElement) => {
  document.body.appendChild(Component({}))
}
