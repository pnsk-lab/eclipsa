import { createServer } from 'vite'
import viteConfig from './vite.config.ts'

console.info('eclipsa with vite: DEV')
const server = await createServer({ 
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
