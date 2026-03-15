import { access, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/client')
const port = Number.parseInt(process.env.PORT ?? '3000', 10)

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
])

const toCandidates = (pathname: string) => {
  if (pathname === '/') {
    return ['index.html']
  }

  const normalized = pathname.replace(/^\/+/, '')
  if (path.extname(normalized)) {
    return [normalized]
  }

  return [`${normalized}.html`, path.join(normalized, 'index.html')]
}

const resolveFilePath = async (pathname: string) => {
  for (const candidate of toCandidates(pathname)) {
    const filePath = path.resolve(root, candidate)
    if (!filePath.startsWith(root)) {
      continue
    }
    try {
      await access(filePath)
      return filePath
    } catch {
      continue
    }
  }
  return null
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const filePath = await resolveFilePath(url.pathname)
  if (!filePath) {
    response.statusCode = 404
    response.end('Not Found')
    return
  }

  response.setHeader(
    'content-type',
    contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
  )
  response.end(await readFile(filePath))
}).listen(port, () => {
  console.log(`Docs preview listening on http://localhost:${port}`)
})
