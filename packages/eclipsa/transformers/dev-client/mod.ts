// @ts-types="@types/babel__core"
import { transform} from '@babel/core'
// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { getJSXType, transformChildren, transformProps } from '../utils/jsx.ts'
import * as t from '@babel/types'

const pluginClientDevJSX = () => {
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
        path.node
        const openingElement = path.node.openingElement
        const type = getJSXType(openingElement)
        const { props } = transformProps(openingElement)
        const children = transformChildren(path.node)
        props.properties.push(t.objectProperty(t.stringLiteral('children'), children))

        const fn = t.arrowFunctionExpression([], t.objectExpression([
          t.objectProperty(t.stringLiteral('type'), type),
          t.objectProperty(t.stringLiteral('props'), props),
        ]))
        path.replaceWith(fn)
      }
    } satisfies Visitor
  }
}

export const transformClientDevJSX = (input: string) => {
  const resultCode = transform(input, {
    plugins: [pluginClientDevJSX()],
    sourceMaps: 'inline'
  })?.code
  console.log(resultCode)
  if (!resultCode) {
    throw new Error('Compiling JSX was failed.')
  }
  return resultCode
}
