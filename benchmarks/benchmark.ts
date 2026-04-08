import { bench, run, summary } from 'mitata'
import { benchmarkCases } from './cases'

const loadedCases = await Promise.all(
  benchmarkCases.map(async ({ name, loadRender }) => ({
    name,
    render: await loadRender(),
  })),
)

summary(() => {
  for (const { name, render } of loadedCases) {
    bench(`SSR Render (${name})`, async () => {
      await render()
    })
  }
})

await run()
