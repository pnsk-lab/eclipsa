import type { Plugin } from 'vite'
import eclipsaDenoJSON from '../../packages/eclipsa/deno.json' with {
  type: 'json',
}
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const denoEclipsa = (): Plugin => ({
  name: 'vite-plugin-deno-eclipsa',
  async resolveId(source, importer) {
    if (source?.startsWith('@xely/eclipsa')) {
      for (const [key, value] of Object.entries(eclipsaDenoJSON.exports)) {
        if (key.endsWith(path.relative('@xely/eclipsa', source))) {
          const fileURL = await import.meta.resolve(
            path.join('../../packages/eclipsa', value).replace('\\', '/'),
          )
          const filePath = fileURLToPath(fileURL)
          const id = path.relative(importer!, filePath)
          return {
            id: filePath,
          }
        }
      }
    }
  },
})
