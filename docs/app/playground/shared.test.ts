import { describe, expect, it } from 'vitest'
import {
  PLAYGROUND_ECLIPSA_DIST_TYPE_FILE_COUNT,
  PLAYGROUND_ECLIPSA_MODULE_SHIMS,
  PLAYGROUND_MONACO_LANGUAGE_CONTRIBUTIONS,
} from './browser-compiler.ts'
import { formatPlaygroundError, PLAYGROUND_EDITOR_LANGUAGE } from './shared.ts'

describe('playground error formatting', () => {
  it('prefers the compiler message over stack frames', () => {
    const error = new Error('failed to parse playground-input.tsx')
    error.stack = `Error: failed to parse playground-input.tsx\n    at analyzeModule (unknown)\n    at async next`

    expect(formatPlaygroundError(error)).toBe('failed to parse playground-input.tsx')
  })
})

describe('playground editor configuration', () => {
  it('pins Monaco to the TypeScript language service', () => {
    expect(PLAYGROUND_EDITOR_LANGUAGE).toBe('typescript')
  })

  it('loads both the TypeScript language service and tokenizer contributions', () => {
    expect(PLAYGROUND_MONACO_LANGUAGE_CONTRIBUTIONS).toContain(
      'monaco-editor/esm/vs/language/typescript/monaco.contribution.js',
    )
    expect(PLAYGROUND_MONACO_LANGUAGE_CONTRIBUTIONS).toContain(
      'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js',
    )
  })

  it('registers Eclipsa declaration files and package entry shims for Monaco', () => {
    expect(PLAYGROUND_ECLIPSA_DIST_TYPE_FILE_COUNT).toBeGreaterThan(0)
    expect(PLAYGROUND_ECLIPSA_MODULE_SHIMS['/node_modules/eclipsa/index.d.ts']).toMatch(
      /\.\/mod\.(d\.mts|ts)/,
    )
    expect(PLAYGROUND_ECLIPSA_MODULE_SHIMS['/node_modules/eclipsa/client.d.ts']).toMatch(
      /\.\/core\/client\/mod\.(d\.mts|ts)/,
    )
  })
})
