import { defineConfig } from 'vite-plus'
import { eclipsaContent } from '@eclipsa/content/vite'
import { eclipsaImage } from '@eclipsa/image/vite'
import { eclipsa } from 'eclipsa/vite'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsaImage({ widths: [240, 480, 960] }), eclipsa(), eclipsaContent()],
  server: {
    fs: {
      allow: ['..'],
    },
  },
})
