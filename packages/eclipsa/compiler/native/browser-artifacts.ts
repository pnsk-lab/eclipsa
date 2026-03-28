import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GENERATED_BROWSER_WASM_FILE_NAME = 'eclipsa.wasm32-wasi.wasm'

const GENERATED_BROWSER_WASM_RELATIVE_PATH = `./generated/${GENERATED_BROWSER_WASM_FILE_NAME}`
const BROWSER_WASM_SOURCE_RELATIVE_PATHS = [
  '../rust/target/wasm32-wasip1-threads/release/eclipsa_compiler.wasm',
  '../rust/target/wasm32-wasip1-threads/debug/eclipsa_compiler.wasm',
]

export const resolveGeneratedBrowserWasmPath = (baseUrl = import.meta.url) => {
  return fileURLToPath(new URL(GENERATED_BROWSER_WASM_RELATIVE_PATH, baseUrl))
}

export const resolveBrowserWasmSourcePath = (baseUrl = import.meta.url) => {
  for (const relativePath of BROWSER_WASM_SOURCE_RELATIVE_PATHS) {
    const absolutePath = fileURLToPath(new URL(relativePath, baseUrl))
    if (existsSync(absolutePath)) {
      return absolutePath
    }
  }

  return null
}

export const syncGeneratedBrowserWasm = (baseUrl = import.meta.url) => {
  const generatedPath = resolveGeneratedBrowserWasmPath(baseUrl)
  if (existsSync(generatedPath)) {
    return generatedPath
  }

  const sourcePath = resolveBrowserWasmSourcePath(baseUrl)
  if (!sourcePath) {
    return null
  }

  mkdirSync(dirname(generatedPath), { recursive: true })
  copyFileSync(sourcePath, generatedPath)
  return generatedPath
}
