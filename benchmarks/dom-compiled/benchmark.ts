import {
  insertFor,
  textNodeSignalMemberStatic,
} from '../../packages/eclipsa/core/runtime/dom-compiled.ts'
import { signal } from '../../packages/eclipsa/core/runtime/reactive.ts'

interface RowData {
  id: number
  label: string
}

class BenchNode {
  childNodes: BenchNode[] = []
  nodeType = 0
  ownerDocument: BenchDocument | null = null
  parentNode: BenchNode | null = null

  get firstChild() {
    return this.childNodes[0] ?? null
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null
  }

  get nextSibling() {
    if (!this.parentNode) {
      return null
    }
    const index = this.parentNode.childNodes.indexOf(this)
    return index >= 0 ? (this.parentNode.childNodes[index + 1] ?? null) : null
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('')
  }

  set textContent(value: string) {
    const text = new BenchText(value)
    text.ownerDocument = this.ownerDocument
    text.parentNode = this
    this.childNodes = [text]
  }

  remove() {
    this.parentNode?.removeChild(this)
  }

  removeChild(node: BenchNode) {
    const index = this.childNodes.indexOf(node)
    if (index >= 0) {
      this.childNodes.splice(index, 1)
      node.parentNode = null
    }
    return node
  }
}

class BenchDocumentFragment extends BenchNode {
  constructor() {
    super()
    this.nodeType = 11
  }

  appendChild(node: BenchNode) {
    detach(node)
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }
}

class BenchElement extends BenchNode {
  attributes = new Map<string, string>()
  tagName: string

  constructor(tagName: string) {
    super()
    this.nodeType = 1
    this.tagName = tagName.toUpperCase()
  }

  get className() {
    return this.attributes.get('class') ?? ''
  }

  set className(value: string) {
    if (value) {
      this.attributes.set('class', value)
    } else {
      this.attributes.delete('class')
    }
  }

  appendChild(node: BenchNode) {
    if (node instanceof BenchDocumentFragment) {
      for (const child of node.childNodes.slice()) {
        this.appendChild(child)
      }
      return node
    }
    detach(node)
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }

  insertBefore(node: BenchNode, referenceNode: BenchNode | null) {
    if (node instanceof BenchDocumentFragment) {
      const children = node.childNodes.slice()
      for (const child of children) {
        this.insertBefore(child, referenceNode)
      }
      return node
    }
    detach(node)
    node.ownerDocument = this.ownerDocument
    node.parentNode = this
    const index = referenceNode ? this.childNodes.indexOf(referenceNode) : -1
    if (index >= 0) {
      this.childNodes.splice(index, 0, node)
    } else {
      this.childNodes.push(node)
    }
    return node
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
}

class BenchText extends BenchNode {
  data: string

  constructor(data: string) {
    super()
    this.data = data
    this.nodeType = 3
  }

  override get textContent() {
    return this.data
  }

  override set textContent(value: string) {
    this.data = value
  }
}

class BenchComment extends BenchText {
  constructor(data: string) {
    super(data)
    this.nodeType = 8
  }
}

class BenchDocument {
  body: BenchElement

  constructor() {
    this.body = this.createElement('body')
  }

  createComment(data: string) {
    const comment = new BenchComment(data)
    comment.ownerDocument = this
    return comment
  }

  createDocumentFragment() {
    const fragment = new BenchDocumentFragment()
    fragment.ownerDocument = this
    return fragment
  }

  createElement(tagName: string) {
    const element = new BenchElement(tagName)
    element.ownerDocument = this
    return element
  }

  createTextNode(data: string) {
    const text = new BenchText(data)
    text.ownerDocument = this
    return text
  }
}

const detach = (node: BenchNode) => {
  if (!node.parentNode) {
    return
  }
  const index = node.parentNode.childNodes.indexOf(node)
  if (index >= 0) {
    node.parentNode.childNodes.splice(index, 1)
  }
  node.parentNode = null
}

const installBenchDom = () => {
  const doc = new BenchDocument()
  Object.assign(globalThis, {
    Comment: BenchComment,
    DocumentFragment: BenchDocumentFragment,
    Element: BenchElement,
    HTMLElement: BenchElement,
    Node: BenchNode,
    Text: BenchText,
    document: doc,
  })
  return doc
}

const createRows = (count: number, offset = 0): RowData[] =>
  Array.from({ length: count }, (_, index) => ({
    id: offset + index + 1,
    label: `Row ${offset + index + 1}`,
  }))

const updateEveryTenthRow = (rows: readonly RowData[]) =>
  rows.map((row, index) =>
    index % 10 === 0
      ? {
          ...row,
          label: `${row.label} !!!`,
        }
      : row,
  )

const swapRows = (rows: readonly RowData[]) => {
  const next = rows.slice()
  ;[next[1], next[998]] = [next[998]!, next[1]!]
  return next
}

const createHost = (doc: BenchDocument) => {
  const host = doc.createElement('tbody')
  const marker = doc.createComment('marker')
  host.appendChild(marker)
  return { host, marker }
}

const mountRows = (rows: RowData[]) => {
  const doc = installBenchDom()
  const { host, marker } = createHost(doc)
  const rowsSignal = signal(rows)

  insertFor(
    {
      arr: rowsSignal.value,
      arrSignal: rowsSignal,
      directRowUpdates: true,
      domOnlyRows: true,
      fn: (row) => {
        const tr = doc.createElement('tr')
        const id = doc.createElement('td')
        const labelCell = doc.createElement('td')
        const label = doc.createTextNode('')
        id.textContent = String(row.value.id)
        textNodeSignalMemberStatic(row, 'label', label)
        labelCell.appendChild(label)
        tr.appendChild(id)
        tr.appendChild(labelCell)
        return tr
      },
      keyMember: 'id',
      reactiveIndex: false,
      reactiveRows: true,
    },
    host as unknown as Node,
    marker as unknown as Node,
  )

  return { host, rowsSignal }
}

const measure = (fn: () => void, iterations: number) => {
  const samples: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  samples.sort((left, right) => left - right)
  return {
    max: samples[samples.length - 1]!,
    median: samples[Math.floor(samples.length / 2)]!,
    min: samples[0]!,
  }
}

const iterations = Number(process.env.BENCH_ITERATIONS ?? 30)
const rowCount = Number(process.env.BENCH_ROWS ?? 1000)

const initial = measure(() => {
  mountRows(createRows(rowCount))
}, iterations)

const update = measure(() => {
  const mounted = mountRows(createRows(rowCount))
  for (let iteration = 0; iteration < 10; iteration += 1) {
    mounted.rowsSignal.value = updateEveryTenthRow(mounted.rowsSignal.value)
  }
}, iterations)

const swap = measure(() => {
  const mounted = mountRows(createRows(rowCount))
  mounted.rowsSignal.value = swapRows(mounted.rowsSignal.value)
}, iterations)

console.log(
  JSON.stringify(
    {
      iterations,
      rowCount,
      scenarios: {
        initial,
        swap,
        update,
      },
    },
    null,
    2,
  ),
)
