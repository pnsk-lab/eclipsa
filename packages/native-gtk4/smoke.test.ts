import { execFile, spawnSync } from 'node:child_process'
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createBuilder, createServer } from 'vite'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { native } from '../native/vite.ts'
import { gtk4 } from './vite.ts'

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

const currentDir = dirname(fileURLToPath(import.meta.url))
const packagePath = resolve(currentDir, './gtk4-rust')
const smokeExecutablePath = resolve(packagePath, 'target', 'debug', 'eclipsa-native-gtk4-smoke')
const repoRoot = resolve(currentDir, '../..')
const execFileAsync = promisify(execFile)
const eclipsaEntry = resolve(repoRoot, 'packages/eclipsa/mod.ts')
const eclipsaInternalEntry = resolve(repoRoot, 'packages/eclipsa/core/internal.ts')
const nativeEntry = resolve(repoRoot, 'packages/native/mod.ts')
const nativeJsxRuntime = resolve(repoRoot, 'packages/native/jsx-runtime.ts')
const nativeJsxDevRuntime = resolve(repoRoot, 'packages/native/jsx-dev-runtime.ts')
const nativeCoreEntry = resolve(repoRoot, 'packages/native-core/mod.ts')
const nativeGtk4Entry = resolve(repoRoot, 'packages/native-gtk4/mod.ts')

const flatten = (node: NativeNodeSnapshot): NativeNodeSnapshot[] => [
  node,
  ...node.children.flatMap(flatten),
]

const waitFor = async (fn: () => Promise<boolean>, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const allocatePort = async () =>
  await new Promise<number>((resolve, reject) => {
    const server = createNetServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a native GTK 4 test port.')))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })

const buildSmokeExecutable = async () => {
  await execFileAsync(
    'cargo',
    [
      'build',
      '--manifest-path',
      resolve(packagePath, 'Cargo.toml'),
      '--bin',
      'eclipsa-native-gtk4-smoke',
    ],
    {
      cwd: currentDir,
      encoding: 'utf8',
    },
  )
  return smokeExecutablePath
}

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const createFixture = async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'eclipsa-native-gtk4-hmr-'))
  await mkdir(resolve(root, 'app'), { recursive: true })
  await writeFile(
    resolve(root, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: resolve(repoRoot, 'tsconfig.json'),
        compilerOptions: {
          jsxImportSource: '@eclipsa/native',
        },
        include: ['./app/**/*.ts', './app/**/*.tsx'],
      },
      null,
      2,
    ),
  )
  await writeFile(
    resolve(root, 'package.json'),
    JSON.stringify(
      {
        name: '@test/native-gtk4-hmr-app',
        private: true,
        type: 'module',
      },
      null,
      2,
    ),
  )
  await writeFile(
    resolve(root, 'app', '+layout.tsx'),
    [
      `export default function Layout(props: { children?: unknown }) {`,
      `  return <window title="GTK 4 Test Window">{props.children}</window>`,
      `}`,
      '',
    ].join('\n'),
  )
  await writeNativeMapSource(root)
  return root
}

const writeNativeMapSource = async (root: string, stackComponent = 'Box') => {
  await writeFile(
    resolve(root, 'app', '+native-map.ts'),
    [
      `import { Button, Box, Switch, Text, TextField, Window } from '@eclipsa/native-gtk4'`,
      `export const button = Button`,
      `export const div = ${stackComponent}`,
      `export const input = TextField`,
      `export const span = Text`,
      `export const toggle = Switch`,
      `export const window = Window`,
      '',
    ].join('\n'),
  )
}

const writePageSource = async (root: string, title: string) => {
  await writeFile(
    resolve(root, 'app', '+page.tsx'),
    [
      `export default function App() {`,
      `  return <div><span value=${JSON.stringify(title)} /></div>`,
      `}`,
      '',
    ].join('\n'),
  )
}

const writeInteractivePageSource = async (root: string) => {
  await writeFile(
    resolve(root, 'app', '+page.tsx'),
    [
      `import { getNativeRuntime } from '@eclipsa/native'`,
      `import { useSignal } from 'eclipsa'`,
      `export default function App() {`,
      `  const count = useSignal(0)`,
      `  const enabled = useSignal(true)`,
      `  const name = useSignal('GTK')`,
      `  const runtimeStatus = useSignal('runtime pending')`,
      `  return (`,
      `    <div orientation="vertical" spacing={16}>`,
      `      <span value="Eclipsa Native GTK 4" />`,
      `      <span value={runtimeStatus.value} />`,
      `      <span value={\`Hello \${name.value} · \${enabled.value ? 'enabled' : 'disabled'} · count \${count.value}\`} />`,
      `      <button`,
      `        onClick={() => {`,
      `          getNativeRuntime()`,
      `          runtimeStatus.value = 'runtime ready'`,
      `          count.value += 1`,
      `        }}`,
      `        title={\`Count \${count.value}\`}`,
      `      />`,
      `      <input`,
      `        onInput={(value: string) => { name.value = String(value ?? '') }}`,
      `        placeholder="Name"`,
      `        value={name.value}`,
      `      />`,
      `      <toggle`,
      `        onToggle={(value: boolean) => { enabled.value = Boolean(value) }}`,
      `        title="Enabled"`,
      `        value={enabled.value}`,
      `      />`,
      `    </div>`,
      `  )`,
      `}`,
      '',
    ].join('\n'),
  )
}

const resolveConfig = (root: string, port: number) => ({
  appType: 'custom' as const,
  plugins: [
    native({
      target: gtk4({
        launch: false,
      }),
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^eclipsa\/internal$/,
        replacement: eclipsaInternalEntry,
      },
      {
        find: /^eclipsa$/,
        replacement: eclipsaEntry,
      },
      {
        find: /^@eclipsa\/native\/jsx-dev-runtime$/,
        replacement: nativeJsxDevRuntime,
      },
      {
        find: /^@eclipsa\/native\/jsx-runtime$/,
        replacement: nativeJsxRuntime,
      },
      {
        find: /^@eclipsa\/native$/,
        replacement: nativeEntry,
      },
      {
        find: /^@eclipsa\/native-core$/,
        replacement: nativeCoreEntry,
      },
      {
        find: /^@eclipsa\/native-gtk4$/,
        replacement: nativeGtk4Entry,
      },
    ],
  },
  root,
  server: {
    fs: {
      allow: [repoRoot],
    },
    host: '127.0.0.1',
    port,
    strictPort: port > 0,
  },
})

const buildFixture = async (root: string) => {
  const builder = await createBuilder(resolveConfig(root, 0))
  await builder.buildApp()
  return resolve(root, 'dist', 'native', 'manifest.json')
}

describe('@eclipsa/native-gtk4 smoke host', () => {
  const cleanup = new Set<string>()

  beforeAll(async () => {
    await buildSmokeExecutable()
  }, 120_000)

  afterEach(async () => {
    for (const directory of cleanup) {
      await rm(directory, { force: true, recursive: true })
    }
    cleanup.clear()
  })

  it('boots the built manifest and applies GTK 4 events through the Rust smoke host', async () => {
    const root = await createFixture()
    cleanup.add(root)
    await writeInteractivePageSource(root)
    const manifestPath = await buildFixture(root)
    const result = spawnSync(smokeExecutablePath, [], {
      cwd: currentDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        ECLIPSA_NATIVE_MANIFEST: manifestPath,
      },
    })

    expect(result.status, result.stderr).toBe(0)

    const output = JSON.parse(result.stdout) as SmokeOutput
    const initialNodes = flatten(output.initialTree)
    const finalNodes = flatten(output.finalTree)

    expect(output.initialTree.tag).toBe('gtk4:window')
    expect(
      initialNodes.some(
        (node) => node.tag === 'gtk4:text' && node.props.value === 'Eclipsa Native GTK 4',
      ),
    ).toBe(true)
    expect(
      finalNodes.some((node) => node.tag === 'gtk4:text' && node.props.value === 'runtime ready'),
    ).toBe(true)
    expect(
      initialNodes.some((node) => node.tag === 'gtk4:button' && node.props.title === 'Count 0'),
    ).toBe(true)
    expect(
      finalNodes.some((node) => node.tag === 'gtk4:button' && node.props.title === 'Count 1'),
    ).toBe(true)
    expect(
      finalNodes.some(
        (node) =>
          node.tag === 'gtk4:text' && node.props.value === 'Hello GTK 4 · disabled · count 1',
      ),
    ).toBe(true)
    expect(
      finalNodes.some((node) => node.tag === 'gtk4:text-field' && node.props.value === 'GTK 4'),
    ).toBe(true)
    expect(
      finalNodes.some((node) => node.tag === 'gtk4:switch' && node.props.value === 'false'),
    ).toBe(true)
  }, 120_000)

  it('reloads the Rust runtime when native source changes during dev', async () => {
    const root = await createFixture()
    cleanup.add(root)
    await writePageSource(root, 'Initial Native Title')
    const readyFile = resolve(root, 'runtime-ready')

    const server = await createServer(resolveConfig(root, await allocatePort()))

    try {
      await server.listen()
      const address = server.httpServer?.address()
      const port = typeof address === 'object' && address ? address.port : 5173
      await waitFor(async () => {
        const response = await fetch(`http://127.0.0.1:${port}/__eclipsa_native__/manifest.json`)
        return response.ok
      })
      await delay(300)

      const smokePromise = execFileAsync(smokeExecutablePath, [], {
        cwd: currentDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          ECLIPSA_NATIVE_MANIFEST: `http://127.0.0.1:${port}/__eclipsa_native__/manifest.json`,
          ECLIPSA_NATIVE_SMOKE_READY_FILE: readyFile,
          ECLIPSA_NATIVE_SMOKE_WAIT_FOR_SECONDS: '3',
        },
      })

      await waitFor(() => fileExists(readyFile))
      await writePageSource(root, 'Updated Native Title')

      const { stdout } = await smokePromise
      const output = JSON.parse(stdout) as SmokeOutput
      const initialNodes = flatten(output.initialTree)
      const finalNodes = flatten(output.finalTree)

      expect(output.finalTree.id).toBe(output.initialTree.id)
      expect(
        initialNodes.some(
          (node) => node.tag === 'gtk4:text' && node.props.value === 'Initial Native Title',
        ),
      ).toBe(true)
      expect(
        finalNodes.some(
          (node) => node.tag === 'gtk4:text' && node.props.value === 'Updated Native Title',
        ),
      ).toBe(true)
      expect(
        finalNodes.find(
          (node) => node.tag === 'gtk4:text' && node.props.value === 'Updated Native Title',
        )?.id,
      ).toBe(
        initialNodes.find(
          (node) => node.tag === 'gtk4:text' && node.props.value === 'Initial Native Title',
        )?.id,
      )
    } finally {
      await server.close()
    }
  }, 120_000)
})
