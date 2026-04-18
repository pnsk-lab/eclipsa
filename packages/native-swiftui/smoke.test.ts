import { execFile, spawnSync } from 'node:child_process'
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createBuilder, createServer } from 'vite'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { native } from '../native/vite.ts'
import { swiftui } from './vite.ts'

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
const packagePath = resolve(currentDir, './macos-swiftui')
const smokeExecutablePath = resolve(packagePath, '.build', 'debug', 'EclipsaNativeSmoke')
const repoRoot = resolve(currentDir, '../..')
const execFileAsync = promisify(execFile)
const eclipsaEntry = resolve(repoRoot, 'packages/eclipsa/mod.ts')
const eclipsaInternalEntry = resolve(repoRoot, 'packages/eclipsa/core/internal.ts')
const nativeEntry = resolve(repoRoot, 'packages/native/mod.ts')
const nativeJsxRuntime = resolve(repoRoot, 'packages/native/jsx-runtime.ts')
const nativeJsxDevRuntime = resolve(repoRoot, 'packages/native/jsx-dev-runtime.ts')
const nativeCoreEntry = resolve(repoRoot, 'packages/native-core/mod.ts')
const nativeSwiftUIEntry = resolve(repoRoot, 'packages/native-swiftui/mod.ts')

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

const buildSmokeExecutable = async () => {
  await execFileAsync(
    'swift',
    ['build', '--quiet', '--package-path', packagePath, '--product', 'EclipsaNativeSmoke'],
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
  const root = await mkdtemp(resolve(tmpdir(), 'eclipsa-native-swiftui-hmr-'))
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
        name: '@test/native-swiftui-hmr-app',
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
      `import { WindowGroup } from '@eclipsa/native-swiftui'`,
      `export default function Layout(props: { children?: unknown }) {`,
      `  return <WindowGroup>{props.children}</WindowGroup>`,
      `}`,
      '',
    ].join('\n'),
  )
  return root
}

const writePageSource = async (root: string, title: string) => {
  await writeFile(
    resolve(root, 'app', '+page.tsx'),
    [
      `import { Text, VStack } from '@eclipsa/native-swiftui'`,
      `export default function App() {`,
      `  return <VStack><Text value=${JSON.stringify(title)} /></VStack>`,
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
      `import { Button, Text, TextField, Toggle, VStack } from '@eclipsa/native-swiftui'`,
      `export default function App() {`,
      `  const count = useSignal(0)`,
      `  const enabled = useSignal(true)`,
      `  const name = useSignal('SwiftUI')`,
      `  const runtimeStatus = useSignal('runtime pending')`,
      `  return (`,
      `    <VStack spacing={16}>`,
      `      <Text value="Eclipsa Native SwiftUI" />`,
      `      <Text value={runtimeStatus.value} />`,
      `      <Text value={\`Hello \${name.value} · \${enabled.value ? 'enabled' : 'disabled'} · count \${count.value}\`} />`,
      `      <Button`,
      `        onPress={() => {`,
      `          getNativeRuntime()`,
      `          runtimeStatus.value = 'runtime ready'`,
      `          count.value += 1`,
      `        }}`,
      `        title={\`Count \${count.value}\`}`,
      `      />`,
      `      <TextField`,
      `        onInput={(value: string) => { name.value = String(value ?? '') }}`,
      `        placeholder="Name"`,
      `        value={name.value}`,
      `      />`,
      `      <Toggle`,
      `        onToggle={(value: boolean) => { enabled.value = Boolean(value) }}`,
      `        title="Enabled"`,
      `        value={enabled.value}`,
      `      />`,
      `    </VStack>`,
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
      target: swiftui({
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
        find: /^@eclipsa\/native-swiftui$/,
        replacement: nativeSwiftUIEntry,
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
    strictPort: true,
  },
})

const buildFixture = async (root: string) => {
  const builder = await createBuilder(resolveConfig(root, 0))
  await builder.buildApp()
  return resolve(root, 'dist', 'native', 'manifest.json')
}

const darwinOnly = process.platform === 'darwin' ? it : it.skip

describe('@eclipsa/native-swiftui smoke host', () => {
  const cleanup = new Set<string>()

  beforeAll(async () => {
    if (process.platform !== 'darwin') {
      return
    }
    await buildSmokeExecutable()
  }, 60_000)

  afterEach(async () => {
    for (const directory of cleanup) {
      await rm(directory, { force: true, recursive: true })
    }
    cleanup.clear()
  })

  darwinOnly(
    'boots the built manifest, exposes the public runtime API, and applies SwiftUI events',
    async () => {
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

      expect(output.initialTree.tag).toBe('swiftui:window-group')
      expect(
        initialNodes.some(
          (node) => node.tag === 'swiftui:text' && node.props.value === 'Eclipsa Native SwiftUI',
        ),
      ).toBe(true)
      expect(
        finalNodes.some(
          (node) => node.tag === 'swiftui:text' && node.props.value === 'runtime ready',
        ),
      ).toBe(true)
      expect(
        initialNodes.some(
          (node) => node.tag === 'swiftui:button' && node.props.title === 'Count 0',
        ),
      ).toBe(true)
      expect(
        finalNodes.some((node) => node.tag === 'swiftui:button' && node.props.title === 'Count 1'),
      ).toBe(true)
      expect(
        finalNodes.some(
          (node) =>
            node.tag === 'swiftui:text' && node.props.value === 'Hello macOS · disabled · count 1',
        ),
      ).toBe(true)
      expect(
        finalNodes.some(
          (node) => node.tag === 'swiftui:text-field' && node.props.value === 'macOS',
        ),
      ).toBe(true)
      expect(
        finalNodes.some((node) => node.tag === 'swiftui:toggle' && node.props.value === 'false'),
      ).toBe(true)
    },
    60_000,
  )

  darwinOnly(
    'reloads the Swift runtime when native source changes during dev',
    async () => {
      const root = await createFixture()
      cleanup.add(root)
      await writePageSource(root, 'Initial Native Title')
      const readyFile = resolve(root, 'runtime-ready')

      const server = await createServer(resolveConfig(root, 0))

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
            (node) => node.tag === 'swiftui:text' && node.props.value === 'Initial Native Title',
          ),
        ).toBe(true)
        expect(
          finalNodes.some(
            (node) => node.tag === 'swiftui:text' && node.props.value === 'Updated Native Title',
          ),
        ).toBe(true)
        expect(
          finalNodes.find(
            (node) => node.tag === 'swiftui:text' && node.props.value === 'Updated Native Title',
          )?.id,
        ).toBe(
          initialNodes.find(
            (node) => node.tag === 'swiftui:text' && node.props.value === 'Initial Native Title',
          )?.id,
        )
      } finally {
        await server.close()
      }
    },
    60_000,
  )
})
