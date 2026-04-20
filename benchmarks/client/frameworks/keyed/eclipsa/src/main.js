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

let data = []
let selectedId = null
let id = 1

const random = (max) => Math.floor(Math.random() * max)
const buildLabel = () =>
  `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`

const tbody = document.querySelector('#tbody')

if (!tbody) {
  throw new Error('Expected benchmark table body #tbody to exist')
}

function render() {
  tbody.textContent = ''
  for (const row of data) {
    const tr = document.createElement('tr')
    tr.className = row.id === selectedId ? 'danger' : ''

    tr.innerHTML = `<td class="col-md-1">${row.id}</td><td class="col-md-4"><a>${row.label}</a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td>`

    tr.children[1].firstChild.onclick = () => {
      selectedId = row.id
      render()
    }
    tr.children[2].firstChild.onclick = () => {
      data = data.filter((item) => item.id !== row.id)
      render()
    }

    tbody.appendChild(tr)
  }
}

function buildData(count) {
  return Array.from({ length: count }, () => ({ id: id++, label: buildLabel() }))
}

class Main {
  run() {
    data = buildData(1000)
    selectedId = null
    render()
  }

  runLots() {
    data = buildData(10000)
    selectedId = null
    render()
  }

  add() {
    data = data.concat(buildData(1000))
    render()
  }

  update() {
    for (let i = 0; i < data.length; i += 10) data[i].label += ' !!!'
    render()
  }

  clear() {
    data = []
    selectedId = null
    render()
  }

  swapRows() {
    if (data.length > 998) {
      ;[data[1], data[998]] = [data[998], data[1]]
      render()
    }
  }
}

const app = new Main()

document.querySelector('#run')?.addEventListener('click', () => app.run())
document.querySelector('#runlots')?.addEventListener('click', () => app.runLots())
document.querySelector('#add')?.addEventListener('click', () => app.add())
document.querySelector('#update')?.addEventListener('click', () => app.update())
document.querySelector('#clear')?.addEventListener('click', () => app.clear())
document.querySelector('#swaprows')?.addEventListener('click', () => app.swapRows())

window.app = app
