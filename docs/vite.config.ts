import { defineConfig } from 'vite-plus'
import { eclipsa } from 'eclipsa/vite'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsa({ output: 'ssg' }), tailwind()],
  server: {
    fs: {
      allow: ['..'],
    },
  },
})
