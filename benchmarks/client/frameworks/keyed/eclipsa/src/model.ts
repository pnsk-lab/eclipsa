export interface RowData {
  id: number
  label: string
}

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

const random = (max: number) => Math.floor(Math.random() * max)

export const buildLabel = () =>
  `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`

export const createRows = (count: number, startId: number) => {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: startId + index,
    label: buildLabel(),
  }))

  return {
    nextId: startId + count,
    rows,
  }
}

export const updateEveryTenthRow = (rows: readonly RowData[]) =>
  rows.map((row, index) =>
    index % 10 === 0
      ? {
          ...row,
          label: `${row.label} !!!`,
        }
      : row,
  )

export const removeRowById = (rows: readonly RowData[], id: number) =>
  rows.filter((row) => row.id !== id)

export const swapBenchmarkRows = (rows: readonly RowData[]) => {
  if (rows.length <= 998) {
    return rows.slice()
  }

  const nextRows = rows.slice()
  ;[nextRows[1], nextRows[998]] = [nextRows[998], nextRows[1]]
  return nextRows
}
