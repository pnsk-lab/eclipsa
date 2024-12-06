import { xxHash32 } from '../../utils/xxhash32.ts'
import { generate, t } from '../babel.ts'

export const nodeToHash = (node: t.Node) => {
  return xxHash32(generate(node).code).toString(32)
}
