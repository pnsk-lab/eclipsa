// @ts-types="@types/babel__core"
import * as babel from '@babel/core'
// @ts-types="@types/babel__traverse"
import _traverse from '@babel/traverse'
// @ts-types="@types/babel__core"
import { types } from '@babel/core'
// @ts-types="@types/babel__generator"
import _generate from '@babel/generator'

// @ts-types="@types/babel__traverse"
export type { NodePath } from '@babel/traverse'

export const generate = _generate.default
export const traverse = _traverse.default
export { babel }
export { types as t }
