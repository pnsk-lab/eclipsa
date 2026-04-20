import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { native } from '../native/vite.ts'
import { gtk4, NATIVE_GTK4_ENVIRONMENT_NAME } from './vite.ts'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const eclipsaEntry = path.join(repoRoot, 'packages/eclipsa/mod.ts')
const eclipsaInternalEntry = path.join(repoRoot, 'packages/eclipsa/core/internal.ts')
const nativeEntry = path.join(repoRoot, 'packages/native/mod.ts')
const nativeJsxRuntime = path.join(repoRoot, 'packages/native/jsx-runtime.ts')
const nativeJsxDevRuntime = path.join(repoRoot, 'packages/native/jsx-dev-runtime.ts')
const nativeCoreEntry = path.join(repoRoot, 'packages/native-core/mod.ts')
const nativeGtk4Entry = path.join(repoRoot, 'packages/native-gtk4/mod.ts')
const testServerPort = 5185

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
  const root = await mkdtemp(path.join(tmpdir(), 'eclipsa-native-gtk4-env-'))
  await mkdir(path.join(root, 'app'), { recursive: true })
  await writeFile(
    path.join(root, 'app', '+layout.tsx'),
    [
      `export default function Layout(props: { children?: unknown }) {`,
      `  return <window>{props.children}</window>`,
      `}`,
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(root, 'app', '+native-map.ts'),
    [
      `import { Box, Text, Window } from '@eclipsa/native-gtk4'`,
      `export const div = Box`,
      `export const span = Text`,
      `export const window = Window`,
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
      target: gtk4({
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
    port: testServerPort,
    strictPort: true,
  },
})

describe('@eclipsa/native-gtk4 vite environment', () => {
  const cleanup = new Set<string>()

  afterEach(async () => {
    for (const directory of cleanup) {
      await rm(directory, { force: true, recursive: true })
    }
    cleanup.clear()
  })

  it('launches and stops a configured GTK 4 host automatically during dev', async () => {
    const root = await createFixture()
    cleanup.add(root)

    const launchedFile = path.join(root, 'launched.json')
    const terminatedFile = path.join(root, 'terminated.txt')
    const server = await createServer(
      resolveConfig(root, ['bun', path.join(root, 'fake-host.mjs'), launchedFile, terminatedFile]),
    )

    try {
      await server.listen()
      expect(server.environments[NATIVE_GTK4_ENVIRONMENT_NAME]).toBeDefined()
      expect(
        typeof (server.environments[NATIVE_GTK4_ENVIRONMENT_NAME] as { dispatchFetch?: unknown })
          .dispatchFetch,
      ).toBe('function')
      await waitFor(() => fileExists(launchedFile))
      const launched = JSON.parse(await readFile(launchedFile, 'utf8')) as {
        manifest: {
          platform: string
          target: string
        }
        manifestUrl: string
      }

      expect(launched.manifest.target).toBe('gtk4')
      expect(launched.manifest.platform).toBe('linux')
      expect(launched.manifestUrl).toContain('/__eclipsa_native__/manifest.json')
    } finally {
      await server.close()
    }

    await waitFor(() => fileExists(terminatedFile))
  }, 30_000)
})
