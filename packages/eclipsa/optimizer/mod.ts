// @ts-types="@types/babel__core"
import * as babel from '@babel/core'
// @ts-types="@types/babel__traverse"
import type { Visitor } from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'

const { types: t } = babel

export interface Built {
  client: Map<string, string>
}
export const buildFile = (source: string): Promise<Built> => {
  const parsed = babel.parse(source, {
    plugins: [
      SyntaxJSX.default
    ]
  })

  console.log(parsed)
}
