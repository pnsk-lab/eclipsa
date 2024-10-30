import { effect } from '../signal.ts'

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

export const insert = (value: () => string | number | boolean, parent: Node, marker: Node) => {
  let lastNode = marker
  effect(() => {
    const _value = value()
    const newNode = document.createTextNode(String(_value))
    parent.replaceChild(newNode, lastNode)
    lastNode = newNode
  })
}
