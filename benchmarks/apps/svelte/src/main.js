import { render as renderComponent } from 'svelte/server';
import App from './App.svelte';

export async function render() {
  const result = renderComponent(App);
  return result.body.length;
}
