import { getJSXType } from '../../transformers/utils/jsx.ts'
import { type NodePath, t } from '../babel.ts'

interface Init {
  prodClientIdenifiers: {
    createTemplate: t.Identifier
    createComponentResult: t.Identifier
    effect: t.Identifier
  }
  componentVariableObjectIdentifier: t.Identifier
}
interface Result {
  toInsertBody: t.Statement[]
}

type NodeAccessPath = number[]

export const processElement = (
  path: NodePath<t.JSXElement | t.JSXFragment>,
  nodeAccessPath: NodeAccessPath,
  elemId: t.Identifier,
  init: Init,
  insertStatements: t.Statement[] = []
): {
  template: string,
  insertStatements: t.Statement[]
} => {
  const childPaths = Array.from(path.get('children'))
  let hasOtherElement = false
  for (const child of childPaths) {
    child.traverse({
      JSXElement(path) {
        hasOtherElement = true
        path.stop()
      }
    })
    if (hasOtherElement) {
      break
    }
  }

  if (!hasOtherElement) {
    // Just use textContent
    const type = path.isJSXElement() ? getJSXType(path.node.openingElement) : null
    const template = type ? `<${type.name}></${type.name}>` : ''

    const quasis: t.TemplateElement[] = []
    const expressions: t.Expression[] = []
    for (const child of path.node.children) {
      if (child.type === 'JSXText') {
        quasis.push(t.templateElement({
          raw: child.value,
          cooked: child.value
        }))
      } else if (child.type === 'JSXExpressionContainer') {
        expressions.push(child.expression as t.Expression)
      }
    }
    insertStatements.push(
      t.expressionStatement(t.callExpression(
        init.prodClientIdenifiers.effect,
        [t.arrowFunctionExpression([], t.assignmentExpression('=', t.memberExpression(elemId, t.identifier('textContent')), t.templateLiteral(quasis, expressions)))]
      ))
    )
    return {
      template,
      insertStatements
    }
  }

  let children = ''

  for (const child of Array.from(childPaths)) {
    if (child.isJSXSpreadChild()) {
      throw new TypeError('JSXSpreadChild is not supported.')
    } else if (child.isJSXExpressionContainer()) {
      console.log(child.node.expression)
    } else if (child.isJSXText()) {
      children += child.node.value
    } else {
      children += processElement(child as NodePath<t.JSXElement | t.JSXFragment>, nodeAccessPath, elemId, init, insertStatements).template
    }
  }

  let template = ''
  if (path.isJSXFragment()) {
    template = children
  } else if (path.isJSXElement()) {
    const type = getJSXType(path.node.openingElement)
    template += `<${type.name}>${children}</${type.name}>`
  }

  return {
    template,
    insertStatements
  }
}

export const transformJSXElement = (path: NodePath<t.JSXElement>, init: Init): Result => {
  const toInsertBody: t.Statement[] = []

  // For function
  const elemId = path.scope.generateUidIdentifier('elem')

  // Generate Template
  const templateId = path.scope.generateUidIdentifier('template')
  const processedElement = processElement(path, [], elemId, init)

  toInsertBody.push(
    t.variableDeclaration('var', [
      t.variableDeclarator(
        templateId,
        t.callExpression(init.prodClientIdenifiers.createTemplate, [
          t.stringLiteral(processedElement.template),
        ]),
      ),
    ]),
  )

  const ssrElemId = path.scope.generateUidIdentifier('ssrElem')
  const functionExpr = t.arrowFunctionExpression(
    [ssrElemId],
    t.blockStatement([
      t.variableDeclaration('var', [
        t.variableDeclarator(
          elemId,
          t.logicalExpression('??', ssrElemId, t.callExpression(templateId, [])),
        ),
      ]),
      ...processedElement.insertStatements,
      t.returnStatement(elemId)
    ]),
  )

  path.replaceWith(t.callExpression(init.prodClientIdenifiers.createComponentResult, [
    init.componentVariableObjectIdentifier,
    functionExpr
  ]))

  return {
    toInsertBody,
  }
}
