import { analyzeImports } from './analyze-import.ts'
import { babel, generate, t } from './babel.ts'
import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { analyzeComponents } from './eurl-process.ts'
import { transformJSX } from './jsx/mod.ts'

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

  const imports = analyzeImports(parsed)

  const client = analyzeComponents(parsed, imports)

  for (const [file, code] of client) {
    client.set(file, generate(transformJSX(babel.parse(code, {
      plugins: [
        SyntaxJSX.default
      ]
    })!)).code)
  }

  return {
    client
  }
}
