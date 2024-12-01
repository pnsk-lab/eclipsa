import { transformProps } from '../../transformers/utils/jsx.ts'
import { getJSXType, type JSXType } from '../../transformers/utils/jsx.ts'
import { generate, type NodePath, t } from '../babel.ts'

interface Init {
  prodClientIdenifiers: {
    createTemplate: t.Identifier
    createComponentResult: t.Identifier
    effect: t.Identifier
    insert: t.Identifier
    createComponentEurl: t.Identifier
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

  path.traverse({
    JSXElement(path) {
      hasOtherElement = true
      path.stop()
    }
  })

  let jsxType: JSXType | null = null
  if (path.isJSXElement()) {
    jsxType = getJSXType(path.node.openingElement)
  }

  // Attrs
  let staticAttrs = ''
  if (jsxType && jsxType.type === 'element') {
    const node = path.node as t.JSXElement
    const attrs = node.openingElement.attributes

    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i]
      if (attr.type === 'JSXSpreadAttribute') {
        throw new TypeError('JSXSpreadAttribute is not supported.')
      }
      const name = typeof attr.name.name === 'string' ? attr.name.name : attr.name.name.name
      if (attr.value?.type === 'StringLiteral') {
        staticAttrs += `${name}="${attr.value.value.replaceAll('"', '\\"')}" `
        continue
      }
      // Dynamic
      let value: t.Expression | null = null
      if (attr.value?.type === 'JSXElement' || attr.value?.type === 'JSXFragment') {
        value = attr.value as unknown as t.Expression
      } else if (attr.value?.type === 'JSXExpressionContainer') {
        value = attr.value.expression as t.Expression
      }
      if (value) {
        insertStatements.push(t.expressionStatement(
          t.callExpression(
            init.prodClientIdenifiers.effect,
            [t.arrowFunctionExpression([], t.assignmentExpression('=', t.memberExpression(elemId, t.identifier(name)), value))]
          )
        ))
      }
    }
  }


  if (!hasOtherElement) {
    // Just use textContent
    let template = ''
    if (jsxType) {
      template = `<${jsxType.name} ${staticAttrs}></${jsxType.name}>`
    }
    const quasis: t.TemplateElement[] = [t.templateElement({ raw: '' })]
    const expressions: t.Expression[] = []
    for (const child of path.node.children) {
      if (child.type === 'JSXText') {
        quasis[quasis.length - 1].value.raw += child.value
      } else if (child.type === 'JSXExpressionContainer') {
        expressions.push(child.expression as t.Expression)
        quasis.push(t.templateElement({ raw: '' }))
      }
    }
    insertStatements.push(
      t.expressionStatement(t.callExpression(
        init.prodClientIdenifiers.effect,
        [t.arrowFunctionExpression([], t.assignmentExpression('=', t.memberExpression(elemId, t.identifier('textContent')), t.templateLiteral(quasis, expressions)))]
      )),
    )
    return {
      template,
      insertStatements
    }
  }

  let children = ''

  let commentSignalI = 0
  for (const child of Array.from(childPaths)) {
    if (child.isJSXSpreadChild()) {
      throw new TypeError('JSXSpreadChild is not supported.')
    } else if (child.isJSXExpressionContainer()) {
      children += `<ec:s sig="${commentSignalI}" />`
      insertStatements.push(t.expressionStatement(t.callExpression(init.prodClientIdenifiers.insert, [elemId, t.numericLiteral(commentSignalI), t.arrowFunctionExpression([], child.node.expression as t.Expression)])))
      commentSignalI++
    } else if (child.isJSXText()) {
      children += child.node.value
    } else if (child.isJSXFragment()) {
      children += processElement(child, nodeAccessPath, elemId, init, insertStatements).template
    } else if (child.isJSXElement()) {
      const jsxType = getJSXType(child.node.openingElement)
      if (jsxType.type === 'element') {
        // Process pure element
        children += processElement(child as NodePath<t.JSXElement | t.JSXFragment>, nodeAccessPath, elemId, init, insertStatements).template
        continue
      }
      // Process component
      children += `<ec:s sig="${commentSignalI}" />`
      insertStatements.push(
        t.expressionStatement(
          t.callExpression(
            init.prodClientIdenifiers.createComponentEurl,
            [elemId, t.numericLiteral(commentSignalI), t.stringLiteral('eurl'), transformProps(child.node.openingElement).props]
          )
        )
      )
      commentSignalI++
    }
  }

  let template = ''
  if (path.isJSXFragment()) {
    template = children
  } else if (path.isJSXElement()) {
    const type = getJSXType(path.node.openingElement)
    template += `<${type.name} ${staticAttrs}>${children}</${type.name}>`
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
