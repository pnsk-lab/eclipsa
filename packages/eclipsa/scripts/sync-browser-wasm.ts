import { syncGeneratedBrowserWasm } from '../compiler/native/browser-artifacts.ts'

const syncedPath = syncGeneratedBrowserWasm()

if (syncedPath) {
  console.log(`Synced browser compiler wasm: ${syncedPath}`)
}
