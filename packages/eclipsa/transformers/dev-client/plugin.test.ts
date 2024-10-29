import { assertEquals } from '@std/assert'
// @ts-types="@types/babel__core"
import { transform } from '@babel/core'
import { pluginClientDevJSX } from './plugin.ts'

Deno.test('Transform', () => {
  const resultCode = transform('<div>aa{a}<div>{a}a</div></div>', {
    plugins: [pluginClientDevJSX()],
    sourceMaps: 'inline',
  })?.code
  if (!resultCode) {
    throw new Error('Compiling JSX was failed.')
  }
  console.log(resultCode)
})