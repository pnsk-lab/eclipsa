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
} from './scripts/sync-package-manifest.ts'
import {
  GENERATED_BROWSER_WASM_FILE_NAME,
  resolveBrowserWasmSourcePath,
  syncGeneratedBrowserWasm,
} from './browser-artifacts.ts'

const execFileAsync = promisify(execFile)
const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = path.join(packageRoot, 'package.json')

const writePlaceholder = async (root: string, relativePath: string, contents = 'export {}\n') => {
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

describe('optimizer packaging', () => {
  it('resolves the generated napi binding entry from the optimizer package root', () => {
    const wasmBindingPath = resolveGeneratedArtifactPath('optimizer.wasi.cjs')

    expect(wasmBindingPath).toBeTruthy()
    expect(wasmBindingPath).toContain(`${path.sep}generated${path.sep}`)
    expect(wasmBindingPath).toMatch(/optimizer\.wasi\.cjs$/)
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

  it('packs only publish artifacts and excludes native binaries', async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as Record<
      string,
      unknown
    >
    const publishManifest = buildPackageManifest(packageJson, 'publish')
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'optimizer-pack-'))

    await writeFile(
      path.join(tempRoot, 'package.json'),
      `${JSON.stringify(publishManifest, null, 2)}\n`,
    )

    await writePlaceholder(tempRoot, 'dist/mod.mjs')
    await writePlaceholder(tempRoot, 'dist/mod.d.mts')
    await writePlaceholder(tempRoot, 'generated/optimizer.wasi.cjs', 'module.exports = {}\n')
    await writePlaceholder(tempRoot, 'generated/browser.js')
    await writePlaceholder(tempRoot, 'generated/wasi-worker.mjs')
    await writePlaceholder(tempRoot, 'generated/index.d.ts')
    await writeFile(
      path.join(tempRoot, 'generated/optimizer.linux-x64-gnu.node'),
      new Uint8Array([0x00]),
    )
    await writeFile(
      path.join(tempRoot, 'generated/optimizer.wasm32-wasi.wasm'),
      new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
    )

    const { stdout } = await execFileAsync('bun', ['pm', 'pack', '--dry-run'], {
      cwd: tempRoot,
      encoding: 'utf8',
    })

    expect(stdout).toContain('generated/browser.js')
    expect(stdout).toContain('generated/optimizer.wasi.cjs')
    expect(stdout).toContain('generated/optimizer.wasm32-wasi.wasm')
    expect(stdout).not.toContain('generated/optimizer.linux-x64-gnu.node')
  }, 15000)

  it('syncs the browser wasm artifact from the compiler release target into generated output', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'optimizer-browser-wasm-'))
    const baseUrl = new URL(`file://${path.join(tempRoot, 'browser-artifacts.ts')}`)
    const releaseWasmPath = path.join(
      tempRoot,
      '../eclipsa/compiler/rust/target/wasm32-wasip1-threads/release/eclipsa_compiler.wasm',
    )

    await mkdir(path.dirname(releaseWasmPath), { recursive: true })
    await writeFile(releaseWasmPath, new Uint8Array([0x00, 0x61, 0x73, 0x6d]))

    expect(resolveBrowserWasmSourcePath(baseUrl.href)).toBe(path.resolve(releaseWasmPath))

    const syncedPath = syncGeneratedBrowserWasm(baseUrl.href)
    expect(syncedPath).toBe(path.join(tempRoot, 'generated', GENERATED_BROWSER_WASM_FILE_NAME))
    expect(await readFile(syncedPath!)).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d]))
  })
})
