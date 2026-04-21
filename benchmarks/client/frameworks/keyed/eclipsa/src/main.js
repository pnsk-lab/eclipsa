const adjectives = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
]
const colours = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'orange',
  'white',
  'black',
]
const nouns = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
]

const random = (max) => Math.floor(Math.random() * max)

export const buildLabel = () =>
  `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`

const createDataBuilder = () => {
  let nextId = 1
  return (count) =>
    Array.from({ length: count }, () => ({
      id: nextId++,
      label: buildLabel(),
    }))
}

const getNodeTagName = (node) =>
  typeof node?.tagName === 'string' ? node.tagName.toUpperCase() : ''

const findClosest = (node, stopNode, predicate) => {
  let current = node
  while (current && current !== stopNode) {
    if (predicate(current)) return current
    current = current.parentNode
  }
  return null
}

const createRowEntry = (document, row) => {
  const tr = document.createElement('tr')
  tr.dataset.id = String(row.id)

  const idCell = document.createElement('td')
  idCell.className = 'col-md-1'
  idCell.textContent = String(row.id)

  const labelCell = document.createElement('td')
  labelCell.className = 'col-md-4'
  const labelLink = document.createElement('a')
  labelLink.dataset.action = 'select'
  labelLink.textContent = row.label
  labelCell.appendChild(labelLink)

  const removeCell = document.createElement('td')
  removeCell.className = 'col-md-1'
  const removeLink = document.createElement('a')
  removeLink.dataset.action = 'remove'
  const removeIcon = document.createElement('span')
  removeIcon.className = 'glyphicon glyphicon-remove'
  removeIcon.setAttribute('aria-hidden', 'true')
  removeLink.appendChild(removeIcon)
  removeCell.appendChild(removeLink)

  const spacerCell = document.createElement('td')
  spacerCell.className = 'col-md-6'

  tr.append(idCell, labelCell, removeCell, spacerCell)

  return { labelLink, tr }
}

export const createBenchmarkController = (document, tbody) => {
  const buildData = createDataBuilder()
  const rowEntries = new Map()
  let data = []
  let selectedId = null
  let selectedRow = null

  const syncSelection = (nextId) => {
    if (selectedRow) selectedRow.className = ''
    selectedId = nextId
    selectedRow = nextId == null ? null : (rowEntries.get(nextId)?.tr ?? null)
    if (selectedRow) selectedRow.className = 'danger'
  }

  const appendRows = (rows) => {
    const fragment = document.createDocumentFragment()
    for (const row of rows) {
      const entry = createRowEntry(document, row)
      rowEntries.set(row.id, entry)
      fragment.appendChild(entry.tr)
    }
    tbody.appendChild(fragment)
  }

  const replaceRows = (rows) => {
    rowEntries.clear()
    selectedRow = null
    tbody.replaceChildren()
    appendRows(rows)
  }

  const removeRow = (id) => {
    const index = data.findIndex((row) => row.id === id)
    if (index === -1) return
    data.splice(index, 1)
    const entry = rowEntries.get(id)
    if (!entry) return
    entry.tr.remove()
    rowEntries.delete(id)
    if (selectedId === id) syncSelection(null)
  }

  const swapRowNodes = (leftId, rightId) => {
    const leftRow = rowEntries.get(leftId)?.tr
    const rightRow = rowEntries.get(rightId)?.tr
    if (!leftRow || !rightRow || leftRow === rightRow) return
    const marker = document.createComment('swap-marker')
    const parent = leftRow.parentNode
    if (!parent || rightRow.parentNode !== parent) return
    parent.replaceChild(marker, leftRow)
    parent.replaceChild(leftRow, rightRow)
    parent.replaceChild(rightRow, marker)
  }

  const api = {
    add() {
      const rows = buildData(1000)
      data.push(...rows)
      appendRows(rows)
    },
    clear() {
      data = []
      rowEntries.clear()
      selectedRow = null
      selectedId = null
      tbody.replaceChildren()
    },
    remove(id) {
      removeRow(id)
    },
    run() {
      data = buildData(1000)
      syncSelection(null)
      replaceRows(data)
    },
    runLots() {
      data = buildData(10000)
      syncSelection(null)
      replaceRows(data)
    },
    select(id) {
      if (!rowEntries.has(id)) return
      syncSelection(id)
    },
    swapRows() {
      if (data.length <= 998) return
      const left = data[1]
      const right = data[998]
      ;[data[1], data[998]] = [right, left]
      swapRowNodes(left.id, right.id)
    },
    update() {
      for (let i = 0; i < data.length; i += 10) {
        const row = data[i]
        row.label += ' !!!'
        const entry = rowEntries.get(row.id)
        if (entry) entry.labelLink.textContent = row.label
      }
    },
  }

  tbody.addEventListener('click', (event) => {
    const actionTarget = findClosest(
      event.target,
      tbody,
      (node) => typeof node?.dataset?.action === 'string' && node.dataset.action.length > 0,
    )
    if (!actionTarget) return

    const rowTarget = findClosest(actionTarget, tbody, (node) => getNodeTagName(node) === 'TR')
    const rowId = Number(rowTarget?.dataset?.id)
    if (!Number.isFinite(rowId)) return

    if (actionTarget.dataset.action === 'select') {
      api.select(rowId)
      return
    }
    if (actionTarget.dataset.action === 'remove') {
      api.remove(rowId)
    }
  })

  return {
    api,
    getData: () => data,
    getSelectedId: () => selectedId,
  }
}

export const createBenchmarkApp = (document) => {
  const tbody = document.querySelector('#tbody')
  if (!tbody) {
    throw new Error('Expected benchmark table body #tbody to exist')
  }

  const { api } = createBenchmarkController(document, tbody)

  document.querySelector('#run')?.addEventListener('click', () => api.run())
  document.querySelector('#runlots')?.addEventListener('click', () => api.runLots())
  document.querySelector('#add')?.addEventListener('click', () => api.add())
  document.querySelector('#update')?.addEventListener('click', () => api.update())
  document.querySelector('#clear')?.addEventListener('click', () => api.clear())
  document.querySelector('#swaprows')?.addEventListener('click', () => api.swapRows())

  return api
}

if (typeof document !== 'undefined') {
  const app = createBenchmarkApp(document)
  if (typeof window !== 'undefined') {
    window.app = app
  }
}
