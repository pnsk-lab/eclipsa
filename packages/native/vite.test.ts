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
const nativeRuntimeEntry = path.join(repoRoot, 'packages/native/runtime-api.ts')
const nativeJsxRuntime = path.join(repoRoot, 'packages/native/jsx-runtime.ts')
const nativeJsxDevRuntime = path.join(repoRoot, 'packages/native/jsx-dev-runtime.ts')
const nativeCoreEntry = path.join(repoRoot, 'packages/native-core/mod.ts')
const nativeSwiftUIEntry = path.join(repoRoot, 'packages/native-swiftui/mod.ts')
const nativeSwiftUICommonEntry = path.join(repoRoot, 'packages/native-swiftui/common.tsx')

type ResolveAlias = {
  find: RegExp
  replacement: string
}

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
      `import { Text as CommonText } from '@eclipsa/native'`,
      `import { useSignal } from 'eclipsa'`,
      `export default function App() {`,
      `  const count = useSignal(1)`,
      `  return <div><CommonText>{\`count \${count.value}\`}</CommonText></div>`,
      `}`,
      '',
    ].join('\n'),
  )
  return root
}

const createHostTargetFixture = async () => {
  const packageRoot = await mkdtemp(path.join(tmpdir(), 'eclipsa-native-host-package-'))
  await mkdir(path.join(packageRoot, 'host', 'binaries', 'darwin-arm64'), { recursive: true })
  await writeFile(
    path.join(packageRoot, 'mod.ts'),
    [
      `import { defineNativeComponent } from '@eclipsa/native/runtime'`,
      `export const WindowGroup = defineNativeComponent('fixture:window-group')`,
      `export const VStack = defineNativeComponent('fixture:vstack')`,
      `export const Text = defineNativeComponent('fixture:text')`,
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(packageRoot, 'common.tsx'),
    [
      `import { Text as NativeText, VStack, WindowGroup } from './mod.ts'`,
      `export const AppRoot = WindowGroup`,
      `export const View = VStack`,
      `export const Text = NativeText`,
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(packageRoot, 'host', 'manifest.json'),
    JSON.stringify(
      {
        assets: [],
        bundleDir: './host',
        formatVersion: 1,
        packageName: '@test/native-host-target',
        targets: [
          {
            arch: 'arm64',
            entrypoint: './binaries/darwin-arm64/FixtureHost',
            files: ['./binaries/darwin-arm64/FixtureHost'],
            id: 'darwin-arm64',
            os: 'darwin',
          },
        ],
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(packageRoot, 'host', 'binaries', 'darwin-arm64', 'FixtureHost'),
    '#!/bin/sh\n',
  )
  return {
    commonEntry: path.join(packageRoot, 'common.tsx'),
    packageRoot,
    workspaceFallback: path.join(packageRoot, 'mod.ts'),
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

const resolveConfig = (
  root: string,
  {
    aliases = [],
    target = swiftui(),
  }: {
    aliases?: ResolveAlias[]
    target?: Parameters<typeof native>[0]['target']
  } = {},
) => ({
  appType: 'custom' as const,
  plugins: [native({ target })],
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
      ...aliases,
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

  it('copies the bundled native host bundle into the app dist output', async () => {
    const root = await createFixture()
    const hostTarget = await createHostTargetFixture()
    cleanup.add(root)
    cleanup.add(hostTarget.packageRoot)

    const builder = await createBuilder(
      resolveConfig(root, {
        aliases: [
          {
            find: /^@test\/native-host-target\/common$/,
            replacement: hostTarget.commonEntry,
          },
          {
            find: /^@test\/native-host-target$/,
            replacement: hostTarget.workspaceFallback,
          },
        ],
        target: {
          bindingPackage: '@test/native-host-target',
          bundledHostDir: 'host',
          commonEntry: '@test/native-host-target/common',
          commonEntryFallback: hostTarget.commonEntry,
          defaultMap: {
            div: 'VStack',
            span: 'Text',
            windowGroup: 'WindowGroup',
          },
          environmentName: 'nativeFixture',
          name: 'fixture',
          platform: 'darwin',
          workspaceFallback: hostTarget.workspaceFallback,
        },
      }),
    )
    await builder.buildApp()

    const outDir = path.join(root, 'dist', 'native')
    const manifestSource = await readFile(path.join(outDir, 'manifest.json'), 'utf8')
    expect(manifestSource).toContain('"host": "./host/manifest.json"')
    expect(await readFile(path.join(outDir, 'host', 'manifest.json'), 'utf8')).toContain(
      './binaries/darwin-arm64/FixtureHost',
    )
    expect(
      await readFile(path.join(outDir, 'host', 'binaries', 'darwin-arm64', 'FixtureHost'), 'utf8'),
    ).toBe('#!/bin/sh\n')
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
      expect(server.config.resolve.alias).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            find: /^@eclipsa\/native\/runtime$/,
            replacement: nativeRuntimeEntry,
          }),
        ]),
      )

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
      expect(rpcPayload.result.code).toContain('eclipsa:native-map-update')
      expect(rpcPayload.result.code).toContain(
        'runner.importModule("virtual:eclipsa-native/map", null);',
      )
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

      const pageRpcResponse = await fetch(`http://127.0.0.1:${port}/__eclipsa_native__/rpc`, {
        body: JSON.stringify({
          data: ['/app/+page.tsx', null, { startOffset: 0 }],
          name: 'fetchModule',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(pageRpcResponse.status).toBe(200)
      const pageRpcPayload = await pageRpcResponse.json()
      expect(pageRpcPayload.result.code).toContain('/packages/native-swiftui/common.tsx')
      expect(pageRpcPayload.result.code).not.toContain('/packages/native/mod.ts')

      const mapRpcResponse = await fetch(`http://127.0.0.1:${port}/__eclipsa_native__/rpc`, {
        body: JSON.stringify({
          data: ['virtual:eclipsa-native/map', null, { startOffset: 0 }],
          name: 'fetchModule',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(mapRpcResponse.status).toBe(200)
      const mapRpcPayload = await mapRpcResponse.json()
      expect(mapRpcPayload.result.code).toContain('const resolveNativeMap = (value) =>')
      expect(mapRpcPayload.result.code).toContain('/app/+native-map.ts')
      expect(mapRpcPayload.result.code).toContain('setNativeMap')
      expect(mapRpcPayload.result.code).not.toContain(
        'globalThis.__eclipsaNativeMountedApp?.rerender?.();',
      )
    } finally {
      await server.close()
    }
  }, 15_000)
})
