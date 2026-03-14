// @ts-types="@types/babel__core"
import { types as t } from '@babel/core'

export const getJSXAttributeName = (name: t.JSXAttribute['name']) => {
  if (t.isJSXIdentifier(name)) {
    return name.name
  }
  if (t.isJSXNamespacedName(name)) {
    return `${name.namespace.name}:${name.name.name}`
  }
  throw new TypeError('expected JSXIdentifier or JSXNamespacedName')
}

export const getJSXElementName = (name: t.JSXOpeningElement['name']) => {
  if (t.isJSXIdentifier(name)) {
    return name.name
  }
  if (t.isJSXNamespacedName(name)) {
    return `${name.namespace.name}:${name.name.name}`
  }
  throw new TypeError('expected JSXIdentifier or JSXNamespacedName')
}

export const transformProps = (elem: t.JSXOpeningElement) => {
  const propArr: (t.ObjectProperty | t.SpreadElement | t.ObjectMethod)[] = []
  let key: t.Expression | undefined
  for (const attr of elem.attributes) {
    if (t.isJSXSpreadAttribute(attr)) {
      propArr.push(t.spreadElement(attr.argument))
      continue
    }
    const attrName = getJSXAttributeName(attr.name)
    const isKey = attrName === 'key'
    const name = t.stringLiteral(attrName)
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
            t.stringLiteral(attrName),
            [],
            t.blockStatement([t.returnStatement(attr.value.expression)]),
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
  if (t.isJSXNamespacedName(elem.name)) {
    return {
      type: 'element',
      name: getJSXElementName(elem.name),
      __isJSXType: true,
    }
  }
  const name = getJSXElementName(elem.name)
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

export const normalizeJSXText = (value: string) => {
  if (value.replaceAll(/[\t\r\n ]/g, '') === '') {
    return null
  }

  if (!/[\r\n]/.test(value)) {
    return value
  }

  const lines = value.split(/\r\n|\n|\r/)
  let result = ''

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index]!.replaceAll('\t', ' ')
    if (index > 0) {
      line = line.replace(/^[ ]+/, '')
    }
    if (index < lines.length - 1) {
      line = line.replace(/[ ]+$/, '')
    }
    if (line === '') {
      continue
    }
    if (result !== '') {
      result += ' '
    }
    result += line
  }

  return result === '' ? null : result
}

const transformChildNodes = (
  children: (
    | t.JSXText
    | t.JSXExpressionContainer
    | t.JSXElement
    | t.JSXFragment
    | t.JSXSpreadChild
  )[],
): t.Expression[] =>
  children.flatMap((child) => {
    if (t.isJSXText(child)) {
      const str = normalizeJSXText(child.value)
      return str === null ? [] : [t.stringLiteral(str)]
    }
    if (t.isJSXExpressionContainer(child)) {
      if (t.isJSXEmptyExpression(child.expression)) {
        return []
      }
      return [child.expression]
    }
    if (t.isJSXElement(child)) {
      return [child as unknown as t.Expression]
    }
    if (t.isJSXFragment(child)) {
      return transformChildNodes(child.children)
    }
    return []
  })

export const transformChildren = (elem: t.JSXElement) =>
  t.arrayExpression(transformChildNodes(elem.children))
