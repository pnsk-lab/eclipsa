import { For, useSignal } from 'eclipsa'
import { hydrate } from 'eclipsa/client'
import {
  createRows,
  removeRowById,
  swapBenchmarkRows,
  updateEveryTenthRow,
  type RowData,
} from './model.ts'
import { benchmarkSymbols } from 'virtual:eclipsa-benchmark-symbols'

const App = () => {
  const nextId = useSignal(1)
  const rows = useSignal<RowData[]>([])
  const selected = useSignal<number | null>(null)

  const replaceRows = (count: number) => {
    const nextRows = createRows(count, nextId.value)
    nextId.value = nextRows.nextId
    rows.value = nextRows.rows
    selected.value = null
  }

  const appendRows = () => {
    const nextRows = createRows(1000, nextId.value)
    nextId.value = nextRows.nextId
    rows.value = rows.value.concat(nextRows.rows)
  }

  const removeRow = (id: number) => {
    rows.value = removeRowById(rows.value, id)
    if (selected.value === id) {
      selected.value = null
    }
  }

  const run = () => replaceRows(1000)
  const runLots = () => replaceRows(10000)
  const updateRows = () => {
    rows.value = updateEveryTenthRow(rows.value)
  }
  const clearRows = () => {
    rows.value = []
    selected.value = null
  }
  const swapRows = () => {
    rows.value = swapBenchmarkRows(rows.value)
  }

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Eclipsa keyed</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="run" onClick={run}>
                  Create 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  type="button"
                  class="btn btn-primary btn-block"
                  id="runlots"
                  onClick={runLots}
                >
                  Create 10,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  type="button"
                  class="btn btn-primary btn-block"
                  id="add"
                  onClick={appendRows}
                >
                  Append 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  type="button"
                  class="btn btn-primary btn-block"
                  id="update"
                  onClick={updateRows}
                >
                  Update every 10th row
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  type="button"
                  class="btn btn-primary btn-block"
                  id="clear"
                  onClick={clearRows}
                >
                  Clear
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  type="button"
                  class="btn btn-primary btn-block"
                  id="swaprows"
                  onClick={swapRows}
                >
                  Swap Rows
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody id="tbody">
          <For
            arr={rows.value}
            fn={(row) => {
              const rowId = row.id
              const label = row.label
              const handleSelect = () => {
                selected.value = rowId
              }
              const handleRemove = () => {
                removeRow(rowId)
              }

              return (
                <tr class={selected.value === rowId ? 'danger' : ''}>
                  <td class="col-md-1">{rowId}</td>
                  <td class="col-md-4">
                    <a onClick={handleSelect}>{label}</a>
                  </td>
                  <td class="col-md-1">
                    <a onClick={handleRemove}>
                      <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                    </a>
                  </td>
                  <td class="col-md-6"></td>
                </tr>
              )
            }}
            key={(row) => row.id}
          />
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
    </div>
  )
}

const root = document.getElementById('main')
if (!(root instanceof HTMLElement)) {
  throw new Error('Expected #main benchmark root.')
}

hydrate(App, root, {
  symbols: benchmarkSymbols,
})
