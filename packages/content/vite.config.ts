import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['*.test.ts', '*.test.tsx'],
    environment: 'node',
  },
  pack: {
    copy: ['virtual-runtime.d.ts'],
    entry: ['mod.ts', 'vite.ts', 'internal.ts'],
    dts: true,
    format: ['esm'],
    clean: true,
    sourcemap: true,
  },
})
