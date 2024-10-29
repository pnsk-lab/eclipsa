import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { eclipsa } from '@xely/eclipsa/vite'
import { denoEclipsa } from './plugins/deno-load-eclipsa.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

console.info('eclipsa with vite: DEV')
const server = await createServer({ 
  root: __dirname,
  mode: 'custom',
  configFile: false,
  plugins: [
    eclipsa(),
    denoEclipsa(),
  ],
  server: {
    fs: {
      allow: ['..']
    }
  }
})
await server.listen()
server.printUrls()
