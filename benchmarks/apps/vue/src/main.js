import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import App from './App.vue';

export async function render() {
  const app = createSSRApp(App);
  const html = await renderToString(app);
  return html.length;
}
