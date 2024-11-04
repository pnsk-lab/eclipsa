import { babel, t, traverse } from '../babel.ts'
import { transformJSXElement } from './transform-jsxelement.ts'

/**
 * JSX Transpiler (Output maybe optimized)
 */
export const transformJSX = (ast: t.File) => {
  traverse(ast, {
    JSXElement: transformJSXElement,
  })
  return ast
}
