import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['*.test.ts'],
    environment: 'node',
  },
  pack: {
    clean: true,
    dts: true,
    entry: './mod.ts',
    format: ['esm'],
    sourcemap: true,
  },
})
