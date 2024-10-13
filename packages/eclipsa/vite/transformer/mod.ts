// @ts-types="@types/babel__core"
import * as babel from '@babel/core'

export const transformJSX = (code: string) => {
  const transormed = babel.transform(code, {
    sourceMaps: 'inline',
  })
  return transormed?.code ?? undefined
}
