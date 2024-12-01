import { defineConfig } from 'vite'
import { eclipsa } from '../packages/eclipsa/vite/mod.ts'
import { denoEclipsa } from './plugins/deno-load-eclipsa.ts'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  appType: 'custom',
  root: __dirname,
  mode: 'custom',
  plugins: [
    eclipsa(),
    denoEclipsa(),
  ],
  server: {
    fs: {
      allow: ['..']
    }
  },
})
