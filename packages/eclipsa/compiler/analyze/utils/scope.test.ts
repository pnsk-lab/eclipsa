import { describe, expect, it } from 'vitest'
import { babel, traverse, type Scope } from '../babel.ts'
import { canBeReferedWithOnlyScope } from './scope.ts'

describe('canBeReferedWithOnlyScope()', () => {
  it('checks whether a binding is reachable from a given scope', () => {
    const ast = babel.parse(`
      const a = 0
      const b = 0
      function fn() {
        const a = 1
        function fn2 () {
          console.log(a, b)
        }
      }
    `)!

    let rootScope!: Scope
    let fnScope!: Scope
    let fn2Scope!: Scope

    traverse(ast, {
      Program(path: any) {
        rootScope = path.scope
      },
      FunctionDeclaration(path: any) {
        if (path.node.id?.name === 'fn') {
          fnScope = path.scope
        } else if (path.node.id?.name === 'fn2') {
          fn2Scope = path.scope
        }
      },
    })

    expect(canBeReferedWithOnlyScope(fn2Scope.getBinding('a'), fnScope)).toBe(true)
    expect(canBeReferedWithOnlyScope(rootScope.getBinding('b'), rootScope)).toBe(true)
    expect(canBeReferedWithOnlyScope(rootScope.getBinding('a'), fnScope)).toBe(false)
    expect(canBeReferedWithOnlyScope(rootScope.getBinding('a'), fn2Scope)).toBe(false)
  })
})
