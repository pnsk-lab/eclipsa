import path from 'node:path'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { experimental_AstroContainer } from 'astro/container'

const renderTarget = '/src/pages/index.astro'
const chunksDir = fileURLToPath(new URL('./dist/server/chunks/', import.meta.url))
const pageChunkPath = readdirSync(chunksDir)
  .sort()
  .map((entry) => path.join(chunksDir, entry))
  .find((entry) => {
    const source = readFileSync(entry, 'utf8')
    return source.includes(renderTarget) && source.includes('export { page }')
  })

if (!pageChunkPath) {
  throw new Error(`Unable to locate the compiled Astro page chunk for ${renderTarget}.`)
}

const pageModuleFactory = (await import(pathToFileURL(pageChunkPath).href)).page
const Page = pageModuleFactory().default
const container = await experimental_AstroContainer.create()

export const render = async () => {
  const html = await container.renderToString(Page)
  return html.length
}
