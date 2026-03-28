import { defineConfig } from 'vite-plus'
import { eclipsaContent } from '@eclipsa/content/vite'
import { eclipsa } from 'eclipsa/vite'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsa({ output: 'ssg' }), eclipsaContent(), tailwind()],
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
