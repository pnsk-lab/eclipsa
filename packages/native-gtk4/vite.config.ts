import path from 'node:path'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@eclipsa\/native$/,
        replacement: path.resolve(import.meta.dirname, '../native/mod.ts'),
      },
      {
        find: /^@eclipsa\/native-core$/,
        replacement: path.resolve(import.meta.dirname, '../native-core/mod.ts'),
      },
    ],
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
