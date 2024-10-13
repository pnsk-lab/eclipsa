import type { JSX } from './types.ts'

interface Source {
  fileName: string
}
export const jsxDEV = (
  type: JSX.Type,
  props: Record<string, unknown>,
  key: string | number | symbol,
  isStatic: boolean,
  _source: Source,
): JSX.Element => ({
  type,
  props,
  key,
  isStatic,
  children: props.children as JSX.Element[],
})
