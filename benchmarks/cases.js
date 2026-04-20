export const benchmarkCases = [
  {
    name: 'astro',
    loadRender: async () => (await import('./apps/astro/render.js')).render,
  },
  {
    name: 'react',
    loadRender: async () => (await import('./apps/react/render.js')).render,
  },
  {
    name: 'qwik',
    loadRender: async () => (await import('./apps/qwik/render.js')).render,
  },
  {
    name: 'eclipsa',
    loadRender: async () => (await import('./apps/eclipsa/render.js')).render,
  },
  {
    name: 'hono',
    loadRender: async () => (await import('./apps/hono/render.js')).render,
  },
  {
    name: 'solid',
    loadRender: async () => (await import('./apps/solid/render.js')).render,
  },
  {
    name: 'svelte',
    loadRender: async () => (await import('./apps/svelte/render.js')).render,
  },
  {
    name: 'vue',
    loadRender: async () => (await import('./apps/vue/render.js')).render,
  },
  {
    name: 'vue-vapor',
    loadRender: async () => (await import('./apps/vue-vapor/render.js')).render,
  },
]
