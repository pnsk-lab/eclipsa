import path from 'node:path'
import { defineConfig } from 'vite-plus'
import { native } from '../../packages/native/vite.ts'
import { gtk4 } from '../../packages/native-gtk4/vite.ts'

const root = path.resolve(import.meta.dirname)

export default defineConfig({
  appType: 'custom',
  plugins: [native({ target: gtk4() })],
  resolve: {
    alias: [
      {
        find: /^eclipsa\/internal$/,
        replacement: path.resolve(root, '../../packages/eclipsa/core/internal.ts'),
      },
      {
        find: /^eclipsa$/,
        replacement: path.resolve(root, '../../packages/eclipsa/mod.ts'),
      },
      {
        find: /^@eclipsa\/native\/jsx-dev-runtime$/,
        replacement: path.resolve(root, '../../packages/native/jsx-dev-runtime.ts'),
      },
      {
        find: /^@eclipsa\/native\/jsx-runtime$/,
        replacement: path.resolve(root, '../../packages/native/jsx-runtime.ts'),
      },
      {
        find: /^@eclipsa\/native$/,
        replacement: path.resolve(root, '../../packages/native/mod.ts'),
      },
      {
        find: /^@eclipsa\/native-core$/,
        replacement: path.resolve(root, '../../packages/native-core/mod.ts'),
      },
      {
        find: /^@eclipsa\/native-gtk4$/,
        replacement: path.resolve(root, '../../packages/native-gtk4/mod.ts'),
      },
    ],
  },
  server: {
    fs: {
      allow: ['../..'],
    },
  },
})
