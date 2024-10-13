import { defineConfig, type Plugin } from 'vite'
import { eclipsa } from '@xely/eclipsa/vite'
import deno from '@deno/vite-plugin'

export default defineConfig({
  appType: 'custom',
  plugins: [
    deno() as unknown as Plugin,
    eclipsa() as Plugin
  ],
  esbuild: {
    jsxFactory: 'jsx',
    jsxImportSource: 'hono/jsx'
  }
})
