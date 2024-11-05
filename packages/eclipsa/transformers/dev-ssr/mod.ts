// @ts-types="@types/babel__core"
import { transform, types as t } from '@babel/core'
// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import {
  getJSXType,
  getJSXTypeNode,
  transformChildren,
  transformProps,
} from '../utils/jsx.ts'
import { FRAGMENT } from '../../jsx/shared.ts'

interface PluginInit {
  fileid: string
}
const pluginJSXDevSSR = (init: PluginInit) => {
  let componentID = 0
  return {
    inherits: SyntaxJSX.default,
    visitor: {
      Program: {
        enter(path) {
          const jsxDEV = t.identifier('jsxDEV')
          const importDeclaration = t.importDeclaration([
            t.importSpecifier(jsxDEV, jsxDEV),
          ], t.stringLiteral('@xely/eclipsa/jsx-dev-runtime'))

          path.unshiftContainer('body', importDeclaration)
        },
      },
      JSXElement(path) {
        const openingElement = path.node.openingElement

        const type = getJSXType(openingElement)
        const jsxTypeExpr = getJSXTypeNode(type)
        const { props, key } = transformProps(openingElement)
        const children = transformChildren(path.node)
        props.properties.push(
          t.objectProperty(t.stringLiteral('children'), children),
        )

        const metaData = t.objectExpression([])
        if (type.type === 'component') {
          metaData.properties.push(
            t.objectProperty(
              t.identifier('fileid'),
              t.stringLiteral(init.fileid),
            ),
            t.objectProperty(
              t.identifier('componentID'),
              t.numericLiteral(componentID++),
            ),
          )
          componentID++
        }

        const fn = t.callExpression(t.identifier('jsxDEV'), [
          jsxTypeExpr,
          props,
          key ?? t.nullLiteral(),
          t.booleanLiteral(false),
          metaData,
        ])
        path.replaceWith(fn)
      },
      JSXFragment(path) {
        const fragmentString = t.jsxIdentifier(FRAGMENT)
        path.replaceWith(
          t.jsxElement(
            t.jsxOpeningElement(fragmentString, [], true),
            t.jsxClosingElement(fragmentString),
            path.node.children,
          ),
        )
      },
    } satisfies Visitor,
  }
}

export const transformJSXDevSSR = (code: string, id: string): string => {
  const resultCode = transform(code, {
    plugins: [pluginJSXDevSSR({
      fileid: id,
    })],
    sourceMaps: 'inline',
  })?.code

  if (!resultCode) {
    throw new Error('Compiling JSX was failed.')
  }
  return resultCode
}
