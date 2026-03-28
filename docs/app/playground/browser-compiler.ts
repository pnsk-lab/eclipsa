import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { createPlaygroundOutputFiles } from './output.ts'
import { PLAYGROUND_ENTRY_ID, type PlaygroundBuildResult, formatPlaygroundError } from './shared.ts'

interface BrowserCompilerBinding {
  analyzeModule: (
    source: string,
    id: string,
  ) => {
    code: string
    symbols: Array<
      [
        string,
        {
          code: string
          id: string
          kind: 'action' | 'component' | 'event' | 'lazy' | 'loader' | 'watch'
        },
      ]
    >
  }
  compileClient: (source: string, id: string, hmr?: boolean | null) => string
  compileSsr: (source: string, id: string) => string
}

type MonacoModule = typeof Monaco
export const PLAYGROUND_MONACO_LANGUAGE_CONTRIBUTIONS = [
  'monaco-editor/esm/vs/language/typescript/monaco.contribution',
  'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution',
] as const
const PLAYGROUND_ECLIPSA_DIST_GLOB_PREFIX = '../../../packages/eclipsa/dist/'
const PLAYGROUND_ECLIPSA_DIST_TYPE_FILES = import.meta.glob(
  '../../../packages/eclipsa/dist/**/*.d.mts',
  {
    eager: true,
    import: 'default',
    query: '?raw',
  },
) as Record<string, string>
export const PLAYGROUND_ECLIPSA_DIST_TYPE_FILE_COUNT = Object.keys(
  PLAYGROUND_ECLIPSA_DIST_TYPE_FILES,
).length
export const PLAYGROUND_ECLIPSA_MODULE_SHIMS = {
  '/node_modules/eclipsa/package.json': `{
  "name": "eclipsa",
  "type": "module",
  "types": "./index.d.ts"
}
`,
  '/node_modules/eclipsa/index.d.ts': `export * from './mod.d.mts'
`,
  '/node_modules/eclipsa/client.d.ts': `export * from './core/client/mod.d.mts'
`,
  '/node_modules/eclipsa/dev-client.d.ts': `export * from './core/dev-client/mod.d.mts'
`,
  '/node_modules/eclipsa/prod-client.d.ts': `export * from './core/prod-client/mod.d.mts'
`,
  '/node_modules/eclipsa/internal.d.ts': `export * from './core/internal.d.mts'
`,
  '/node_modules/eclipsa/jsx-runtime.d.ts': `export * from './jsx/jsx-runtime.d.mts'
`,
  '/node_modules/eclipsa/jsx-dev-runtime.d.ts': `export * from './jsx/jsx-dev-runtime.d.mts'
`,
  '/node_modules/eclipsa/jsx.d.ts': `export * from './jsx/mod.d.mts'
`,
  '/node_modules/eclipsa/vite.d.ts': `export * from './vite/mod.d.mts'
`,
  '/node_modules/hono/index.d.ts': `export interface Env {
  [key: string]: unknown
}

export class Context<E = any> {}
`,
  '/node_modules/hono/types.d.ts': `export interface Env {
  [key: string]: unknown
}

export type MiddlewareHandler<E = any> = (...args: any[]) => any
`,
  '/node_modules/vite/index.d.ts': `export type PluginOption = any
`,
} as const
type TypeScriptContributionModule =
  typeof import('monaco-editor/esm/vs/language/typescript/monaco.contribution')

let compilerPromise: Promise<BrowserCompilerBinding> | null = null
let monacoPromise: Promise<MonacoModule> | null = null
let typeScriptContributionPromise: Promise<TypeScriptContributionModule> | null = null
let typeScriptTokenizerContributionPromise: Promise<unknown> | null = null
let monacoConfigured = false

const toPlaygroundNodeModulesUri = (path: string) => `file://${path}`

const getPlaygroundEclipsaDistRelativePath = (path: string) => {
  if (!path.startsWith(PLAYGROUND_ECLIPSA_DIST_GLOB_PREFIX)) {
    throw new Error(`Unexpected Eclipsa dist type path: ${path}`)
  }

  return path.slice(PLAYGROUND_ECLIPSA_DIST_GLOB_PREFIX.length)
}

const registerPlaygroundExtraLibs = (
  defaults: TypeScriptContributionModule['typescriptDefaults'],
) => {
  for (const [path, content] of Object.entries(PLAYGROUND_ECLIPSA_MODULE_SHIMS)) {
    defaults.addExtraLib(content, toPlaygroundNodeModulesUri(path))
  }

  for (const [sourcePath, content] of Object.entries(PLAYGROUND_ECLIPSA_DIST_TYPE_FILES)) {
    const relativePath = getPlaygroundEclipsaDistRelativePath(sourcePath)
    const declarationUri = toPlaygroundNodeModulesUri(`/node_modules/eclipsa/${relativePath}`)
    defaults.addExtraLib(content, declarationUri)

    const runtimePath = relativePath.replace(/\.d\.mts$/, '.mjs')
    const declarationFileName = relativePath.slice(relativePath.lastIndexOf('/') + 1)
    defaults.addExtraLib(
      `export * from './${declarationFileName}'
`,
      toPlaygroundNodeModulesUri(`/node_modules/eclipsa/${runtimePath}`),
    )
  }
}

const ensureMonacoWorkers = async () => {
  const [{ default: EditorWorker }, { default: TypeScriptWorker }] = await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.worker?worker'),
    import('monaco-editor/esm/vs/language/typescript/ts.worker?worker'),
  ])

  ;(
    globalThis as typeof globalThis & {
      MonacoEnvironment?: {
        getWorker: (_workerId: string, label: string) => Worker
      }
    }
  ).MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === 'javascript' || label === 'typescript') {
        return new TypeScriptWorker()
      }
      return new EditorWorker()
    },
  }
}

export const getPlaygroundIsolationError = () => {
  if (typeof window === 'undefined') {
    return null
  }

  if (window.crossOriginIsolated) {
    return null
  }

  return [
    'The browser compiler needs a cross-origin isolated page.',
    'Serve /playground with Cross-Origin-Embedder-Policy: require-corp and',
    'Cross-Origin-Opener-Policy: same-origin.',
  ].join(' ')
}

const loadBrowserCompiler = async () => {
  if (!compilerPromise) {
    compilerPromise =
      import('../../../packages/eclipsa/compiler/native/generated/eclipsa.wasi-browser.js').then(
        (module) => module.default as BrowserCompilerBinding,
      )
  }

  return compilerPromise
}

export const buildPlaygroundOutputInBrowser = async (
  source: string,
): Promise<PlaygroundBuildResult> => {
  try {
    const compiler = await loadBrowserCompiler()
    const analyzed = compiler.analyzeModule(source, PLAYGROUND_ENTRY_ID)
    const files = await createPlaygroundOutputFiles({
      analyzed: {
        code: analyzed.code,
        symbols: analyzed.symbols.map(([, symbol]) => symbol),
      },
      compileClient(source, id) {
        return compiler.compileClient(source, id, false)
      },
      compileSsr(source, id) {
        return compiler.compileSsr(source, id)
      },
    })

    return {
      files,
      ok: true,
    }
  } catch (error) {
    return {
      error: formatPlaygroundError(error),
      ok: false,
    }
  }
}

export const loadPlaygroundMonaco = async () => {
  if (!monacoPromise) {
    monacoPromise = (async () => {
      await ensureMonacoWorkers()
      return import('monaco-editor/esm/vs/editor/editor.api')
    })()
  }

  if (!typeScriptContributionPromise) {
    typeScriptContributionPromise =
      import('monaco-editor/esm/vs/language/typescript/monaco.contribution')
  }

  if (!typeScriptTokenizerContributionPromise) {
    typeScriptTokenizerContributionPromise =
      import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution')
  }

  const [monaco, typeScriptContribution] = await Promise.all([
    monacoPromise,
    typeScriptContributionPromise,
    typeScriptTokenizerContributionPromise,
  ])

  if (!monacoConfigured) {
    monacoConfigured = true

    monaco.editor.defineTheme('eclipsa-playground', {
      base: 'vs-dark',
      inherit: true,
      semanticHighlighting: true,
      colors: {
        'editor.background': '#0b1020',
        'editor.lineHighlightBackground': '#151c30',
        'editor.selectionBackground': '#27467e',
        'editorCursor.foreground': '#7dd3fc',
      },
      rules: [
        { foreground: '7dd3fc', token: 'keyword' },
        { foreground: 'facc15', token: 'string' },
        { foreground: '86efac', token: 'type.identifier' },
      ],
    })

    typeScriptContribution.typescriptDefaults.setCompilerOptions({
      allowNonTsExtensions: true,
      jsx: typeScriptContribution.JsxEmit.Preserve,
      module: typeScriptContribution.ModuleKind.ESNext,
      moduleResolution: typeScriptContribution.ModuleResolutionKind.NodeJs,
      skipLibCheck: true,
      target: typeScriptContribution.ScriptTarget.ESNext,
    })
    typeScriptContribution.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    })
    typeScriptContribution.typescriptDefaults.setEagerModelSync(true)
    registerPlaygroundExtraLibs(typeScriptContribution.typescriptDefaults)
    monaco.editor.setTheme('eclipsa-playground')
  }

  return monaco
}
