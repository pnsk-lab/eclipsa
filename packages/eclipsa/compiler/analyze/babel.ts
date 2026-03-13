// @ts-types="@types/babel__core"
import * as babel from '@babel/core'
// @ts-types="@types/babel__traverse"
import _traverse from '@babel/traverse'
// @ts-types="@types/babel__core"
import { types } from '@babel/core'
// @ts-types="@types/babel__generator"
import generateCode from '@babel/generator'

// @ts-types="@types/babel__traverse"
export type { NodePath, Scope, Binding } from '@babel/traverse'

export const generate = ((generateCode as unknown as { default?: typeof generateCode }).default ??
  generateCode) as typeof generateCode
export const traverse = ((_traverse as unknown as { default?: typeof _traverse }).default ??
  _traverse) as typeof _traverse
export { babel }
export { types as t }
