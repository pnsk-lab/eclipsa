// @ts-types="@types/babel__core"
import { transformAsync } from '@babel/core'
import { pluginClientJSX } from './plugin.ts'
import { preprocessTSX } from '../shared/source.ts'

export const compileClientModule = async (
  input: string,
  id: string,
  options?: {
    hmr?: boolean
  },
) => {
  const preprocessed = await preprocessTSX(input, id)
  const resultCode = (
    await transformAsync(preprocessed.code, {
      filename: id,
      parserOpts: {
        sourceType: 'module',
        plugins: ['jsx'],
      },
      plugins: [pluginClientJSX(options)],
      sourceMaps: 'inline',
    })
  )?.code
  if (!resultCode) {
    throw new Error('Compiling JSX was failed.')
  }
  return resultCode
}
