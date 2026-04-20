import { describe, expect, it } from 'vitest'
import { compileSSRModule } from './mod.ts'

describe('compileSSRModule', () => {
  it('emits SSR raw-string fast paths for intrinsic JSX trees', async () => {
    const resultCode = await compileSSRModule(
      `const view = <section class="card" data-id={id}><h1>{title}</h1><p>hello</p></section>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('ssrRaw(')
    expect(resultCode).toContain('renderSSRAttr as _renderSSRAttr')
    expect(resultCode).toContain('renderSSRValue as _renderSSRValue')
    expect(resultCode).toContain('_renderSSRAttr("data-id", id)')
    expect(resultCode).not.toContain('jsxDEV("section"')
  })

  it('keeps event-bound elements on the generic JSX path', async () => {
    const resultCode = await compileSSRModule(
      `const view = <button onClick={handleClick}>save</button>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('jsxDEV("button"')
    expect(resultCode).not.toContain('ssrRaw(')
  })

  it('keeps action forms on the generic JSX path so SSR can inject csrf inputs', async () => {
    const resultCode = await compileSSRModule(
      `const view = <form data-e-action-form={actionId} method="post"><button>save</button></form>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('jsxDEV("form"')
    expect(resultCode).not.toContain('_ssrRaw("<form')
  })

  it('passes JSX fragment children through component props', async () => {
    const resultCode = await compileSSRModule(
      `const view = <Layout><><span>a</span>{value}</></Layout>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('"children": [')
    expect(resultCode).toContain('_ssrRaw("<span>a</span>")')
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

  it('accepts raw TSX without a JS-side preprocess step', async () => {
    const resultCode = await compileSSRModule(
      `
        type Props = { title: string }
        const view = (props: Props) => <section>{props.title}</section>
      `,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('const view = (props) =>')
    expect(resultCode).not.toContain('type Props')
    expect(resultCode).not.toContain(': Props')
  })

  it('compiles nested JSX that appears inside expression callbacks', async () => {
    const resultCode = await compileSSRModule(
      `const view = <For fn={(todo, i) => <li key={i}>{todo}</li>} />`,
      'mod.test.tsx',
    )

    expect(resultCode).not.toContain('=> <li')
    expect(resultCode).toMatch(
      /_ssrRaw\("<li>" \+ _renderSSRValue\(todo\) \+ "<\/li>"\)|_jsxDEV\("li"/,
    )
  })

  it('lowers ternaries with JSX branches to Show components', async () => {
    const resultCode = await compileSSRModule(
      `const view = <div>{flag ? <span>on</span> : <span>off</span>}</div>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).toContain('_jsxDEV(__eclipsaShow')
    expect(resultCode).toContain('"when": flag')
    expect(resultCode).not.toContain('flag ? <span>')
  })

  it('lowers && expressions with JSX branches to Show components', async () => {
    const resultCode = await compileSSRModule(
      `const view = <head>{flag && <><script src="/eruda.js"></script><script>eruda.init()</script></>}</head>`,
      'mod.test.tsx',
    )

    expect(resultCode).not.toContain('<>')
    expect(resultCode).toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).toContain('_jsxDEV(__eclipsaShow')
    expect(resultCode).toContain('"fallback": (__e_showValue) => __e_showValue')
    expect(resultCode).toContain('/eruda.js')
    expect(resultCode).toContain('eruda.init()')
  })

  it('lowers || expressions with JSX branches to Show components', async () => {
    const resultCode = await compileSSRModule(
      `const view = <div>{label || <span>empty</span>}</div>`,
      'mod.test.tsx',
    )

    expect(resultCode).toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).toContain('_jsxDEV(__eclipsaShow')
    expect(resultCode).toContain('"children": (__e_showValue) => __e_showValue')
    expect(resultCode).toContain('"fallback": (__e_showValue) => _ssrRaw("<span>empty</span>")')
  })

  it('lowers direct JSX map expressions to raw string joins when the parent is on the fast path', async () => {
    const resultCode = await compileSSRModule(
      `const view = <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>`,
      'mod.test.tsx',
    )

    expect(resultCode).not.toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).not.toContain('_jsxDEV(__eclipsaFor')
    expect(resultCode).toContain('renderSSRMap as _renderSSRMap')
    expect(resultCode).toContain(
      '_renderSSRMap(items, (item, i) => "<li>" + _renderSSRValue(item) + "</li>")',
    )
    expect(resultCode).not.toContain('=> <li')
  })

  it('lowers parenthesized JSX map callbacks to raw string joins when the parent is on the fast path', async () => {
    const resultCode = await compileSSRModule(
      `const view = <div>{items.map((item) => (<article key={item.id}><h3>{item.name}</h3></article>))}</div>`,
      'mod.test.tsx',
    )

    expect(resultCode).not.toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).not.toContain('_jsxDEV(__eclipsaFor')
    expect(resultCode).toContain('_renderSSRMap(items, (item) =>')
    expect(resultCode).toContain('"<article>"')
    expect(resultCode).toContain('_renderSSRValue(item.name)')
    expect(resultCode).toContain('"</article>")')
  })

  it('does not lower non-JSX map expressions to For components', async () => {
    const resultCode = await compileSSRModule(
      `const view = <div>{items.map((item) => item.toString())}</div>`,
      'mod.test.tsx',
    )

    expect(resultCode).not.toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).not.toContain('_jsxDEV(__eclipsaFor')
    expect(resultCode).toContain('items.map((item) => item.toString())')
  })

  it('does not lower map expressions inside component children', async () => {
    const resultCode = await compileSSRModule(
      `const view = <Layout>{items.map((item, i) => <li key={i}>{item}</li>)}</Layout>`,
      'mod.test.tsx',
    )

    expect(resultCode).not.toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).not.toContain('_jsxDEV(__eclipsaFor')
    expect(resultCode).toContain(
      'items.map((item, i) => _ssrRaw("<li>" + _renderSSRValue(item) + "</li>"))',
    )
    expect(resultCode).not.toContain(' key=')
  })

  it('does not lower logical JSX expressions inside component children', async () => {
    const resultCode = await compileSSRModule(
      `const view = <Layout>{flag && <span>ready</span>}</Layout>`,
      'mod.test.tsx',
    )

    expect(resultCode).not.toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).not.toContain('_jsxDEV(__eclipsaShow')
    expect(resultCode).toContain('flag && _ssrRaw("<span>ready</span>")')
  })
})
