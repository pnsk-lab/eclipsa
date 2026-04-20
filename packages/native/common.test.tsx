/** @jsxImportSource @eclipsa/native */

import { AppRoot } from './mod.ts'
import { describe, expect, it } from 'vitest'

describe('@eclipsa/native common entry', () => {
  it('throws when shared components are used without a concrete native target alias', () => {
    expect(() => AppRoot({ title: 'No target' })).toThrowError(
      '@eclipsa/native AppRoot requires the native Vite plugin to alias the package to a concrete target common entry.',
    )
  })
})
