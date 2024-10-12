import { defineConfig, DevEnvironment } from 'vite'
import { eclipsa } from '../src/vite/mod.ts'

export default defineConfig({
  appType: 'custom',
  plugins: [
    eclipsa()
  ],
})
