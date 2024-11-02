// @ts-types="@types/babel__core"
import * as babel from '@babel/core'
// @ts-types="@types/babel__traverse"
import _traverse from '@babel/traverse'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
const traverse = _traverse.default
const { types: t } = babel

export interface Built {
  client: Map<string, string>
}
export const buildFile = async (source: string): Promise<Built | null> => {
  const parsed = babel.parse(source, {
    plugins: [
      SyntaxJSX.default
    ]
  })
  if (!parsed) {
    return null
  }

  traverse(parsed, {
    Program: {
      enter(path) {
        //console.log(path)
      }
    }
  })
  const client = new Map<string, string>()
  client.set('a.js', 'console.log(0)')
  return {
    client
  }
}
