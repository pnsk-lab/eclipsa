export type BenchmarkRender = () => Promise<unknown>

export type BenchmarkCase = {
  name: string
  loadRender: () => Promise<BenchmarkRender>
}

export const benchmarkCases: BenchmarkCase[] = [
  {
    name: 'astro',
    loadRender: async () => (await import('./apps/astro/render')).render,
  },
  {
    name: 'react',
    loadRender: async () => (await import('./apps/react/render')).render,
  },
  {
    name: 'qwik',
    loadRender: async () => (await import('./apps/qwik/render')).render,
  },
  {
    name: 'eclipsa',
    loadRender: async () => (await import('./apps/eclipsa/render')).render,
  },
  {
    name: 'hono',
    loadRender: async () => (await import('./apps/hono/render')).render,
  },
  {
    name: 'solid',
    loadRender: async () => (await import('./apps/solid/render')).render,
  },
  {
    name: 'svelte',
    loadRender: async () => (await import('./apps/svelte/render')).render,
  },
  {
    name: 'vue',
    loadRender: async () => (await import('./apps/vue/render')).render,
  },
  {
    name: 'vue-vapor',
    loadRender: async () => (await import('./apps/vue-vapor/render')).render,
  },
]
