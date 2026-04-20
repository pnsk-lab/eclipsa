export const NATIVE_HOST_QUICKJS_CRATE_DIRECTORY = new URL('./rust', import.meta.url).pathname

export interface QuickJSEvalResult {
  ok: boolean
  value: string
}
