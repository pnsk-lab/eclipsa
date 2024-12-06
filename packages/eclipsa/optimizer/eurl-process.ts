import { AnalyzedImports } from './analyze-import.ts'
import { traverse, babel, t, generate, NodePath, } from './babel.ts'
import { nodeToHash } from './utils/node-hash.ts'
import type { Built } from './mod.ts'
import { canBeReferedWithOnlyScope } from './utils/scope.ts'

interface ProdClientImports {
  identifier: {
    eurlFn: t.Identifier
  }
  imports: t.ImportDeclaration[]
}

const processComponent = (
  componentPath: NodePath<t.CallExpression>,
  built: Built,
  imports: AnalyzedImports,
  prodImports: ProdClientImports
) => {

  const eclisaImports = imports.get('@xely/eclipsa')
  const $Identifier = eclisaImports?.get('$')

  const arrowFunctionPath = componentPath.get('arguments')[0] as NodePath<t.ArrowFunctionExpression>

  // Process component-level functions
  const topLevelVariables = new Set<string>()
  const arrowFunctionBodyPath = arrowFunctionPath.get('body')
  if (arrowFunctionBodyPath.node.type === 'BlockStatement') {
    for (const statement of (arrowFunctionBodyPath as NodePath<t.BlockStatement>).get('body')) {
      if (statement.isVariableDeclaration()) {
        for (const declaration of statement.get('declarations')) {
          const id = declaration.node.id as t.Identifier
          topLevelVariables.add(id.name)
        }
      } else if (statement.isFunctionDeclaration()) {
        const id = statement.node.id
        if (id) {
          topLevelVariables.add(id.name)
        }
      }
    }
  }

  // eurl-ize all async functions
  const eurls = new Map<string, NodePath<t.ArrowFunctionExpression | t.FunctionExpression>>()
  arrowFunctionPath.traverse({
    CallExpression(path) {
      const callee = path.get('callee')
      if (callee.isIdentifier() && callee.node.name === $Identifier) {
        const fn = path.get('arguments')[0]
        path.replaceWith(t.callExpression(prodImports.identifier.eurlFn, [fn.node]))
        if (fn.isArrowFunctionExpression() || fn.isFunctionExpression()) {
          eurls.set(nodeToHash(fn.node), fn)
        }
      }
    },
    JSXAttribute(path) {
      const name = path.node.name.type === 'JSXIdentifier' ? path.node.name.name : path.node.name.name.name
      if (name.at(-1) !== '$') {
        return
      }
      const value = path.get('value')
      if (!value.isJSXExpressionContainer()) {
        return
      }
      const expr = value.get('expression')

      if (expr && (expr.isFunctionExpression() || expr.isArrowFunctionExpression())) {
        const hash = nodeToHash(path.node)
        eurls.set(hash, expr)
        value.replaceWith(t.stringLiteral(hash))
      }
    }
  })

  const componentEurl = nodeToHash(componentPath.node)
  eurls.set(componentEurl, componentPath.get('arguments')[0] as NodePath<t.ArrowFunctionExpression>)

  // Build client codes
  for (const [eurl, fnPath] of eurls) {
    const usingVars = new Set<string>()
    const vars = fnPath.scope.generateUidIdentifier('vars')

    const imports: t.ImportDeclaration[] = []
    fnPath.traverse({
      Identifier: {
        enter(path) {
          if (path.parentPath.isMemberExpression()) {
            return
          }
          const varName = path.node.name
          const varBinding = path.scope.getBinding(varName)
          if (!varBinding) {
            return
          }
          if (!canBeReferedWithOnlyScope(varBinding, fnPath.scope)) {
            if (varBinding.kind === 'module') {
              // import
              imports.push(varBinding.path.parent as t.ImportDeclaration)
              return
            }
            path.replaceWith(t.memberExpression(vars, path.node))
            usingVars.add(varName)
          }
        }
      }
    })
    const resultNode = t.program([
      ...prodImports.imports,
      ...imports,
      t.exportDefaultDeclaration(t.arrowFunctionExpression([vars], fnPath.node))
    ])
    built.client.set(`${eurl}.js`, {
      code: generate(resultNode).code
    })
    fnPath.replaceWith(t.stringLiteral(eurl))
    if (t.isCallExpression(fnPath.parent)) {
      fnPath.parent.arguments.push(t.objectExpression([...usingVars].map(usingVar => (t.objectMethod('get', t.identifier(usingVar), [], t.blockStatement([
        t.returnStatement(t.identifier(usingVar))
      ]))))))
    }
  }
}

/**
 * Build eurls.
 */
export const analyzeEurl = (parsed: babel.ParseResult, imports: AnalyzedImports) => {
  const eclisaImports = imports.get('@xely/eclipsa')
  const component$Identifier = eclisaImports?.get('component$')

  let prodClientImports!: ProdClientImports

  const built: Built = {
    client: new Map(),
    clientEntry: ''
  }
  traverse(parsed, {
    Program: {
      enter(path) {
        const eurlFn = path.scope.generateUidIdentifier('eurlFn')
        prodClientImports = {
          identifier: {
            eurlFn
          },
          imports: [
            t.importDeclaration([
              t.importSpecifier(eurlFn, t.identifier('eurlFn'))
            ], t.stringLiteral('@xely/eclipsa'))
          ]
        }
      }
    },
    CallExpression: {
      enter(path) {
        if (path.node.callee.type === 'Identifier' && path.node.callee.name === component$Identifier) {
          processComponent(path, built, imports, prodClientImports)
        }
      }
    },
    BlockStatement: {
      enter(path) {
        path.skip()
      }
    }
  })

  return built
}