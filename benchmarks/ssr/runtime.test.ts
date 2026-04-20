import { expect, test } from 'bun:test'
import { benchmarkRuntimes, detectRuntime, getBenchmarkCommand } from './runtime.js'

test('runtime commands are exposed for bun, node, and deno', () => {
  expect(benchmarkRuntimes).toEqual(['bun', 'node', 'deno'])
  expect(getBenchmarkCommand('bun')).toBe('bun run ./benchmark.js')
  expect(getBenchmarkCommand('node')).toBe('node ./benchmark.js')
  expect(getBenchmarkCommand('deno')).toBe(
    'deno run --import-map=./deno.import-map.json --allow-read --allow-env --allow-sys --node-modules-dir=auto ./benchmark.js',
  )
})

test('runtime detection recognizes bun in this environment', () => {
  expect(detectRuntime()).toBe('bun')
})
