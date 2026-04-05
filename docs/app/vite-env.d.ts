/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ERUDA?: string
}

declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor'
}

declare module 'monaco-editor/esm/vs/language/typescript/monaco.contribution' {
  export const JsxEmit: typeof import('monaco-editor').typescript.JsxEmit
  export const ModuleKind: typeof import('monaco-editor').typescript.ModuleKind
  export const ModuleResolutionKind: typeof import('monaco-editor').typescript.ModuleResolutionKind
  export const ScriptTarget: typeof import('monaco-editor').typescript.ScriptTarget
  export const typescriptDefaults: typeof import('monaco-editor').typescript.typescriptDefaults
}

declare module '@eclipsa/optimizer/browser' {
  const binding: {
    analyzeModule(
      source: string,
      id: string,
    ): {
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
    compileClient(source: string, id: string, hmr?: boolean | null): string
    compileSsr(source: string, id: string): string
  }

  export default binding
}
