import path from 'node:path'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  resolve: {
    alias: {
      '@eclipsa/native-core': path.resolve(import.meta.dirname, '../native-core/mod.ts'),
      '@eclipsa/native/runtime': path.resolve(import.meta.dirname, '../native/runtime-api.ts'),
    },
  },
  test: {
    include: ['*.test.ts', '*.test.tsx'],
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
