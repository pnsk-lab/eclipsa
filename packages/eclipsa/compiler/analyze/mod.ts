import { runRustAnalyzeCompiler } from '../native/mod.ts'

type SymbolKind = 'action' | 'component' | 'event' | 'lazy' | 'loader' | 'watch'

export interface ResumeSymbol {
  captures: string[]
  code: string
  filePath: string
  id: string
  kind: SymbolKind
}

export interface ResumeHmrSymbolEntry {
  captures: string[]
  hmrKey: string
  id: string
  kind: SymbolKind
  ownerComponentKey: string | null
  signature: string
}

export interface ResumeHmrComponentEntry {
  captures: string[]
  hmrKey: string
  id: string
  localSymbolKeys: string[]
  signature: string
}

export interface ResumeHmrManifest {
  components: Map<string, ResumeHmrComponentEntry>
  symbols: Map<string, ResumeHmrSymbolEntry>
}

export interface AnalyzedModule {
  actions: Map<string, { filePath: string; id: string }>
  code: string
  hmrManifest: ResumeHmrManifest
  loaders: Map<string, { filePath: string; id: string }>
  symbols: Map<string, ResumeSymbol>
}

export const analyzeModule = async (
  source: string,
  id = 'analyze-input.tsx',
): Promise<AnalyzedModule> => {
  const analyzed = await runRustAnalyzeCompiler(id, source)
  return {
    actions: new Map(analyzed.actions),
    code: analyzed.code,
    hmrManifest: {
      components: new Map(analyzed.hmrManifest.components),
      symbols: new Map(analyzed.hmrManifest.symbols),
    },
    loaders: new Map(analyzed.loaders),
    symbols: new Map(analyzed.symbols),
  }
}
