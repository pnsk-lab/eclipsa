import type { Binding, Scope } from '../babel.ts'

/**
 * Get whether the variable can be referenced only in the given scope.
 */
export const canBeReferedWithOnlyScope = (
  binding?: Binding,
  scope?: Scope
) => {
  if (!binding || !scope) {
    return false
  }
  const definedScope = binding.scope // 変数が定義されているスコープ

  let crrScope = definedScope
  while (true) {
    if (crrScope === scope) {
      return true
    }
    crrScope = crrScope.parent
    if (!crrScope) {
      return false
    }
  }
}