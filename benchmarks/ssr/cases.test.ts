import { expect, test } from 'bun:test'
import { benchmarkCases } from './cases.js'

test('benchmarkCases includes Astro and Qwik', () => {
  expect(benchmarkCases.map((entry) => entry.name)).toEqual([
    'astro',
    'react',
    'qwik',
    'eclipsa',
    'hono',
    'solid',
    'svelte',
    'vue',
    'vue-vapor',
  ])
})

test('eclipsa benchmark render can be loaded without workspace package resolution', async () => {
  const eclipsaCase = benchmarkCases.find((entry) => entry.name === 'eclipsa')

  expect(eclipsaCase).toBeDefined()
  expect(await eclipsaCase.loadRender()).toBeFunction()
})
