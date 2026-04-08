import { renderToString } from 'solid-js/web'
import { App } from './App.js'

export async function render() {
  const html = renderToString(App)
  return html.length
}
