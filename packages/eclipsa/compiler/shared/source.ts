import { transform } from 'esbuild'

interface PreprocessResult {
  code: string
}

/**
 * Strip TypeScript syntax while preserving JSX so Babel can focus on JSX lowering.
 */
export const preprocessTSX = async (code: string, id: string): Promise<PreprocessResult> => {
  const queryIndex = id.indexOf('?')
  const fileId = queryIndex >= 0 ? id.slice(0, queryIndex) : id
  const result = await transform(code, {
    loader: fileId.endsWith('.tsx') || fileId.endsWith('.jsx') ? 'tsx' : 'ts',
    format: 'esm',
    jsx: 'preserve',
    sourcefile: fileId,
    target: 'es2022',
  })

  return {
    code: result.code,
  }
}
