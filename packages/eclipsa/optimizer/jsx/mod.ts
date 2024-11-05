import { babel, t, traverse, type NodePath } from '../babel.ts'
import { transformJSXElement } from './transform-jsxelement.ts'

/**
 * JSX Transpiler (Output maybe optimized)
 */
export const transformJSX = (path: NodePath, init: {
  componentVariableObjectIdentifier: t.Identifier
}) => {
  const createTemplateID = path.scope.generateUidIdentifier('createTemplate')
  const applyID = path.scope.generateUidIdentifier('apply')
  let toInsertBody: t.Statement[] = [
    t.importDeclaration([
      t.importSpecifier(createTemplateID, t.identifier('createTemplate')),
      t.importSpecifier(applyID, t.identifier('apply'))
    ], t.stringLiteral('@xely/eclipsa/prod-client'))
  ]

  path.traverse({
    JSXElement(path) {
      const result = transformJSXElement(path, {
        prodClientIdenifiers: {
          createTemplate: createTemplateID
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
