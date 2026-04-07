import { renderToString } from 'react-dom/server';
import App from './App.jsx';

export async function render() {
  const html = renderToString(<App />);
  return html.length;
}
