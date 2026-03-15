import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: [
      'core/**/*.test.ts',
      'core/**/*.test.tsx',
      'compiler/**/*.test.ts',
      'vite/**/*.test.ts',
    ],
    environment: 'node',
  },
  pack: {
    entry: [
      'mod.ts',
      'vite/mod.ts',
      'jsx/mod.ts',
      'jsx/jsx-runtime.ts',
      'jsx/jsx-dev-runtime.ts',
      'core/internal.ts',
      'core/client/mod.ts',
      'core/dev-client/mod.ts',
      'core/prod-client/mod.ts',
    ],
    dts: true,
    format: ['esm'],
    clean: true,
    sourcemap: true,
  },
})
