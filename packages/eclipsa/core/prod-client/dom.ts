import { jsxDEV } from '../../jsx/jsx-dev-runtime.ts'
import {
  ACTION_CSRF_FIELD,
  ACTION_CSRF_INPUT_ATTR,
  readActionCsrfTokenFromDocument,
} from '../action-csrf.ts'
import type { Component } from '../component.ts'
import { getRuntimeContainer, renderClientInsertable } from '../runtime.ts'
import { ACTION_FORM_ATTR } from '../runtime/constants.ts'

interface ComponentResult {
  (): void
  vars: Record<string, unknown>
}

const createActionCsrfInput = (doc: Document, token: string) => {
  const input = doc.createElement('input')
  input.setAttribute(ACTION_CSRF_INPUT_ATTR, '')
  input.setAttribute('name', ACTION_CSRF_FIELD)
  input.setAttribute('type', 'hidden')
  input.setAttribute('value', token)
  return input
}

const ensureActionCsrfInput = (form: HTMLFormElement) => {
  const token = readActionCsrfTokenFromDocument(document)
  if (!token) {
    return
  }

  const existing = form.querySelector(`input[${ACTION_CSRF_INPUT_ATTR}]`)
  const input =
    existing instanceof HTMLInputElement ? existing : createActionCsrfInput(document, token)
  input.setAttribute('name', ACTION_CSRF_FIELD)
  input.setAttribute('type', 'hidden')
  input.setAttribute('value', token)
  if (input.parentNode !== form) {
    form.insertBefore(input, form.firstChild)
  }
}

const ensureActionCsrfInputsInNode = (node: Node) => {
  if (node instanceof HTMLFormElement && node.hasAttribute(ACTION_FORM_ATTR)) {
    ensureActionCsrfInput(node)
  }
  if (node instanceof Element) {
    for (const form of node.querySelectorAll(`form[${ACTION_FORM_ATTR}]`)) {
      if (form instanceof HTMLFormElement) {
        ensureActionCsrfInput(form)
      }
    }
  }
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
    ensureActionCsrfInputsInNode(content)
    return content
  }
}

export const createComponentEurl = (
  elem: HTMLElement,
  signalI: number,
  Component: Component,
  props: Record<string, unknown>,
) => {
  const marker =
    elem.getAttribute('sig') === String(signalI)
      ? elem
      : Array.from(elem.querySelectorAll('*')).find(
          (candidate) => candidate.getAttribute('sig') === String(signalI),
        )

  if (!marker?.parentNode) {
    return
  }

  const runtimeContainer = getRuntimeContainer()
  const nodes = renderClientInsertable(jsxDEV(Component, props, null, false, {}), runtimeContainer)

  for (const node of nodes) {
    marker.parentNode.insertBefore(node, marker)
  }
  marker.remove()
}
