import { t, traverse, babel } from './babel.ts'

export type AnalyzedImports = Map<string, Map<string, string>>

/**
 * Analyze imports from AST.
 */
export const analyzeImports = (ast: babel.ParseResult): AnalyzedImports=> {
  const result: AnalyzedImports = new Map()
  traverse(ast, {
    ImportDeclaration: {
      enter(path) {
        const source = path.node.source.value
        const map = new Map<string, string>()
        for (let i = 0; i < path.node.specifiers.length; i++) {
          const specifier = path.node.specifiers[i]

          if (t.isImportDefaultSpecifier(specifier)) {
            map.set('default', specifier.local.name)
          } else if (t.isImportNamespaceSpecifier(specifier)) {
            // Pass
          } else {
            map.set(
              t.isStringLiteral(specifier.imported)
                ? specifier.imported.value
                : specifier.imported.name,
              specifier.local.name,
            )
          }
        }
        result.set(source, map)
      },
    },
  })

  return result
}
