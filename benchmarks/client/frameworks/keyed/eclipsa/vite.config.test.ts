import { expect, test } from 'bun:test'
import {
  default as benchmarkConfig,
  benchmarkSymbolUrls,
  createEclipsaBenchmarkPlugin,
} from './vite.config.ts'

test('benchmark Vite build compiles TSX through the Eclipsa client compiler', async () => {
  const plugin = createEclipsaBenchmarkPlugin()
  const result = await plugin.transform?.(
    `import { useSignal } from "eclipsa"; const App = () => { const count = useSignal(0); return <button onClick={() => count.value++}>{count.value}</button> }; export default App;`,
    '/virtual/benchmark.tsx',
  )

  expect(result).toBeObject()
  expect(result?.code).toContain('from "eclipsa/client"')
  expect(result?.code).toContain('createTemplate')
  expect(result?.code).toContain('"onClick"')
  expect(result?.code).not.toContain('__eclipsaEvent(')
})

test('benchmark Vite build exposes standalone symbol urls for resumable handlers', async () => {
  const plugin = createEclipsaBenchmarkPlugin()
  const manifest = await plugin.load?.('virtual:eclipsa-benchmark-symbols')

  expect(Object.keys(benchmarkSymbolUrls).length).toBeGreaterThan(0)
  expect(Object.values(benchmarkSymbolUrls)).toSatisfy((urls) =>
    urls.every((url) => url.startsWith('dist/entries/symbol__')),
  )
  expect(manifest).toContain('new URL(')
})

test('benchmark Vite build emits the main bundle to the same location as other Vite benchmarks', () => {
  expect(benchmarkConfig.build?.rollupOptions?.output).toSatisfy((output) => {
    if (!output || Array.isArray(output) || typeof output.entryFileNames !== 'function') {
      return false
    }
    return output.entryFileNames({ name: 'main' } as never) === 'assets/[name].js'
  })
})
