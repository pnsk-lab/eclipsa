import type { AnalyzedImports } from './analyze-import.ts'
import { babel, generate, type NodePath, t, traverse } from './babel.ts'
import { xxHash32 } from '../utils/xxhash32.ts'

export interface AnalyzedComponents {}

const ECLIPSA_EVENT_REGEX = /^on[A-Z].+\$$/

const nodeToHash = (node: t.Node) => xxHash32(generate(node).code).toString(16)

/**
 * Bundle variables in a component to a single object.
 */
const getComponentVariableObject = (componentPath: NodePath<t.FunctionExpression | t.ArrowFunctionExpression>): t.ObjectExpression => {
  const componentVariableObject = t.objectExpression([])
  for (const [name, info] of Object.entries(componentPath.scope.bindings)) {
    // Add getter
    componentVariableObject.properties.push(
      t.objectMethod(
        'get',
        t.identifier(name),
        [],
        t.blockStatement([t.returnStatement(t.identifier(name))]),
      ),
    )
    if (!info.constant) {
      // If variable isn't constant, setter is needed.
      // Add setter
      componentVariableObject.properties.push(
        t.objectMethod(
          'set',
          t.identifier(name),
          [t.identifier(name)],
          t.blockStatement([
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.identifier(name),
                t.identifier(name),
              ),
            ),
          ]),
        ),
      )
    }
  }
  return componentVariableObject
}

const importsToImportDeclarations = (
  imports: AnalyzedImports,
): t.ImportDeclaration[] => {
  const result: t.ImportDeclaration[] = []
  for (const [name, value] of imports) {
    const specifiers: t.ImportSpecifier[] = []
    for (const [imported, local] of value) {
      specifiers.push(
        t.importSpecifier(t.identifier(local), t.identifier(imported)),
      )
    }
    result.push(t.importDeclaration(specifiers, t.stringLiteral(name)))
  }
  return result
}

export const processEurlFunction = (
  path: NodePath<t.FunctionExpression | t.ArrowFunctionExpression>,
  importDeclarations: t.ImportDeclaration[],
  variablesID: t.Identifier
) => {
  const eurl = `${nodeToHash(path.node)}.js`

  const componentVariablesID = path.scope.generateUidIdentifier('vars')
  const chunkExpr = t.arrowFunctionExpression(
    [componentVariablesID],
    path.node
  )
  const chunk = t.program([
    ...importDeclarations,
    t.exportDefaultDeclaration(chunkExpr),
  ])

  const callEurlExpr = t.callExpression(
    t.identifier('eurlFn'),
    [
      t.stringLiteral(eurl),
      variablesID
    ]
  )

  return {
    eurl,
    chunk,
    callEurlExpr
  }
}

/**
 * Process `component$`
 */
export const processComponent = (
  path: NodePath<t.CallExpression>,
  clientFiles: Map<string, string>,
  imports: AnalyzedImports,
) => {
  const componentPath = path.get('arguments')[0] as NodePath<t.FunctionExpression | t.ArrowFunctionExpression>
  const componentNode = t.cloneDeep(componentPath.node)

  const importDeclarations = importsToImportDeclarations(imports)
  const componentVariableObject = getComponentVariableObject(componentPath)
  const componentVariableID = componentPath.scope.generateUidIdentifier('vars')
  const setComponentVariable = t.variableDeclaration('var', [
    t.variableDeclarator(componentVariableID, componentVariableObject),
  ])

  componentPath.node.body = t.isExpression(componentPath.node.body) ? t.blockStatement([
    setComponentVariable,
    t.returnStatement(componentPath.node.body)
  ]) : t.blockStatement([
    setComponentVariable,
    ...componentPath.node.body.body,
  ])

  // Process `onXxxx$` Events
  componentPath.traverse({
    JSXAttribute: {
      enter(path) {
        const name = typeof path.node.name.name === 'string'
          ? path.node.name.name
          : path.node.name.name.name
        if (ECLIPSA_EVENT_REGEX.test(name)) {
          // It's eclipsa event (onClick$, onInput$, ...)
          const value = path.node.value
          if (!value) {
            return
          }
          if (!t.isJSXExpressionContainer(value)) {
            return
          }
          const exprPath = path.get('value.expression') as NodePath<
            t.Expression
          >

          const { eurl, chunk, callEurlExpr } = processEurlFunction(
            exprPath as NodePath<
              t.FunctionExpression | t.ArrowFunctionExpression
            >,
            importDeclarations,
            componentVariableID
          )
          clientFiles.set(eurl, generate(chunk).code)

          path.replaceWith(
            t.jsxAttribute(
              t.jsxIdentifier(`ec:${name}`),
              t.jsxExpressionContainer(callEurlExpr),
            ),
          )
        }
      },
    },
  })

  const componentHash = nodeToHash(componentPath.node)
  const componentEntryEurl = `${componentHash}.js`
  const componentEurl = t.program([
    ...importDeclarations,
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
