import fg from 'fast-glob'
import path from 'node:path'

// WIP
const filePathToHonoPath = (filePath: string) => {
  const segments = filePath.split('/').slice(0, -1)

  return segments.join('/') || '/'
}

export interface RouteEntry {
  filePath: string
  honoPath: string
}
export const createRoutes = async (root: string): Promise<RouteEntry[]> => {
  const appDir = path.join(root, 'app')
  const result = []
  for await (const entry of fg.stream(path.join(root, '/**/+page.tsx'))) {
    const relativePath = path.relative(appDir, entry.toString())
    result.push({
      filePath: entry.toString(),
      honoPath: filePathToHonoPath(relativePath)
    })
  }
  return result
}