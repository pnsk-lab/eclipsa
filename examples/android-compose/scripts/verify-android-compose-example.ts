import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(root, 'dist/native/manifest.json')
const bootstrapPath = path.join(root, 'dist/native/bootstrap.js')

const run = async () => {
  await execFileAsync('bun', ['x', 'vite', 'build'], {
    cwd: root,
    env: process.env,
  })

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    bootstrap: string
    platform: string
    target: string
  }

  if (manifest.target !== 'compose') {
    throw new Error(`Expected compose target manifest, got ${manifest.target}.`)
  }
  if (manifest.platform !== 'android') {
    throw new Error(`Expected android platform manifest, got ${manifest.platform}.`)
  }
  if (manifest.bootstrap !== './bootstrap.js') {
    throw new Error(`Unexpected bootstrap entry: ${manifest.bootstrap}`)
  }

  const bootstrapSource = await readFile(bootstrapPath, 'utf8')
  if (!bootstrapSource.includes('bootNativeApplication')) {
    throw new Error('Expected native bootstrap bundle to include bootNativeApplication.')
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
