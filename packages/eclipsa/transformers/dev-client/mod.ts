// @ts-types="@types/babel__core"
import { transform } from '@babel/core'
import { pluginClientDevJSX } from './plugin.ts'

export const transformClientDevJSX = (input: string, id: string) => {
  const resultCode = transform(input, {
    plugins: [pluginClientDevJSX()],
    sourceMaps: 'inline',
    inputSourceMap: true
  })?.code
  if (!resultCode) {
    throw new Error('Compiling JSX was failed.')
  }
  return resultCode
}
