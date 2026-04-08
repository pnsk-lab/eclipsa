import { expect, test } from 'bun:test'
import { benchmarkCases } from './cases'

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
