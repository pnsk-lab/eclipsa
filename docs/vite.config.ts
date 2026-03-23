import { defineConfig } from 'vite-plus'
import { eclipsaContent } from '@eclipsa/content/vite'
import { eclipsa } from 'eclipsa/vite'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsa({ output: 'ssg' }), eclipsaContent(), tailwind()],
  server: {
    fs: {
      allow: ['..'],
    },
  },
})
