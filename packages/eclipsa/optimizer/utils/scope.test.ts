import { babel, type Scope, t, traverse } from '../babel.ts'
import { canBeReferedWithOnlyScope } from './scope.ts'
import { assertEquals } from '@std/assert'

Deno.test('canBeReferedWithOnlyScope()', () => {
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
  console.log(ast)
  let rootScope!: Scope
  let fnScope!: Scope
  let fn2Scope!: Scope
  traverse(ast, {
    Program(path) {
      rootScope = path.scope
    },
    FunctionDeclaration(path) {
      if (path.node.id?.name === 'fn') {
        fnScope = path.scope
      } else if (path.node.id?.name === 'fn2') {
        fn2Scope = path.scope
      }
    }
  })

  // `a` in `fn2` can be referenced only `fn`.
  assertEquals(canBeReferedWithOnlyScope(fn2Scope.getBinding('a'), fnScope), true)
  // `b` in root can be referenced only root.
  assertEquals(canBeReferedWithOnlyScope(rootScope.getBinding('b'), rootScope), true)

  // `a` in root can't be referenced only `fn`.
  assertEquals(canBeReferedWithOnlyScope(rootScope.getBinding('a'), fnScope), false)
  // `a` in root can't be referenced only `fn2`.
  assertEquals(canBeReferedWithOnlyScope(rootScope.getBinding('a'), fnScope), false)
})
