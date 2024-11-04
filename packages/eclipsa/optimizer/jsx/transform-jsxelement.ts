import { type NodePath, t } from '../babel.ts'

export const transformJSXElement = (path: NodePath<t.JSXElement>) => {
  const ssrElemId = path.scope.generateUidIdentifier('ssrElem')
  const templateId = path.scope.generateDeclaredUidIdentifier('template')
  const elemId = path.scope.generateUidIdentifier('elem')
  const functionExpr = t.arrowFunctionExpression([ssrElemId], t.blockStatement([
    t.variableDeclaration('var', [t.variableDeclarator(elemId, t.logicalExpression('??', ssrElemId, t.callExpression(elemId, [])))])
  ]))

  path.replaceWith(functionExpr)
}
