import { babel, t, traverse } from '../babel.ts'
import { transformJSXElement } from './transform-jsxelement.ts'

/**
 * JSX Transpiler (Output maybe optimized)
 */
export const transformJSX = (ast: t.File) => {
  let createTemplateID!: t.Identifier
  let toInsertBody: t.Statement[] = []
  traverse(ast, {
    Program: {
      enter(path) {
        createTemplateID = path.scope.generateUidIdentifier('createTemplate')

        path.node.body.unshift(
          t.importDeclaration([
            t.importSpecifier(createTemplateID, t.identifier('createTemplate')),
          ], t.stringLiteral('@xely/eclipsa/prod-client'))
        )
      },
      exit(path) {
        path.unshiftContainer('body', toInsertBody)
      }
    },
    JSXElement(path) {
      const result = transformJSXElement(path, {
        prodClientIdenifiers: {
          createTemplate: createTemplateID
        }
      })
      toInsertBody = toInsertBody.concat(result.toInsertBody)
    },
  })
  return ast
}
