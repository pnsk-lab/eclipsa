import type { Component } from '../component.ts'

export const hydrate = (Component: Component, target: HTMLElement) => {
  // ハイドレーションとか知らんし！！！
  const elem = Component({}) as unknown as Element
  target.firstChild && target?.replaceChild(elem, target.firstChild)

  while (true) {
    if (target.childNodes.length === 1) {
      break
    }
    target.firstChild?.nextSibling?.remove()
  }
}
