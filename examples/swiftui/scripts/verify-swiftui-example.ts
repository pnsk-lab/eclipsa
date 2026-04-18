import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const root = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(root, 'dist/native/manifest.json')
const hostPackagePath = path.resolve(root, '../../packages/native-swiftui/macos-swiftui')

const run = async () => {
  await execFileAsync('bun', ['x', 'vite', 'build'], {
    cwd: root,
    env: process.env,
  })

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    bootstrap: string
    target: string
  }
  if (manifest.target !== 'swiftui') {
    throw new Error(`Expected swiftui target manifest, got ${manifest.target}.`)
  }

  const { stdout } = await execFileAsync(
    'swift',
    ['run', '--quiet', '--package-path', hostPackagePath, 'EclipsaNativeSmoke'],
    {
      cwd: root,
      env: {
        ...process.env,
        ECLIPSA_NATIVE_MANIFEST: manifestPath,
      },
    },
  )

  const output = JSON.parse(stdout) as {
    finalTree: {
      children: Array<{
        props: Record<string, string>
        tag: string
      }>
      tag: string
    }
    initialTree: {
      tag: string
    }
  }

  if (output.initialTree.tag !== 'swiftui:window-group') {
    throw new Error(`Unexpected root tag: ${output.initialTree.tag}`)
  }
  if (output.finalTree.children[0]?.tag !== 'swiftui:vstack') {
    throw new Error('Missing SwiftUI stack root after smoke verification.')
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
