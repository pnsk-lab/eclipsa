import { defineConfig } from 'vite-plus'
import { eclipsa } from 'eclipsa/vite'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsa()],
})
