import { bench, run, summary } from 'mitata'
import { benchmarkCases } from './cases.js'
import { detectRuntime } from './runtime.js'

const loadedCases = await Promise.all(
  benchmarkCases.map(async ({ name, loadRender }) => ({
    name,
    render: await loadRender(),
  })),
)

console.log(`Running SSR benchmarks on ${detectRuntime()}.`)

summary(() => {
  for (const { name, render } of loadedCases) {
    bench(`SSR Render (${name})`, async () => {
      await render()
    })
  }
})

await run()
