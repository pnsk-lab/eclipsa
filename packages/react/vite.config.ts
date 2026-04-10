import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: './mod.ts',
    dts: true,
  },
})
