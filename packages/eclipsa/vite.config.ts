import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: [
      'atom/**/*.test.ts',
      'atom/**/*.test.tsx',
      'core/**/*.test.ts',
      'core/**/*.test.tsx',
      'web-utils/**/*.test.ts',
      'web-utils/**/*.test.tsx',
      'compiler/**/*.test.ts',
      'vite/**/*.test.ts',
    ],
    environment: 'node',
  },
  pack: {
    entry: [
      'mod.ts',
      'web-utils/mod.ts',
      'vite/mod.ts',
      'jsx/mod.ts',
      'jsx/jsx-runtime.ts',
      'jsx/jsx-dev-runtime.ts',
      'core/internal.ts',
      'core/client/mod.ts',
      'core/dev-client/mod.ts',
      'core/prod-client/mod.ts',
      'core/internal.ts',
    ],
    dts: true,
    format: ['esm'],
    deps: {
      neverBundle: ['typescript', 'vite'],
    },
    clean: true,
    sourcemap: true,
  },
})
