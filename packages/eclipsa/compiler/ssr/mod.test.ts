// @ts-types="@types/babel__core"
import { describe, expect, it } from 'vitest'
import { compileSSRModule } from './mod.ts'

describe('compileSSRModule', () => {
  it('emits SSR template fast paths for intrinsic JSX trees', async () => {
    const resultCode = await compileSSRModule(
      `const view = <section class="card" data-id={id}><h1>{title}</h1><p>hello</p></section>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('ssrTemplate([')
    expect(resultCode).toContain('ssrAttr("data-id", id)')
    expect(resultCode).not.toContain('jsxDEV("section"')
  })

  it('keeps event-bound elements on the generic JSX path', async () => {
    const resultCode = await compileSSRModule(
      `const view = <button onClick$={handleClick}>save</button>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('jsxDEV("button"')
    expect(resultCode).not.toContain('ssrTemplate([')
  })

  it('passes JSX fragment children through component props', async () => {
    const resultCode = await compileSSRModule(
      `const view = <Layout><><span>a</span>{value}</></Layout>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('"children": [')
    expect(resultCode).toContain('ssrTemplate(["<span>a</span>"])')
    expect(resultCode).toContain('value')
  })

  it('supports namespaced SVG tags and attributes', async () => {
    const resultCode = await compileSSRModule(
      `const view = <svg><sodipodi:namedview xml:space="preserve" /></svg>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain(
      '<sodipodi:namedview xml:space=\\"preserve\\"></sodipodi:namedview>',
    )
  })
})
