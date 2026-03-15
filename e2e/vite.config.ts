import { defineConfig } from 'vite-plus'
import { eclipsaImage } from '@eclipsa/image/vite'
import { eclipsa } from 'eclipsa/vite'

export default defineConfig({
  appType: 'custom',
  plugins: [eclipsaImage({ widths: [240, 480, 960] }), eclipsa()],
  server: {
    fs: {
      allow: ['..'],
    },
  },
})
