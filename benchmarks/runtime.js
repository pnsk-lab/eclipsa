export const benchmarkRuntimes = ['bun', 'node', 'deno']

export const detectRuntime = () => {
  if (typeof Bun !== 'undefined') {
    return 'bun'
  }

  if (typeof Deno !== 'undefined') {
    return 'deno'
  }

  if (typeof process !== 'undefined' && typeof process.versions?.node === 'string') {
    return 'node'
  }

  return 'unknown'
}

export const getBenchmarkCommand = (runtime) => {
  switch (runtime) {
    case 'bun':
      return 'bun run ./benchmark.js'
    case 'node':
      return 'node ./benchmark.js'
    case 'deno':
      return 'deno run --import-map=./deno.import-map.json --allow-read --allow-env --allow-sys --node-modules-dir=auto ./benchmark.js'
    default:
      throw new Error(`Unsupported runtime: ${runtime}`)
  }
}
