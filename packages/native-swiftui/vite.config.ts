import path from 'node:path'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  resolve: {
    alias: {
      '@eclipsa/native-core': path.resolve(import.meta.dirname, '../native-core/mod.ts'),
    },
  },
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
