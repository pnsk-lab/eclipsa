import { defineConfig } from 'vite-plus'
import { eclipsaContent } from '../packages/content/vite.ts'
import { eclipsa } from '../packages/eclipsa/vite/mod.ts'
import tailwind from '@tailwindcss/vite'
import { eclipsaImage } from '../packages/image/vite.ts'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsa({ output: 'ssg' }), eclipsaContent(), tailwind(), eclipsaImage()],
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts', '*.test.ts'],
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
