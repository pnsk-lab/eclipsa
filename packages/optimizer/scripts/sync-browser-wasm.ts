import { syncGeneratedBrowserWasm } from '../browser-artifacts.ts'

const syncedPath = syncGeneratedBrowserWasm()

if (syncedPath) {
  console.log(`Synced browser compiler wasm: ${syncedPath}`)
}
