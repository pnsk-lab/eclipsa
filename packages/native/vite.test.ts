import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createBuilder, createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { native } from './vite.ts'
import { swiftui } from '../native-swiftui/vite.ts'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const eclipsaEntry = path.join(repoRoot, 'packages/eclipsa/mod.ts')
const eclipsaInternalEntry = path.join(repoRoot, 'packages/eclipsa/core/internal.ts')
const nativeEntry = path.join(repoRoot, 'packages/native/mod.ts')
const nativeJsxRuntime = path.join(repoRoot, 'packages/native/jsx-runtime.ts')
const nativeJsxDevRuntime = path.join(repoRoot, 'packages/native/jsx-dev-runtime.ts')
const nativeCoreEntry = path.join(repoRoot, 'packages/native-core/mod.ts')
const nativeSwiftUIEntry = path.join(repoRoot, 'packages/native-swiftui/mod.ts')

const createFixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'eclipsa-native-vite-'))
  await mkdir(path.join(root, 'app'), { recursive: true })
  await writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: path.join(repoRoot, 'tsconfig.json'),
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
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: '@test/native-app',
        private: true,
        type: 'module',
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, 'app', '+layout.tsx'),
    [
      `import { WindowGroup } from '@eclipsa/native-swiftui'`,
      `export default function Layout(props: { children?: unknown }) {`,
      `  return <WindowGroup>{props.children}</WindowGroup>`,
      `}`,
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(root, 'app', '+page.tsx'),
    [
      `import { useSignal } from 'eclipsa'`,
      `import { Text, VStack } from '@eclipsa/native-swiftui'`,
      `export default function App() {`,
      `  const count = useSignal(1)`,
      `  return <VStack><Text value={\`count \${count.value}\`} /></VStack>`,
      `}`,
      '',
    ].join('\n'),
  )
  return root
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

const resolveConfig = (root: string) => ({
  appType: 'custom' as const,
  plugins: [native({ target: swiftui() })],
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
})

describe('@eclipsa/native vite plugin', () => {
  const cleanup = new Set<string>()

  afterEach(async () => {
    for (const directory of cleanup) {
      await rm(directory, { force: true, recursive: true })
    }
    cleanup.clear()
  })

  it('builds a single bootstrap bundle plus manifest', async () => {
    const root = await createFixture()
    cleanup.add(root)

    const builder = await createBuilder({
      ...resolveConfig(root),
    })
    await builder.buildApp()
    const outDir = path.join(root, 'dist', 'native')
    const fileNames = await readdir(outDir)
    expect(fileNames).toContain('bootstrap.js')
    expect(fileNames).toContain('manifest.json')

    const manifestSource = await readFile(path.join(outDir, 'manifest.json'), 'utf8')
    expect(manifestSource).toContain('"target": "swiftui"')
    expect(manifestSource).toContain('"bootstrap": "./bootstrap.js"')
  })

  it('serves a native dev manifest plus module RPC through vite dev', async () => {
    const root = await createFixture()
    cleanup.add(root)

    const server = await createServer({
      ...resolveConfig(root),
      server: {
        host: '127.0.0.1',
        port: 0,
      },
    })
    try {
      await server.listen()
      const address = server.httpServer?.address()
      const port = typeof address === 'object' && address ? address.port : 5173
      await waitFor(async () => {
        const response = await fetch(`http://127.0.0.1:${port}/__eclipsa_native__/manifest.json`)
        return response.status === 200
      })
      const manifestResponse = await fetch(
        `http://127.0.0.1:${port}/__eclipsa_native__/manifest.json`,
      )
      expect(manifestResponse.status).toBe(200)
      const manifest = await manifestResponse.json()
      expect(manifest.mode).toBe('dev')
      expect(manifest.target).toBe('swiftui')
      expect(manifest.entry).toBe('virtual:eclipsa-native/bootstrap')
      expect(typeof manifest.rpc).toBe('string')
      expect(typeof manifest.hmr?.url).toBe('string')
      expect(server.environments.nativeSwift).toBeDefined()

      const rpcResponse = await fetch(`http://127.0.0.1:${port}/__eclipsa_native__/rpc`, {
        body: JSON.stringify({
          data: [manifest.entry, null, { startOffset: 0 }],
          name: 'fetchModule',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(rpcResponse.status).toBe(200)
      const rpcPayload = await rpcResponse.json()
      expect(rpcPayload.result.code).toContain('bootNativeApplication')
      expect(rpcPayload.result.code).toContain('__eclipsaNativeApplyAppUpdate')
      expect(rpcPayload.result.code).toContain('resolveNativeHotRegistry')
      expect(rpcPayload.result.code).toContain('currentNativeModule')
      expect(rpcPayload.result.url).toBe('virtual:eclipsa-native/bootstrap')

      const appRpcResponse = await fetch(`http://127.0.0.1:${port}/__eclipsa_native__/rpc`, {
        body: JSON.stringify({
          data: ['virtual:eclipsa-native/app', null, { startOffset: 0 }],
          name: 'fetchModule',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(appRpcResponse.status).toBe(200)
      const appRpcPayload = await appRpcResponse.json()
      expect(appRpcPayload.result.code).toContain('createRouteElement')
      expect(appRpcPayload.result.code).toContain('/app/+layout.tsx')
      expect(appRpcPayload.result.code).toContain('/app/+page.tsx')
      expect(appRpcPayload.result.code).toContain('__vite_ssr_import_meta__.hot.accept')
      expect(appRpcPayload.result.code).toContain('__eclipsa$hotRegistry')
    } finally {
      await server.close()
    }
  }, 15_000)
})
