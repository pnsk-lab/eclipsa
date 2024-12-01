import { babel, t, traverse, type NodePath } from '../babel.ts'
import { transformJSXElement } from './transform-jsxelement.ts'

/**
 * JSX Transpiler (Output maybe optimized)
 */
export const transformJSX = (path: NodePath, init: {
  componentVariableObjectIdentifier: t.Identifier
}) => {
  const createTemplateID = path.scope.generateUidIdentifier('createTemplate')
  const createComponentResultID = path.scope.generateUidIdentifier('createComponentResult')
  const effectID = path.scope.generateUidIdentifier('effect')

  const applyID = path.scope.generateUidIdentifier('apply')
  let toInsertBody: t.Statement[] = [
    t.importDeclaration([
      t.importSpecifier(createTemplateID, t.identifier('createTemplate')),
      t.importSpecifier(createComponentResultID, t.identifier('createComponentResult')),
      t.importSpecifier(applyID, t.identifier('apply')),
      t.importSpecifier(effectID, t.identifier('effect'))
    ], t.stringLiteral('@xely/eclipsa/prod-client'))
  ]

  path.traverse({
    JSXElement(path) {
      const result = transformJSXElement(path, {
        prodClientIdenifiers: {
          createTemplate: createTemplateID,
          createComponentResult: createComponentResultID,
          effect: effectID
        },
        componentVariableObjectIdentifier: init.componentVariableObjectIdentifier
      })
      toInsertBody = toInsertBody.concat(result.toInsertBody)
    },
  })

  return {
    toInsertBody
  }
}
