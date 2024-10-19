import type { Component } from '../component.ts'

export const hydrate = (component: Component, target: HTMLElement) => {
  console.log(component({}))
}
