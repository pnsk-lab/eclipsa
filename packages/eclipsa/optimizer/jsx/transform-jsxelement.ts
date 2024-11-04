import { type NodePath, t } from '../babel.ts'

interface Init {
  prodClientIdenifiers: {
    createTemplate: t.Identifier
  }
}
interface Result {
  toInsertBody: t.Statement[]
}

export const processElement = (path: NodePath<t.JSXElement>): {
  template: string
} => {
  let template = ''

  path.traverse({
    JSXElement: {
      enter(path) {
      }
    }
  })

  return {
    template
  }
}

export const transformJSXElement = (path: NodePath<t.JSXElement>, init: Init): Result => {
  const toInsertBody: t.Statement[] = []

  // Generate Template
  const templateId = path.scope.generateUidIdentifier('template')
  toInsertBody.push(
    t.variableDeclaration('var', [
      t.variableDeclarator(
        templateId,
        t.callExpression(init.prodClientIdenifiers.createTemplate, [
          t.stringLiteral('<div></div>'),
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

  processElement(path)

  return {
    toInsertBody,
  }
}
