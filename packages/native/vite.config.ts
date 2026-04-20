import path from 'node:path'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^eclipsa\/internal$/,
        replacement: path.resolve(import.meta.dirname, '../eclipsa/core/internal.ts'),
      },
      {
        find: /^eclipsa$/,
        replacement: path.resolve(import.meta.dirname, '../eclipsa/mod.ts'),
      },
      {
        find: /^@eclipsa\/native\/jsx-dev-runtime$/,
        replacement: path.resolve(import.meta.dirname, './jsx-dev-runtime.ts'),
      },
      {
        find: /^@eclipsa\/native\/runtime$/,
        replacement: path.resolve(import.meta.dirname, './runtime-api.ts'),
      },
      {
        find: /^@eclipsa\/native\/jsx-runtime$/,
        replacement: path.resolve(import.meta.dirname, './jsx-runtime.ts'),
      },
      {
        find: /^@eclipsa\/native$/,
        replacement: path.resolve(import.meta.dirname, './mod.ts'),
      },
      {
        find: /^@eclipsa\/native-core$/,
        replacement: path.resolve(import.meta.dirname, '../native-core/mod.ts'),
      },
      {
        find: /^@eclipsa\/native-swiftui$/,
        replacement: path.resolve(import.meta.dirname, '../native-swiftui/mod.ts'),
      },
      {
        find: /^@eclipsa\/native-android-compose$/,
        replacement: path.resolve(import.meta.dirname, '../native-android-compose/mod.ts'),
      },
      {
        find: /^@eclipsa\/native-gtk4$/,
        replacement: path.resolve(import.meta.dirname, '../native-gtk4/mod.ts'),
      },
      {
        find: /^@eclipsa\/native-gtk4$/,
        replacement: path.resolve(import.meta.dirname, '../native-gtk4/mod.ts'),
      },
    ],
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
