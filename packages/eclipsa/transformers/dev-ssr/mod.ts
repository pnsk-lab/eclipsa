// @ts-types="@types/babel__core"
import { transform, types as t } from '@babel/core'
// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'

const pluginJSX = () => {
  return {
    inherits: SyntaxJSX.default,
    visitor: {
      JSXElement(path) {
        console.log(path)
      },
    } satisfies Visitor,
  }
}

export const transformJSX = (code: string): string => {
  const resultCode = transform(code, {
    plugins: [pluginJSX()],
  })?.code

  if (!resultCode) {
    throw new Error('Compiling JSX was failed.')
  }
  return resultCode
}
