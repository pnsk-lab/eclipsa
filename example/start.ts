import { createServer } from 'vite'
import viteConfig from './vite.config.ts'

console.info('eclipsa with vite: DEV')
const server = await createServer({
  ...viteConfig,
  configFile: false
})

await server.listen()
server.printUrls()
