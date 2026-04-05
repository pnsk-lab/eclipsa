import { defineConfig } from 'vite-plus'
import { eclipsaContent } from '../packages/content/vite.ts'
import { eclipsaImage } from '../packages/image/vite.ts'
import { eclipsa } from '../packages/eclipsa/vite/mod.ts'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsaImage({ widths: [240, 480, 960] }), eclipsa(), eclipsaContent()],
  server: {
    fs: {
      allow: ['..'],
    },
  },
})
