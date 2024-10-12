import { createServer } from 'vite'
import viteConfig from './vite.config.ts'

console.log('eclipsa with vite: DEV')
const server = await createServer(viteConfig)
await server.listen()
server.printUrls()
