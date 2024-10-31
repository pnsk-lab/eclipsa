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
  let lastNode = marker

  effect(() => {
    const insertable = value()

    let newNode: Node
    if (insertable === null || insertable === undefined || insertable === false) {
      newNode = document.createComment('eclipsa-empty')
    } else if (insertable instanceof Node) {
      newNode = insertable
    } else {
      newNode = document.createTextNode(insertable.toString())
    }
    if (lastNode) {
      parent.replaceChild(newNode, lastNode)
    } else {
      parent.appendChild(newNode)
    }

    lastNode = newNode
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