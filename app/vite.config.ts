import { defineConfig, type Plugin } from 'vite'
import { eclipsa } from '@xely/eclipsa/vite'
import deno from '@deno/vite-plugin'
import { denoEclipsa } from './plugins/deno-load-eclipsa.ts'

export default defineConfig({
  appType: 'custom',
  plugins: [
    denoEclipsa(),
    deno() as unknown as Plugin,
    eclipsa() as Plugin
  ],
})
