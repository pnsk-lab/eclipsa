import { defineConfig } from '__VITE_IMPORT_SOURCE__'
import { node } from '@eclipsa/node'
import { eclipsa } from 'eclipsa/vite'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsa(), node()],
})
