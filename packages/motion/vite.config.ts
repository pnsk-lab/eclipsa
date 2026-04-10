import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['*.test.ts'],
    environment: 'node',
  },
  pack: {
    entry: ['mod.ts'],
    dts: true,
    format: ['esm'],
    clean: true,
    sourcemap: true,
  },
})
