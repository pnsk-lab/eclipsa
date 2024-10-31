import type { Component } from '../component.ts'
import { effect } from '../signal.ts'
import type { ClientElementLike, Insertable } from './types.ts'

export const createTemplate = (html: string): () => Node => {
  let template: HTMLTemplateElement | null = null

  return () => {
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = html
    }
    const content = (template.cloneNode(true) as HTMLTemplateElement).content
      .firstChild as Node

    return content
  }
}

/**
 * @param value A getter to get value. You can include signals.
 * @param parent Parent to insert
 * @param marker Marker to insert, default
 */
export const insert = (
  value: () => Insertable,
  parent: Node,
  marker?: Node,
) => {
  // 前回の、一番最初のノード
  let lastFirstNode = marker
  let lastNodeLength = 0

  effect(() => {
    const insertable = value()

    const elemArr = Array.isArray(insertable) ? insertable : [insertable]

    const newNodes: Node[] = []

    for (let i = 0; i < elemArr.length; i++) {
      const elem = elemArr[i]
      if (elem === null || elem === undefined || elem === false) {
        newNodes.push(document.createComment('eclipsa-empty'))
      } else if (elem instanceof Node) {
        newNodes.push(elem)
      } else {
        newNodes.push(document.createTextNode(elem.toString()))
      }
    }

    if (lastFirstNode && newNodes.length !== 0) {
      for (let i = 0; i < lastNodeLength; i++) {
        lastFirstNode.nextSibling?.remove()
      }
      parent.replaceChild(newNodes[0], lastFirstNode)
      for (let i = 1; i < newNodes.length; i++) {
        parent.insertBefore(newNodes[i], newNodes[i - 1].nextSibling)
      }
    } else {
      for (let i = 0; i < newNodes.length; i++) {
        parent.appendChild(newNodes[i])
      }
    }

    lastFirstNode = newNodes[0]
    lastNodeLength = elemArr.length
  })
}

export const addListener = (elem: Element, eventName: string, listener: () => void) => {
  elem.addEventListener(eventName, listener)
}

export const hydrate = (Component: Component, target: HTMLElement) => {
  const elem = Component({}) as unknown as ClientElementLike

  //const lengthToInsert = Array.isArray(elem) ? elem.length : 1
  while (true) {
    if (target.childNodes.length === 0) {
      break
    }
    target.lastChild?.remove()
  }
  for (const e of Array.isArray(elem) ? elem : [elem]) {
    insert(() => e, target)
  }
}

export const createComponent = (Component: Component, props: unknown) => {
  const elem = Component(props) as unknown as ClientElementLike
  return () => elem
}