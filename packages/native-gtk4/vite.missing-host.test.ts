import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, createLogger } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { native } from '../native/vite.ts'

const spawnSpy = vi.hoisted(() => vi.fn())
const fsMockState = vi.hoisted(() => ({
  blockedPaths: new Set<string>(),
  virtualFiles: new Map<string, string>(),
}))

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    spawn: spawnSpy,
  }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync(value: Parameters<typeof actual.existsSync>[0]) {
      const filePath = String(value)
      if (fsMockState.virtualFiles.has(filePath)) {
        return true
      }
      if (fsMockState.blockedPaths.has(filePath)) {
        return false
      }
      return actual.existsSync(value)
    },
    readFileSync(
      value: Parameters<typeof actual.readFileSync>[0],
      options?: Parameters<typeof actual.readFileSync>[1],
    ) {
      const filePath = String(value)
      if (fsMockState.virtualFiles.has(filePath)) {
        const source = fsMockState.virtualFiles.get(filePath) ?? ''
        return typeof options === 'string' || (options && 'encoding' in options && options.encoding)
          ? source
          : Buffer.from(source)
      }
      return actual.readFileSync(value, options as never)
    },
  }
})

const { NATIVE_GTK4_ENVIRONMENT_NAME, gtk4 } = await import('./vite.ts')

const repoRoot = path.resolve(import.meta.dirname, '../..')
const guiHostBinaryName = `eclipsa-native-gtk4${process.platform === 'win32' ? '.exe' : ''}`
const bundledHostManifestPaths = [
  path.join(repoRoot, 'packages/native-gtk4/host/manifest.json'),
  path.join(repoRoot, 'packages/native-gtk4/dist/host/manifest.json'),
]
const workspaceCargoManifestPath = path.join(repoRoot, 'packages/native-gtk4/gtk4-rust/Cargo.toml')
const workspaceGuiHostPaths = [
  path.join(repoRoot, `packages/native-gtk4/gtk4-rust/target/debug/${guiHostBinaryName}`),
  path.join(repoRoot, `packages/native-gtk4/gtk4-rust/target/release/${guiHostBinaryName}`),
]
const eclipsaEntry = path.join(repoRoot, 'packages/eclipsa/mod.ts')
const eclipsaInternalEntry = path.join(repoRoot, 'packages/eclipsa/core/internal.ts')
const nativeRuntimeEntry = path.join(repoRoot, 'packages/native/runtime-api.ts')
const nativeJsxRuntime = path.join(repoRoot, 'packages/native/jsx-runtime.ts')
const nativeJsxDevRuntime = path.join(repoRoot, 'packages/native/jsx-dev-runtime.ts')
const nativeCoreEntry = path.join(repoRoot, 'packages/native-core/mod.ts')
const nativeGtk4Entry = path.join(repoRoot, 'packages/native-gtk4/mod.ts')
const nativeGtk4CommonEntry = path.join(repoRoot, 'packages/native-gtk4/common.tsx')
const testServerPort = 5186

const waitFor = async (fn: () => boolean, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fn()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

const createMockChildProcess = () => {
  const child = Object.assign(new EventEmitter(), {
    exitCode: null as number | null,
    kill: vi.fn((signal?: NodeJS.Signals) => {
      child.signalCode = signal ?? null
      queueMicrotask(() => {
        child.emit('exit', null, signal ?? null)
      })
      return true
    }),
    signalCode: null as NodeJS.Signals | null,
  })
  return child
}

const createFixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'eclipsa-native-gtk4-missing-host-'))
  await mkdir(path.join(root, 'app'), { recursive: true })
  await writeFile(
    path.join(root, 'app', '+layout.tsx'),
    [
      `export default function Layout(props: { children?: unknown }) {`,
      `  return <applicationWindow title="GTK4">{props.children}</applicationWindow>`,
      `}`,
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(root, 'app', '+native-map.ts'),
    [
      `import { ApplicationWindow, Box, Text } from '@eclipsa/native-gtk4'`,
      `export const applicationWindow = ApplicationWindow`,
      `export const div = Box`,
      `export const span = Text`,
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(root, 'app', '+page.tsx'),
    [
      `export default function App() {`,
      `  return <div spacing={12}><span value="Hello GTK4" /></div>`,
      `}`,
      '',
    ].join('\n'),
  )
  return root
}

const resolveConfig = (root: string) => ({
  appType: 'custom' as const,
  customLogger: createLogger(),
  plugins: [
    native({
      target: gtk4({
        startupTimeoutMs: 15_000,
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
        find: /^@eclipsa\/native-gtk4\/common$/,
        replacement: nativeGtk4CommonEntry,
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

describe('@eclipsa/native-gtk4 default host resolution', () => {
  const cleanup = new Set<string>()

  afterEach(async () => {
    for (const directory of cleanup) {
      await rm(directory, { force: true, recursive: true })
    }
    cleanup.clear()
    fsMockState.blockedPaths.clear()
    fsMockState.virtualFiles.clear()
    spawnSpy.mockReset()
  })

  it('does not launch a host when no GTK4 GUI host is available', async () => {
    spawnSpy.mockImplementation(createMockChildProcess)
    for (const filePath of [
      ...bundledHostManifestPaths,
      ...workspaceGuiHostPaths,
      workspaceCargoManifestPath,
    ]) {
      fsMockState.blockedPaths.add(filePath)
    }

    const root = await createFixture()
    cleanup.add(root)

    const logger = createLogger()
    const warnSpy = vi.spyOn(logger, 'warn')
    const server = await createServer({
      ...resolveConfig(root),
      customLogger: logger,
    })

    try {
      await server.listen()
      expect(server.environments[NATIVE_GTK4_ENVIRONMENT_NAME]).toBeDefined()
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(spawnSpy).not.toHaveBeenCalled()
      expect(
        warnSpy.mock.calls.some(([message]) =>
          String(message).includes(
            'Skipping nativeGtk4 host launch because no GTK4 GUI host is available.',
          ),
        ),
      ).toBe(true)
    } finally {
      await server.close()
    }
  }, 30_000)

  it('launches the workspace GTK4 GUI host through cargo when no bundled host is available', async () => {
    spawnSpy.mockImplementation(createMockChildProcess)
    for (const filePath of bundledHostManifestPaths) {
      fsMockState.blockedPaths.add(filePath)
    }
    for (const filePath of workspaceGuiHostPaths) {
      fsMockState.blockedPaths.add(filePath)
    }
    fsMockState.virtualFiles.set(
      workspaceCargoManifestPath,
      '[package]\nname = "eclipsa-native-gtk4-host"\n',
    )

    const root = await createFixture()
    cleanup.add(root)

    const server = await createServer(resolveConfig(root))

    try {
      await server.listen()
      expect(server.environments[NATIVE_GTK4_ENVIRONMENT_NAME]).toBeDefined()
      await waitFor(() => spawnSpy.mock.calls.length > 0)
      const [command, args] = spawnSpy.mock.calls[0] ?? []
      expect(command).toBe('cargo')
      expect(args).toEqual([
        'run',
        '--manifest-path',
        workspaceCargoManifestPath,
        '--features',
        'gtk-ui',
        '--bin',
        'eclipsa-native-gtk4',
      ])
    } finally {
      await server.close()
    }
  }, 30_000)

  it('prefers the workspace cargo host over a stale compiled GTK4 binary during dev', async () => {
    spawnSpy.mockImplementation(createMockChildProcess)
    for (const filePath of bundledHostManifestPaths) {
      fsMockState.blockedPaths.add(filePath)
    }
    fsMockState.virtualFiles.set(
      workspaceCargoManifestPath,
      '[package]\nname = "eclipsa-native-gtk4-host"\n',
    )
    fsMockState.virtualFiles.set(workspaceGuiHostPaths[0]!, '')

    const root = await createFixture()
    cleanup.add(root)

    const server = await createServer(resolveConfig(root))

    try {
      await server.listen()
      expect(server.environments[NATIVE_GTK4_ENVIRONMENT_NAME]).toBeDefined()
      await waitFor(() => spawnSpy.mock.calls.length > 0)
      const [command, args] = spawnSpy.mock.calls[0] ?? []
      expect(command).toBe('cargo')
      expect(args).toEqual([
        'run',
        '--manifest-path',
        workspaceCargoManifestPath,
        '--features',
        'gtk-ui',
        '--bin',
        'eclipsa-native-gtk4',
      ])
    } finally {
      await server.close()
    }
  }, 30_000)
})
