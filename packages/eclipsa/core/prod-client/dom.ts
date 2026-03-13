import { fetchEurl } from './eurl.ts'

interface ComponentResult {
  (): void
  vars: Record<string, unknown>
}
export const createComponentResult = (vars: Record<string, unknown>, elem: ComponentResult) => {
  elem.vars = vars

  return elem
}

export const createTemplate = (templateHTML: string) => {
  let template: HTMLTemplateElement
  return () => {
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = templateHTML
    }
    const content = (template.cloneNode(true) as HTMLTemplateElement).content.firstChild as Node
    return content
  }
}

export const createComponentEurl = (
  elem: HTMLElement,
  signalI: number,
  componentEurl: string,
  props: string,
) => {
  console.log(elem, signalI, componentEurl, props)
}
