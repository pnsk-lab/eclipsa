import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    fileParallelism: false,
    include: [
      'atom/**/*.test.ts',
      'core/**/*.test.ts',
      'web-utils/**/*.test.ts',
      'compiler/**/*.test.ts',
      'vite/**/*.test.ts',
    ],
    environment: 'node',
  },
  pack: {
    entry: [
      'mod.ts',
      'flow.ts',
      'signal.ts',
      'web-utils/mod.ts',
      'vite/mod.ts',
      'vite/build/runtime.ts',
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
