import { fileURLToPath } from 'node:url'

export const NATIVE_HOST_QUICKJS_CRATE_DIRECTORY = fileURLToPath(new URL('./rust', import.meta.url))

export interface QuickJSEvalResult {
  ok: boolean
  value: string
}
