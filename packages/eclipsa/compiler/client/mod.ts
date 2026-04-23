import { runRustCompiler } from '@eclipsa/optimizer'
import type { AnalyzeEventMode } from '../analyze/mod.ts'

export const compileClientModule = async (
  input: string,
  id: string,
  options?: {
    eventMode?: AnalyzeEventMode
    hmr?: boolean
  },
) => {
  return runRustCompiler({
    eventMode: options?.eventMode,
    hmr: options?.hmr ?? true,
    id,
    source: input,
    target: 'client',
  })
}
