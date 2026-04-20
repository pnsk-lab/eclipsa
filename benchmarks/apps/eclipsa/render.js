import { renderSSRAsync } from '../../../packages/eclipsa/dist/mod.mjs'
import Page from './dist/ssr/entries/route___page.mjs'

export const render = async () => {
  const { html } = await renderSSRAsync(Page)
  return html.length
}
