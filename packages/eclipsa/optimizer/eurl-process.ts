import type { AnalyzedImports } from './analyze-import.ts'
import { babel, generate, type NodePath, t, traverse } from './babel.ts'
import { xxHash32 } from '../utils/xxhash32.ts'

export interface AnalyzedComponents {}

const ECLIPSA_EVENT_REGEX = /^on[A-Z].+\$$/

const nodeToHash = (node: t.Node) => xxHash32(generate(node).code).toString(16)

const importsToImportDecorations = (imports: AnalyzedImports): t.ImportDeclaration[] => {
  const result: t.ImportDeclaration[] = []
  for (const [name, value] of imports) {
    const specifiers: t.ImportSpecifier[] = []
    for (const [imported, local] of value) {
      specifiers.push(t.importSpecifier(t.identifier(local), t.identifier(imported)))
    }
    result.push(t.importDeclaration(specifiers, t.stringLiteral(name)))
  }
  return result
}

/**
 * Process `component$`
 */
export const processComponent = (
  path: NodePath<t.CallExpression>,
  clientFiles: Map<string, string>,
  imports: AnalyzedImports
) => {
  const componentPath = path.get('arguments')[0]
  const componentNode = t.cloneDeep(componentPath.node)

  const importDecorations = importsToImportDecorations(imports)

  // Process `onXxxx$` Events
  componentPath.traverse({
    JSXAttribute: {
      enter(path) {
        const name = typeof path.node.name.name === 'string' ? path.node.name.name : path.node.name.name.name
        if (ECLIPSA_EVENT_REGEX.test(name)) {
          // It's eclipsa event (onClick$, onInput$, ...)
          const value = path.node.value
          if (!value) {
            return
          }
          if (!t.isJSXExpressionContainer(value)) {
            return
          }
          const expr = value.expression
          const hash = nodeToHash(expr)
          const eventEurl = t.program([
            ...importDecorations,
            t.exportDefaultDeclaration(expr as t.Expression)
          ])

          clientFiles.set(`${hash}.js`, generate(eventEurl).code)
          path.replaceWith(t.jsxAttribute(t.jsxIdentifier(`ec:${name}`), t.stringLiteral(`${hash}.js`)))
        }
      }
    }
  })

  const componentHash = nodeToHash(componentPath.node)
  const componentEntryEurl = `${componentHash}.js`
  const componentEurl = t.program([
    ...importDecorations,
    t.exportDefaultDeclaration(componentPath.node as t.Expression),
  ])
  clientFiles.set(componentEntryEurl, generate(componentEurl).code)
}

export const analyzeComponents = (
  ast: babel.ParseResult,
  imports: AnalyzedImports,
) => {
  const clientMap = new Map<string, string>()

  const component$Name = imports.get('@xely/eclipsa')?.get('component$')
  if (!component$Name) {
    return clientMap
  }

  traverse(ast, {
    CallExpression: {
      enter(path) {
        const callee = path.node.callee
        if (t.isIdentifier(callee)) {
          if (callee.name === component$Name) {
            // Make component!
            processComponent(path, clientMap, imports)
          }
          return
        }
      },
    },
  })

  return clientMap
}
