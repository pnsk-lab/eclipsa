import { For, useSignal } from 'eclipsa'

declare global {
  var __effectScopeProbeRuns: number | undefined
}

const probe = (value: string) => {
  globalThis.__effectScopeProbeRuns = (globalThis.__effectScopeProbeRuns ?? 0) + 1
  return value
}

export default () => {
  const rows = useSignal(['alpha', 'beta', 'gamma'])
  const tick = useSignal(0)

  return (
    <div>
      <p>Effect scope page</p>
      <p>tick: {tick.value}</p>
      <button type="button" onClick={() => tick.value++}>
        Tick
      </button>
      <button
        type="button"
        onClick={() => {
          rows.value = rows.value.slice(0, 1)
        }}
      >
        Keep first row
      </button>
      <button
        type="button"
        onClick={() => {
          globalThis.__effectScopeProbeRuns = 0
        }}
      >
        Reset probe
      </button>
      <ul>
        <For
          arr={rows.value}
          fn={(row) => <li data-tick={probe(`${row}:${tick.value}`)}>{row}</li>}
        />
      </ul>
    </div>
  )
}
