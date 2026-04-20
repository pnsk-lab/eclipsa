import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(root, 'dist/native/manifest.json')
const bootstrapPath = path.join(root, 'dist/native/bootstrap.js')
const hostManifestPath = path.join(root, 'dist/native/host/manifest.json')

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const run = async () => {
  await execFileAsync('bun', ['x', 'vite', 'build'], {
    cwd: root,
    env: process.env,
  })

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    bootstrap: string
    host?: string
    platform: string
    target: string
  }

  if (manifest.target !== 'gtk4') {
    throw new Error(`Expected gtk4 target manifest, got ${manifest.target}.`)
  }
  if (manifest.platform !== 'gtk4') {
    throw new Error(`Expected gtk4 platform manifest, got ${manifest.platform}.`)
  }
  if (manifest.bootstrap !== './bootstrap.js') {
    throw new Error(`Unexpected bootstrap entry: ${manifest.bootstrap}`)
  }

  const bootstrapSource = await readFile(bootstrapPath, 'utf8')
  if (!bootstrapSource.includes('bootNativeApplication')) {
    throw new Error('Expected native bootstrap bundle to include bootNativeApplication.')
  }

  const hasHostManifest = await fileExists(hostManifestPath)
  if (hasHostManifest) {
    const hostManifest = JSON.parse(await readFile(hostManifestPath, 'utf8')) as {
      formatVersion: number
      targets: unknown[]
    }
    if (hostManifest.formatVersion !== 1) {
      throw new Error(`Unexpected host manifest version: ${hostManifest.formatVersion}`)
    }
    if (!Array.isArray(hostManifest.targets)) {
      throw new Error('Expected GTK4 host manifest to expose a targets array.')
    }
    if (manifest.host !== './host/manifest.json') {
      throw new Error(`Expected host manifest link, got ${manifest.host}`)
    }
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
