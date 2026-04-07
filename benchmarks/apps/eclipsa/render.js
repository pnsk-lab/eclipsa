import { renderSSRAsync } from 'eclipsa'
import Page from './dist/ssr/entries/route___page.mjs'

export const render = async () => {
  const { html } = await renderSSRAsync(Page)
  return html.length
}
