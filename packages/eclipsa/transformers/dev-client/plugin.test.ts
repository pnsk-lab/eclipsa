import { assertEquals } from '@std/assert'
// @ts-types="@types/babel__core"
import { transform } from '@babel/core'
import { pluginClientDevJSX } from './plugin.ts'

Deno.test('Transform', () => {
  const resultCode = transform(`<div>
    <div>Count: {count.value}</div>
    <button type="button" onClick$={() => {
      count.value ++
    }}>count ++</button>
  </div>`, {
    plugins: [pluginClientDevJSX()],
  })?.code
  if (!resultCode) {
    throw new Error('Compiling JSX was failed.')
  }
  console.log(resultCode)
})