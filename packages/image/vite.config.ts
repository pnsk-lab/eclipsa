import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['*.test.ts', '*.test.tsx'],
    environment: 'node',
  },
  pack: {
    copy: ['client.d.ts'],
    entry: ['mod.ts', 'client.ts', 'vite.ts'],
    dts: true,
    format: ['esm'],
    clean: true,
    sourcemap: true,
  },
})
