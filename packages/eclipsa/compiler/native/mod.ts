import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

type CompilerTarget = 'client' | 'ssr'

interface SymbolRef {
  filePath: string
  id: string
}

type SymbolKind = 'action' | 'component' | 'event' | 'lazy' | 'loader' | 'watch'

interface ResumeSymbol {
  captures: string[]
  code: string
  filePath: string
  id: string
  kind: SymbolKind
}

interface ResumeHmrSymbolEntry {
  captures: string[]
  hmrKey: string
  id: string
  kind: SymbolKind
  ownerComponentKey: string | null
  signature: string
}

interface ResumeHmrComponentEntry {
  captures: string[]
  hmrKey: string
  id: string
  localSymbolKeys: string[]
  signature: string
}

interface AnalyzeResponse {
  actions: [string, SymbolRef][]
  code: string
  hmrManifest: {
    components: [string, ResumeHmrComponentEntry][]
    symbols: [string, ResumeHmrSymbolEntry][]
  }
  loaders: [string, SymbolRef][]
  symbols: [string, ResumeSymbol][]
}

interface NativeBinding {
  analyzeModule(source: string, id: string): AnalyzeResponse
  compileClient(source: string, id: string, hmr?: boolean | null): string
  compileSsr(source: string, id: string): string
}

interface CompilerRequest {
  hmr?: boolean
  id: string
  source: string
  target: CompilerTarget
}

const GENERATED_ARTIFACT_RELATIVE_DIRS = [
  './generated',
  '../compiler/native/generated',
  '../../compiler/native/generated',
]

const require = createRequire(import.meta.url)

let bindingPromise: Promise<NativeBinding> | null = null

interface ProcessReportLike {
  header?: {
    glibcVersionRuntime?: unknown
  }
  sharedObjects?: string[]
}

const isFileMusl = (filePath: string) => filePath.includes('libc.musl-') || filePath.includes('ld-musl-')

const isMusl = () => {
  if (process.platform !== 'linux') {
    return false
  }

  try {
    return readFileSync('/usr/bin/ldd', 'utf8').includes('musl')
  } catch {}

  if (typeof process.report?.getReport === 'function') {
    const report = process.report.getReport() as ProcessReportLike
    if (report?.header && 'glibcVersionRuntime' in report.header && report.header.glibcVersionRuntime) {
      return false
    }
    if (Array.isArray(report?.sharedObjects) && report.sharedObjects.some(isFileMusl)) {
      return true
    }
  }

  try {
    return require('node:child_process').execSync('ldd --version', { encoding: 'utf8' }).includes('musl')
  } catch {
    return false
  }
}

export const resolveGeneratedArtifactPath = (fileName: string) => {
  for (const relativeDir of GENERATED_ARTIFACT_RELATIVE_DIRS) {
    const absolutePath = fileURLToPath(new URL(`${relativeDir}/${fileName}`, import.meta.url))
    if (existsSync(absolutePath)) {
      return absolutePath
    }
  }

  return null
}

const loadErrors: Error[] = []

const requireGeneratedArtifact = (fileName: string) => {
  const artifactPath = resolveGeneratedArtifactPath(fileName)
  if (!artifactPath) {
    return null
  }

  try {
    return require(artifactPath) as NativeBinding
  } catch (error) {
    loadErrors.push(error as Error)
    return null
  }
}

const requireOptionalBinding = (packageName: string) => {
  try {
    return require(packageName) as NativeBinding
  } catch (error) {
    loadErrors.push(error as Error)
    return null
  }
}

const requireWasiBinding = () => {
  return (
    requireGeneratedArtifact('eclipsa.wasi.cjs') ??
    requireOptionalBinding('eclipsa-wasm32-wasi')
  )
}

const requirePreferredBinding = (fileName: string, packageName: string) =>
  requireGeneratedArtifact(fileName) ?? requireOptionalBinding(packageName)

const requireNativeBinding = () => {
  loadErrors.length = 0

  if (process.env.NAPI_RS_FORCE_WASI === '1') {
    return requireWasiBinding()
  }

  if (process.env.NAPI_RS_NATIVE_LIBRARY_PATH) {
    try {
      return require(process.env.NAPI_RS_NATIVE_LIBRARY_PATH) as NativeBinding
    } catch (error) {
      loadErrors.push(error as Error)
    }
  }

  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') {
      return requirePreferredBinding('eclipsa.darwin-arm64.node', 'eclipsa-darwin-arm64')
    }
    if (process.arch === 'x64') {
      return requirePreferredBinding('eclipsa.darwin-x64.node', 'eclipsa-darwin-x64')
    }
  }

  if (process.platform === 'win32') {
    if (process.arch === 'arm64') {
      return requirePreferredBinding('eclipsa.win32-arm64-msvc.node', 'eclipsa-win32-arm64-msvc')
    }
    if (process.arch === 'x64') {
      return requirePreferredBinding('eclipsa.win32-x64-msvc.node', 'eclipsa-win32-x64-msvc')
    }
  }

  if (process.platform === 'linux') {
    const libc = isMusl() ? 'musl' : 'gnu'
    if (process.arch === 'arm64') {
      return requirePreferredBinding(
        `eclipsa.linux-arm64-${libc}.node`,
        `eclipsa-linux-arm64-${libc}`,
      )
    }
    if (process.arch === 'x64') {
      return requirePreferredBinding(
        `eclipsa.linux-x64-${libc}.node`,
        `eclipsa-linux-x64-${libc}`,
      )
    }
  }

  return requireWasiBinding()
}

const loadNativeBinding = async () => {
  if (!bindingPromise) {
    bindingPromise = (async () => {
      const binding = requireNativeBinding()
      if (binding) {
        return binding
      }

      const localBuildHint =
        process.env.NAPI_RS_FORCE_WASI === '1'
          ? 'Run "bun run build:native --filter eclipsa -- --target wasm32-wasip1-threads" or install the matching optional package.'
          : 'Run "bun run build:native:dev --filter eclipsa" before using the compiler in the workspace, or install the matching optional package.'
      const details =
        loadErrors.length === 0
          ? 'No matching generated artifact or optional package was found.'
          : loadErrors.map((error) => error.message).join('\n')

      throw new Error(`Failed to load the Eclipsa compiler binding. ${localBuildHint}\n${details}`)
    })()
  }

  return bindingPromise
}

export const runRustCompiler = async (request: CompilerRequest) => {
  const binding = await loadNativeBinding()

  if (request.target === 'client') {
    return binding.compileClient(request.source, request.id, request.hmr ?? false)
  }
  return binding.compileSsr(request.source, request.id)
}

export const runRustAnalyzeCompiler = async (id: string, source: string) => {
  const binding = await loadNativeBinding()
  return binding.analyzeModule(source, id)
}
