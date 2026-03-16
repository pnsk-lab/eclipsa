import { runRustCompiler } from '../native/mod.ts'

export const compileSSRModule = async (code: string, id: string): Promise<string> => {
  return runRustCompiler({
    id,
    source: code,
    target: 'ssr',
  })
}
