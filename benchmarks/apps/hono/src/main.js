import { App } from './App.js'

export async function render() {
  const html = App().toString()
  return html.length
}
