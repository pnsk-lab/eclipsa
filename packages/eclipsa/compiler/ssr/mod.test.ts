// @ts-types="@types/babel__core"
import { describe, expect, it } from 'vitest'
import { compileSSRModule } from './mod.ts'

describe('compileSSRModule', () => {
  it('passes JSX fragment children through component props', async () => {
    const resultCode = await compileSSRModule(
      `const view = <Layout><><span>a</span>{value}</></Layout>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('"children": [')
    expect(resultCode).toContain('jsxDEV("span"')
    expect(resultCode).toContain('value')
  })

  it('supports namespaced SVG tags and attributes', async () => {
    const resultCode = await compileSSRModule(
      `const view = <svg><sodipodi:namedview xml:space="preserve" /></svg>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('jsxDEV("sodipodi:namedview"')
    expect(resultCode).toContain('"xml:space": "preserve"')
  })
})
