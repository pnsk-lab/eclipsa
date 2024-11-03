import type { AnalyzedImports } from './analyze-import.ts'
import { babel, traverse, t, generate, type NodePath } from './babel.ts'

export interface AnalyzedComponents {}

/**
 * Process `component$`
 */
export const processComponent = (path: NodePath<t.CallExpression>) => {
  const componentPath = path.get('arguments')[0]
  console.log(generate(componentPath.node))
}

export const analyzeComponents = (ast: babel.ParseResult, imports: AnalyzedImports) => {
  const component$Name = imports.get('@xely/eclipsa')?.get('component$')
  if (!component$Name) {
    return
  }

  traverse(ast, {
    CallExpression: {
      enter(path) {
        const callee = path.node.callee
        if (t.isIdentifier(callee)) {
          if (callee.name === component$Name) {
            // Make component!
            processComponent(path)
          }
          return
        }
      }
    }
  })
}
