import { expect, test } from 'bun:test'
import { createBenchmarkApp } from './main.js'

class FakeNode {
  constructor(ownerDocument, nodeType) {
    this.ownerDocument = ownerDocument
    this.nodeType = nodeType
    this.parentNode = null
    this.childNodes = []
  }

  appendChild(node) {
    if (node.nodeType === 11) {
      while (node.childNodes.length > 0) this.appendChild(node.childNodes[0])
      node.childNodes = []
      return node
    }
    if (node.parentNode) node.parentNode.removeChild(node)
    this.childNodes.push(node)
    node.parentNode = this
    return node
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node)
  }

  insertBefore(node, referenceNode) {
    if (node.nodeType === 11) {
      while (node.childNodes.length > 0) this.insertBefore(node.childNodes[0], referenceNode)
      node.childNodes = []
      return node
    }
    if (node.parentNode) node.parentNode.removeChild(node)
    const referenceIndex = referenceNode == null ? -1 : this.childNodes.indexOf(referenceNode)
    if (referenceIndex === -1) {
      this.childNodes.push(node)
    } else {
      this.childNodes.splice(referenceIndex, 0, node)
    }
    node.parentNode = this
    return node
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node)
    if (index === -1) {
      throw new Error('Tried to remove a node that is not a child.')
    }
    this.childNodes.splice(index, 1)
    node.parentNode = null
    return node
  }

  replaceChild(nextNode, previousNode) {
    const index = this.childNodes.indexOf(previousNode)
    if (index === -1) {
      throw new Error('Tried to replace a node that is not a child.')
    }
    if (nextNode.parentNode) nextNode.parentNode.removeChild(nextNode)
    this.childNodes[index] = nextNode
    nextNode.parentNode = this
    previousNode.parentNode = null
    return previousNode
  }

  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null
    this.childNodes = []
    this.append(...nodes)
  }

  remove() {
    this.parentNode?.removeChild(this)
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1)
  }

  get firstChild() {
    return this.childNodes[0] ?? null
  }

  get nextSibling() {
    if (!this.parentNode) return null
    const siblings = this.parentNode.childNodes
    const index = siblings.indexOf(this)
    return siblings[index + 1] ?? null
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('')
  }

  set textContent(value) {
    for (const child of this.childNodes) child.parentNode = null
    this.childNodes = []
    this._textContent = String(value ?? '')
  }
}

class FakeElement extends FakeNode {
  constructor(ownerDocument, tagName) {
    super(ownerDocument, 1)
    this.tagName = tagName.toUpperCase()
    this.className = ''
    this.dataset = {}
    this.attributes = new Map()
    this.listeners = new Map()
    this._textContent = ''
  }

  appendChild(node) {
    this._textContent = ''
    return super.appendChild(node)
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatchEvent(event) {
    const listeners = this.listeners.get(event.type) ?? []
    for (const listener of listeners) listener(event)
    return true
  }

  get textContent() {
    if (this.childNodes.length === 0) return this._textContent
    return super.textContent
  }

  set textContent(value) {
    super.textContent = value
  }
}

class FakeComment extends FakeNode {
  constructor(ownerDocument, value) {
    super(ownerDocument, 8)
    this._textContent = value
  }

  get textContent() {
    return this._textContent
  }

  set textContent(value) {
    this._textContent = String(value ?? '')
  }
}

class FakeDocumentFragment extends FakeNode {
  constructor(ownerDocument) {
    super(ownerDocument, 11)
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map()
    for (const id of ['run', 'runlots', 'add', 'update', 'clear', 'swaprows', 'tbody']) {
      const tagName = id === 'tbody' ? 'tbody' : 'button'
      const element = new FakeElement(this, tagName)
      element.id = id
      this.elements.set(`#${id}`, element)
    }
  }

  createComment(value) {
    return new FakeComment(this, value)
  }

  createDocumentFragment() {
    return new FakeDocumentFragment(this)
  }

  createElement(tagName) {
    return new FakeElement(this, tagName)
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null
  }
}

const getLabelLink = (row) => row.children[1].firstChild
const getRemoveIcon = (row) => row.children[2].firstChild.firstChild

test('benchmark app updates rows in place for select, add, update, and remove', () => {
  const document = new FakeDocument()
  createBenchmarkApp(document)

  document.querySelector('#run').dispatchEvent({ type: 'click' })
  const tbody = document.querySelector('#tbody')
  expect(tbody.children).toHaveLength(1000)

  const firstRow = tbody.children[0]
  const secondRow = tbody.children[1]
  const eleventhRow = tbody.children[10]
  const secondRowBeforeAdd = secondRow

  tbody.dispatchEvent({ target: getLabelLink(firstRow), type: 'click' })
  expect(firstRow.className).toBe('danger')

  tbody.dispatchEvent({ target: getLabelLink(secondRow), type: 'click' })
  expect(firstRow.className).toBe('')
  expect(secondRow.className).toBe('danger')

  document.querySelector('#update').dispatchEvent({ type: 'click' })
  expect(getLabelLink(firstRow).textContent).toEndWith(' !!!')
  expect(getLabelLink(eleventhRow).textContent).toEndWith(' !!!')
  expect(tbody.children[1]).toBe(secondRowBeforeAdd)

  document.querySelector('#add').dispatchEvent({ type: 'click' })
  expect(tbody.children).toHaveLength(2000)
  expect(tbody.children[1]).toBe(secondRowBeforeAdd)

  tbody.dispatchEvent({ target: getRemoveIcon(firstRow), type: 'click' })
  expect(tbody.children).toHaveLength(1999)
  expect(tbody.children[0]).toBe(secondRowBeforeAdd)
  expect(secondRowBeforeAdd.className).toBe('danger')
})

test('benchmark app swaps the keyed rows without rebuilding the table', () => {
  const document = new FakeDocument()
  createBenchmarkApp(document)

  document.querySelector('#run').dispatchEvent({ type: 'click' })
  const tbody = document.querySelector('#tbody')
  const firstRow = tbody.children[1]
  const distantRow = tbody.children[998]

  document.querySelector('#swaprows').dispatchEvent({ type: 'click' })

  expect(tbody.children[1]).toBe(distantRow)
  expect(tbody.children[998]).toBe(firstRow)
  expect(tbody.children).toHaveLength(1000)
})
