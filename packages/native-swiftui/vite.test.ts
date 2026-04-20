import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { native } from '../native/vite.ts'
import { NATIVE_SWIFT_ENVIRONMENT_NAME, swiftui } from './vite.ts'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const eclipsaEntry = path.join(repoRoot, 'packages/eclipsa/mod.ts')
const eclipsaInternalEntry = path.join(repoRoot, 'packages/eclipsa/core/internal.ts')
const nativeRuntimeEntry = path.join(repoRoot, 'packages/native/runtime-api.ts')
const nativeJsxRuntime = path.join(repoRoot, 'packages/native/jsx-runtime.ts')
const nativeJsxDevRuntime = path.join(repoRoot, 'packages/native/jsx-dev-runtime.ts')
const nativeCoreEntry = path.join(repoRoot, 'packages/native-core/mod.ts')
const nativeSwiftUIEntry = path.join(repoRoot, 'packages/native-swiftui/mod.ts')
const nativeSwiftUICommonEntry = path.join(repoRoot, 'packages/native-swiftui/common.tsx')
const testServerPort = 5183

const fileExists = async (filePath: string) => {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
}

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

const createFixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'eclipsa-native-swiftui-env-'))
  await mkdir(path.join(root, 'app'), { recursive: true })
  await writeFile(
    path.join(root, 'app', '+layout.tsx'),
    [
      `export default function Layout(props: { children?: unknown }) {`,
      `  return <windowGroup>{props.children}</windowGroup>`,
      `}`,
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(root, 'app', '+native-map.ts'),
    [
      `import { Text, VStack, WindowGroup } from '@eclipsa/native-swiftui'`,
      `export const div = VStack`,
      `export const span = Text`,
      `export const windowGroup = WindowGroup`,
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(root, 'app', '+page.tsx'),
    [
      `import { useSignal } from 'eclipsa'`,
      `export default function App() {`,
      `  const count = useSignal(1)`,
      `  return <div><span value={\`count \${count.value}\`} /></div>`,
      `}`,
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(root, 'fake-host.mjs'),
    [
      `import { writeFile } from 'node:fs/promises'`,
      `const [launchedFile, terminatedFile] = process.argv.slice(2)`,
      `const manifestUrl = process.env.ECLIPSA_NATIVE_MANIFEST`,
      `const manifest = await fetch(manifestUrl).then((response) => response.json())`,
      `await writeFile(launchedFile, JSON.stringify({ manifest, manifestUrl }))`,
      `const shutdown = () => {`,
      `  void writeFile(terminatedFile, 'terminated').finally(() => process.exit(0))`,
      `}`,
      `process.on('SIGTERM', shutdown)`,
      `process.on('SIGINT', shutdown)`,
      `setInterval(() => {}, 1_000)`,
      '',
    ].join('\n'),
  )
  return root
}

const resolveConfig = (root: string, command: readonly [string, ...string[]]) => ({
  appType: 'custom' as const,
  plugins: [
    native({
      target: swiftui({
        command,
        cwd: root,
        startupTimeoutMs: 15_000,
        stdio: 'ignore',
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
        find: /^@eclipsa\/native\/runtime$/,
        replacement: nativeRuntimeEntry,
      },
      {
        find: /^@eclipsa\/native-core$/,
        replacement: nativeCoreEntry,
      },
      {
        find: /^@eclipsa\/native-swiftui\/common$/,
        replacement: nativeSwiftUICommonEntry,
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
    port: testServerPort,
    strictPort: true,
  },
})

describe('@eclipsa/native-swiftui vite environment', () => {
  const cleanup = new Set<string>()

  afterEach(async () => {
    for (const directory of cleanup) {
      await rm(directory, { force: true, recursive: true })
    }
    cleanup.clear()
  })

  it('launches and stops the nativeSwift host automatically during dev', async () => {
    const root = await createFixture()
    cleanup.add(root)

    const launchedFile = path.join(root, 'launched.json')
    const terminatedFile = path.join(root, 'terminated.txt')
    const server = await createServer(
      resolveConfig(root, ['bun', path.join(root, 'fake-host.mjs'), launchedFile, terminatedFile]),
    )

    try {
      await server.listen()
      expect(server.environments[NATIVE_SWIFT_ENVIRONMENT_NAME]).toBeDefined()
      expect(
        typeof (server.environments[NATIVE_SWIFT_ENVIRONMENT_NAME] as { dispatchFetch?: unknown })
          .dispatchFetch,
      ).toBe('function')
      await waitFor(() => fileExists(launchedFile))
      const launched = JSON.parse(await readFile(launchedFile, 'utf8')) as {
        manifest: {
          target: string
        }
        manifestUrl: string
      }

      expect(launched.manifest.target).toBe('swiftui')
      expect(launched.manifestUrl).toContain('/__eclipsa_native__/manifest.json')
    } finally {
      await server.close()
    }

    await waitFor(() => fileExists(terminatedFile))
  }, 30_000)
})
