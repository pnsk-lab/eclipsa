// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { getJSXType, transformChildren, transformProps } from '../utils/jsx.ts'
import * as t from '@babel/types'

export const pluginClientDevJSX = () => {
  let createTemplate!: t.Identifier
  return {
    inherits: SyntaxJSX.default,
    visitor: {
      Program: {
        enter(path) {
          createTemplate = path.scope.generateUidIdentifier('createTemplate')
          const importDeclaration = t.importDeclaration([
            t.importSpecifier(createTemplate, t.identifier('createTemplate'))
          ], t.stringLiteral('@xely/eclipsa'))
          path.unshiftContainer('body', importDeclaration)
        }
      },
      JSXElement(path) {
        const processChildren = (children: t.JSXElement['children']) => {
          let text = ''
          for (const child of children) {
            if (t.isJSXText(child)) {
              text += child.value
            } else if (t.isJSXExpressionContainer(child)) {
              text += '<!>'
            } else if (t.isJSXElement(child)) {
              text += processJSXElement(child)
            } else if (t.isJSXFragment(child)) {
              text += processChildren(child.children)
            } else {
              throw new Error(`${child.type} is not supported.`)
            }
          }
          return text
        }
        const processJSXElement = (elem: t.JSXElement) => {
          const jsxTypeName = getJSXType(elem.openingElement).name
          return `<${jsxTypeName}>${processChildren(elem.children)}</${jsxTypeName}>`
        }
        
        console.log([processJSXElement(path.node)])
        /*
        const openingElement = path.node.openingElement
        const type = getJSXType(openingElement)
        const { props } = transformProps(openingElement)
        const children = transformChildren(path.node)
        props.properties.push(t.objectProperty(t.stringLiteral('children'), children))

        const fn = t.arrowFunctionExpression([], t.objectExpression([
          t.objectProperty(t.stringLiteral('type'), type),
          t.objectProperty(t.stringLiteral('props'), props),
        ]))
        path.replaceWith(fn)*/
      }
    } satisfies Visitor
  }
}
