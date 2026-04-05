import { runRustCompiler } from '@eclipsa/optimizer'

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
