import { getJSXType } from '../../transformers/utils/jsx.ts'
import { type NodePath, t } from '../babel.ts'

interface Init {
  prodClientIdenifiers: {
    createTemplate: t.Identifier
  }
  componentVariableObjectIdentifier: t.Identifier
}
interface Result {
  toInsertBody: t.Statement[]
}

type NodeAccessPath = number[]

export const processElement = (path: NodePath<t.JSXElement>, nodeAccessPath: NodeAccessPath): {
  template: string
} => {
  let template = ''

  if (path.node.children.length === 0) {
    // No children, forever
    const type = getJSXType(path.node.openingElement)
    template += `<${type.name}></${type.name}>`
  } else {
    // Has children!
    const type = getJSXType(path.node.openingElement)
    template += `<${type.name}>We are children.</${type.name}>`
  }

  return {
    template
  }
}

export const transformJSXElement = (path: NodePath<t.JSXElement>, init: Init): Result => {
  const toInsertBody: t.Statement[] = []

  // Generate Template
  const templateId = path.scope.generateUidIdentifier('template')
  const templateStr = processElement(path, []).template
  toInsertBody.push(
    t.variableDeclaration('var', [
      t.variableDeclarator(
        templateId,
        t.callExpression(init.prodClientIdenifiers.createTemplate, [
          t.stringLiteral(templateStr),
        ]),
      ),
    ]),
  )

  const ssrElemId = path.scope.generateUidIdentifier('ssrElem')
  const elemId = path.scope.generateUidIdentifier('elem')
  const functionExpr = t.arrowFunctionExpression(
    [ssrElemId],
    t.blockStatement([
      t.variableDeclaration('var', [
        t.variableDeclarator(
          elemId,
          t.logicalExpression('??', ssrElemId, t.callExpression(elemId, [])),
        ),
      ]),
    ]),
  )
  const functionIdentifier = path.scope.generateUidIdentifier('fn')

  path.replaceWith(t.callExpression(t.arrowFunctionExpression([], t.blockStatement([
    t.variableDeclaration('var', [
      t.variableDeclarator(functionIdentifier, functionExpr),
    ]),
    t.expressionStatement(t.assignmentExpression(
      '=',
      t.memberExpression(functionIdentifier, t.identifier('_var')),
      init.componentVariableObjectIdentifier
    )),
    t.returnStatement(functionIdentifier)
  ])), []))

  return {
    toInsertBody,
  }
}
