import { defineConfig, type Plugin } from 'vite'
import { eclipsa } from '@xely/eclipsa/vite'
import { denoEclipsa } from './plugins/deno-load-eclipsa.ts'

export default defineConfig({
  appType: 'custom',
  plugins: [
    eclipsa() as Plugin,
    denoEclipsa(),
  ],
})
