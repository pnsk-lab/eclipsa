import { createVaporApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from './App.vue'

const prepareSSRApp = (app) => {
  app._context.optionsCache ??= new WeakMap()
  app._context.propsCache ??= new WeakMap()
  app._context.emitsCache ??= new WeakMap()
  app._context.config.optionMergeStrategies ??= {}
  app._context.config.compilerOptions ??= {}
  return app
}

export async function render() {
  const app = prepareSSRApp(createVaporApp(App))
  const html = await renderToString(app)
  return html.length
}
