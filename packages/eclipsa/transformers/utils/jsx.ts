// @ts-types="@types/babel__core"
import { types as t } from '@babel/core'

export const transformProps = (elem: t.JSXOpeningElement) => {
  const propArr: (t.ObjectProperty | t.SpreadElement | t.ObjectMethod)[] = []
  let key: t.Expression | undefined
  for (const attr of elem.attributes) {
    if (t.isJSXSpreadAttribute(attr)) {
      propArr.push(t.spreadElement(attr.argument))
      continue
    }
    if (t.isJSXNamespacedName(attr.name)) {
      throw new Error('JSXNamespacedName is not supported.')
    }
    const isKey = attr.name.name === 'key'
    const name = t.stringLiteral(attr.name.name)
    if (attr.value === null) {
      propArr.push(t.objectProperty(name, t.booleanLiteral(true)))
      break
    }
    if (t.isStringLiteral(attr.value)) {
      if (isKey) {
        key = attr.value
      }
      propArr.push(t.objectProperty(name, attr.value))
      continue
    }
    if (t.isJSXExpressionContainer(attr.value)) {
      if (t.isJSXEmptyExpression(attr.value.expression)) {
        continue
      }
      if (isKey) {
        key = attr.value.expression
      }
      const isStatic = t.isLiteral(attr.value.expression)
      if (isStatic) {
        propArr.push(t.objectProperty(name, attr.value.expression))
      } else {
        // Use getter
        propArr.push(
          t.objectMethod(
            'get',
            t.identifier(attr.name.name),
            [],
            t.blockStatement([
              t.returnStatement(attr.value.expression),
            ]),
          ),
        )
      }
      continue
    }
  }
  return {
    props: t.objectExpression(propArr),
    key,
  }
}

const UPPER_CASE_REGEX = /[A-Z]/
export interface JSXType {
  type: 'component' | 'element'
  name: string

  __isJSXType: true
}
export const getJSXType = (elem: t.JSXOpeningElement): JSXType => {
  if (elem.name.type !== 'JSXIdentifier') {
    throw new TypeError('expected JSXIdentifier')
  }
  const name = elem.name.name
  if (UPPER_CASE_REGEX.test(name[0])) {
    return { type: 'component', name, __isJSXType: true }
  }
  return { type: 'element', name, __isJSXType: true }
}
export const getJSXTypeNode = (source: t.JSXOpeningElement | JSXType) => {
  const { name, type } = '__isJSXType' in source ? source : getJSXType(source)
  if (type === 'component') {
    return t.identifier(name)
  }
  return t.stringLiteral(name)
}

export const transformChildren = (elem: t.JSXElement) =>
  t.arrayExpression(
    elem.children.map((child) => {
      if (t.isJSXText(child)) {
        const str = child.value.trim()
        if (str === '') {
          return null
        }
        return t.stringLiteral(str)
      }
      if (t.isJSXExpressionContainer(child)) {
        if (t.isJSXEmptyExpression(child.expression)) {
          return null
        }
        return child.expression
      }
      if (t.isJSXElement(child)) {
        return child as unknown as t.Expression
      }
      return null
    }).filter(Boolean),
  )
