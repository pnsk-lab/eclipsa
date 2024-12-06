import { analyzeImports } from './analyze-import.ts'
import { babel, generate, t } from './babel.ts'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { analyzeEurl } from './eurl-process.ts'
import { transformJSX } from './jsx/mod.ts'

export interface Built {
  client: Map<string, {
    code: string
    id?: string
  }>
  clientEntry: string
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

  const imports = analyzeImports(parsed)

  const { client, clientEntry } = analyzeEurl(parsed, imports)

  return {
    client,
    clientEntry
  }
}
