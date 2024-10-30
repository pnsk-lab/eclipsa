// @ts-types="@types/babel__core"
import { transform, types as t } from '@babel/core'
// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { getJSXType, getJSXTypeNode, transformChildren, transformProps } from '../utils/jsx.ts'

const pluginJSX = () => {
  return {
    inherits: SyntaxJSX.default,
    visitor: {
      Program: {
        enter(path) {
          const jsxDEV = t.identifier('jsxDEV')
          const importDeclaration = t.importDeclaration([
            t.importSpecifier(jsxDEV, jsxDEV)
          ], t.stringLiteral('@xely/eclipsa/jsx-dev-runtime'))

          path.unshiftContainer('body', importDeclaration)
        }
      },
      JSXElement(path) {
        const openingElement = path.node.openingElement

        const type = getJSXTypeNode(openingElement)
        const { props, key } = transformProps(openingElement)
        const children = transformChildren(path.node)
        props.properties.push(t.objectProperty(t.stringLiteral('children'), children))
        
        const fn = t.callExpression(t.identifier('jsxDEV'), [
          type,
          props,
          key ?? t.nullLiteral(),
          t.booleanLiteral(false)
        ])
        path.replaceWith(fn)
      },
    } satisfies Visitor,
  }
}

export const transformJSX = (code: string): string => {
  const resultCode = transform(code, {
    plugins: [pluginJSX()],
    sourceMaps: 'inline'
  })?.code

  if (!resultCode) {
    throw new Error('Compiling JSX was failed.')
  }
  return resultCode
}
