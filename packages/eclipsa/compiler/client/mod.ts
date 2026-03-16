import { runRustCompiler } from '../native/mod.ts'

export const compileClientModule = async (
  input: string,
  id: string,
  options?: {
    hmr?: boolean
  },
) => {
  return runRustCompiler({
    hmr: options?.hmr ?? true,
    id,
    source: input,
    target: 'client',
  })
}
