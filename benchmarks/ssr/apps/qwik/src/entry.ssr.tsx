/** @jsxImportSource @builder.io/qwik */
import { renderToString } from '@builder.io/qwik/server'
import Root from './root'

export async function render() {
  const result = await renderToString(<Root />)
  return result.html.length
}
