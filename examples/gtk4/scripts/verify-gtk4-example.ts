import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(root, 'dist/native/manifest.json')
const bootstrapPath = path.join(root, 'dist/native/bootstrap.js')
const smokePackageRoot = path.resolve(root, '../../packages/native-gtk4/gtk4-rust')
const smokeExecutablePath = path.join(smokePackageRoot, 'target/debug/eclipsa-native-gtk4-smoke')

interface NativeNodeSnapshot {
  children: NativeNodeSnapshot[]
  id: string
  props: Record<string, string>
  tag: string
  text?: string | null
}

interface SmokeOutput {
  finalTree: NativeNodeSnapshot
  initialTree: NativeNodeSnapshot
}

const flatten = (node: NativeNodeSnapshot): NativeNodeSnapshot[] => [
  node,
  ...node.children.flatMap(flatten),
]

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

  if (manifest.target !== 'gtk4') {
    throw new Error(`Expected gtk4 target manifest, got ${manifest.target}.`)
  }
  if (manifest.platform !== 'linux') {
    throw new Error(`Expected linux platform manifest, got ${manifest.platform}.`)
  }
  if (manifest.bootstrap !== './bootstrap.js') {
    throw new Error(`Unexpected bootstrap entry: ${manifest.bootstrap}`)
  }

  const bootstrapSource = await readFile(bootstrapPath, 'utf8')
  if (!bootstrapSource.includes('bootNativeApplication')) {
    throw new Error('Expected native bootstrap bundle to include bootNativeApplication.')
  }
  if (!bootstrapSource.includes('gtk4:window')) {
    throw new Error('Expected GTK 4 example bootstrap to include the window primitive.')
  }
  if (!bootstrapSource.includes('gtk4:text-field')) {
    throw new Error('Expected GTK 4 example bootstrap to include the text field primitive.')
  }

  await execFileAsync(
    'cargo',
    [
      'build',
      '--manifest-path',
      path.join(smokePackageRoot, 'Cargo.toml'),
      '--bin',
      'eclipsa-native-gtk4-smoke',
    ],
    {
      cwd: root,
      env: process.env,
    },
  )

  const { stdout } = await execFileAsync(smokeExecutablePath, [], {
    cwd: root,
    env: {
      ...process.env,
      ECLIPSA_NATIVE_MANIFEST: manifestPath,
    },
  })
  const output = JSON.parse(stdout) as SmokeOutput
  const initialNodes = flatten(output.initialTree)
  const finalNodes = flatten(output.finalTree)

  if (output.initialTree.tag !== 'gtk4:window') {
    throw new Error(`Expected a gtk4:window root, got ${output.initialTree.tag}.`)
  }
  if (
    !initialNodes.some(
      (node) => node.tag === 'gtk4:text' && node.props.value === 'Eclipsa Native GTK 4 Example',
    )
  ) {
    throw new Error('Expected the GTK 4 example to render its initial title text.')
  }
  if (!initialNodes.some((node) => node.tag === 'gtk4:button' && node.props.title === 'Count 0')) {
    throw new Error('Expected the GTK 4 example button to start at Count 0.')
  }
  if (!finalNodes.some((node) => node.tag === 'gtk4:button' && node.props.title === 'Count 1')) {
    throw new Error('Expected the Rust smoke host to increment the GTK 4 example button.')
  }
  if (
    !finalNodes.some(
      (node) => node.tag === 'gtk4:text' && node.props.value === 'Hello GTK 4 · disabled · count 1',
    )
  ) {
    throw new Error(
      'Expected the Rust smoke host to drive the example state through button/input/toggle events.',
    )
  }
  if (!finalNodes.some((node) => node.tag === 'gtk4:switch' && node.props.value === 'false')) {
    throw new Error('Expected the Rust smoke host to toggle the GTK 4 example switch off.')
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
