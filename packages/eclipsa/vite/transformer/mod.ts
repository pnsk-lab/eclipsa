// @ts-types="@types/babel__core"
import * as babel from '@babel/core'
import jsxDomExpressions from 'babel-plugin-jsx-dom-expressions'

export const transformJSX = (code: string) => {
  const transormed = babel.transform(code, {
    /*plugins: [
      ['@babel/plugin-transform-react-jsx', {
        runtime: 'automatic',
        importSource: '@xely/eclipsa',
        development: true
      }]
    ]*/
    //sourceMaps: 'inline'
  })
  console.log(transormed?.code)
  return transormed?.code ?? undefined
}
