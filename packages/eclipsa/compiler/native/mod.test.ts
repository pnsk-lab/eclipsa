import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { resolveGeneratedArtifactPath } from './mod.ts'
import {
  buildPackageManifest,
  PUBLISH_EXPORTS,
  PUBLISH_FILES,
} from '../../scripts/sync-package-manifest.ts'
import {
  GENERATED_BROWSER_WASM_FILE_NAME,
  resolveBrowserWasmSourcePath,
  syncGeneratedBrowserWasm,
} from './browser-artifacts.ts'

const execFileAsync = promisify(execFile)
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const packageJsonPath = path.join(packageRoot, 'package.json')

const writePlaceholder = async (root: string, relativePath: string, contents = 'export {}\n') => {
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

describe('native compiler packaging', () => {
  it('resolves the generated napi binding entry without legacy native copy paths', () => {
    const wasmBindingPath = resolveGeneratedArtifactPath('eclipsa.wasi.cjs')

    expect(wasmBindingPath).toBeTruthy()
    expect(wasmBindingPath).toContain(
      `${path.sep}compiler${path.sep}native${path.sep}generated${path.sep}`,
    )
    expect(wasmBindingPath).toMatch(/eclipsa\.wasi\.cjs$/)
    expect(wasmBindingPath).not.toContain(`${path.sep}dist${path.sep}native${path.sep}`)
  })

  it('produces a publish manifest that points at built dist entries', async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as Record<
      string,
      unknown
    >
    const publishManifest = buildPackageManifest(packageJson, 'publish')

    expect(publishManifest.exports).toEqual(PUBLISH_EXPORTS)
    expect(publishManifest.files).toEqual(PUBLISH_FILES)
    expect(publishManifest.main).toBe('./dist/mod.mjs')
    expect(publishManifest.types).toBe('./dist/mod.d.mts')
  })

  it('packs only publish artifacts and excludes Rust/dev-only paths', async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as Record<
      string,
      unknown
    >
    const publishManifest = buildPackageManifest(packageJson, 'publish')
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'eclipsa-pack-'))

    await writeFile(
      path.join(tempRoot, 'package.json'),
      `${JSON.stringify(publishManifest, null, 2)}\n`,
    )

    const exportEntries = new Set<string>(['./dist/mod.mjs', './dist/mod.d.mts'])
    for (const target of Object.values(PUBLISH_EXPORTS)) {
      if (typeof target !== 'object' || target === null) {
        continue
      }
      const entry = target as { import?: string; types?: string }
      if (entry.import) {
        exportEntries.add(entry.import)
      }
      if (entry.types) {
        exportEntries.add(entry.types)
      }
    }

    for (const relativePath of exportEntries) {
      await writePlaceholder(tempRoot, relativePath.slice(2))
    }

    await writePlaceholder(
      tempRoot,
      'compiler/native/generated/eclipsa.wasi.cjs',
      'module.exports = {}\n',
    )
    await writePlaceholder(tempRoot, 'compiler/native/generated/browser.js')
    await writePlaceholder(tempRoot, 'compiler/native/generated/wasi-worker.mjs')
    await writePlaceholder(tempRoot, 'compiler/native/generated/index.d.ts')
    await writeFile(
      path.join(tempRoot, 'compiler/native/generated/eclipsa.linux-x64-gnu.node'),
      new Uint8Array([0x00]),
    )
    await writeFile(
      path.join(tempRoot, 'compiler/native/generated/eclipsa.wasm32-wasip1-threads.wasm'),
      new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
    )

    await writePlaceholder(tempRoot, 'compiler/rust/target/hidden.txt', 'should not pack\n')
    await writePlaceholder(tempRoot, 'compiler/analyze/mod.test.ts', 'should not pack\n')
    await mkdir(path.join(tempRoot, 'dist/native/linux-x64'), { recursive: true })
    await writeFile(
      path.join(tempRoot, 'dist/native/linux-x64/eclipsa_compiler.node'),
      new Uint8Array([0x00]),
    )

    const { stdout } = await execFileAsync('bun', ['pm', 'pack', '--dry-run'], {
      cwd: tempRoot,
      encoding: 'utf8',
    })

    expect(stdout).toContain('compiler/native/generated/browser.js')
    expect(stdout).toContain('compiler/native/generated/eclipsa.wasi.cjs')
    expect(stdout).toContain('compiler/native/generated/eclipsa.wasm32-wasip1-threads.wasm')
    expect(stdout).not.toContain('compiler/native/generated/eclipsa.linux-x64-gnu.node')
    expect(stdout).not.toContain('compiler/rust/target/hidden.txt')
    expect(stdout).not.toContain('compiler/analyze/mod.test.ts')
    expect(stdout).not.toContain('dist/native/linux-x64/eclipsa_compiler.node')
  }, 15000)

  it('syncs the browser wasm artifact from the release target into generated output', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'eclipsa-browser-wasm-'))
    const baseUrl = new URL(`file://${path.join(tempRoot, 'compiler/native/browser-artifacts.ts')}`)
    const releaseWasmPath = path.join(
      tempRoot,
      'compiler/rust/target/wasm32-wasip1-threads/release/eclipsa_compiler.wasm',
    )

    await mkdir(path.dirname(releaseWasmPath), { recursive: true })
    await writeFile(releaseWasmPath, new Uint8Array([0x00, 0x61, 0x73, 0x6d]))

    expect(resolveBrowserWasmSourcePath(baseUrl.href)).toBe(releaseWasmPath)

    const syncedPath = syncGeneratedBrowserWasm(baseUrl.href)
    expect(syncedPath).toBe(
      path.join(tempRoot, 'compiler/native/generated', GENERATED_BROWSER_WASM_FILE_NAME),
    )
    expect(await readFile(syncedPath!)).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d]))
  })
})
