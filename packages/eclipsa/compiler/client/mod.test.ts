import { describe, expect, it } from 'vitest'
import { compileClientModule } from './mod.ts'

describe('compileClientModule', () => {
  it('injects the shared client runtime imports', async () => {
    const resultCode = await compileClientModule(
      `<div a="a">
        <Header a="a" />
      </div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('from "eclipsa/client"')
    expect(resultCode).not.toContain('from "eclipsa/dev-client"')
    expect(resultCode).toContain('createTemplate')
    expect(resultCode).toContain('createComponent')
  })

  it('injects HMR helpers only when enabled', async () => {
    const resultCode = await compileClientModule(
      `
                export default () => <div />;
      `,
      'mod.test.tsx',
      {
        hmr: true,
      },
    )

    expect(resultCode).toContain('from "eclipsa/dev-client"')
    expect(resultCode).toContain('initHot')
    expect(resultCode).toContain('defineHotComponent')
    expect(resultCode).toContain('createHotRegistry')
  })

  it('omits HMR helpers when HMR is disabled', async () => {
    const resultCode = await compileClientModule(`<div />`, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).not.toContain('from "eclipsa/dev-client"')
  })

  it('passes component children through props', async () => {
    const resultCode = await compileClientModule(`<Link href="/">Home</Link>`, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).toContain('children')
    expect(resultCode).toContain('Home')
  })

  it('passes JSX fragment children through component props', async () => {
    const resultCode = await compileClientModule(
      `<Layout><><span>a</span>{value}</></Layout>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('children: [')
    expect(resultCode).toContain('<span>a</span>')
    expect(resultCode).toContain('value')
  })

  it('emits standalone component expressions in props without placeholder templates', async () => {
    const resultCode = await compileClientModule(`<Layout aa={<Header />} />`, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).toContain('get "aa"()')
    expect(resultCode).toContain('_createComponent(Header, {})')
    expect(resultCode).not.toContain('_createTemplate("<!--  -->")')
  })

  it('preserves source order between component and expression inserts', async () => {
    const resultCode = await compileClientModule(
      `<div><Header /><main>{props.children}</main></div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    const headerInsertIndex = resultCode.indexOf('_insert(_createComponent(Header')
    const childrenInsertIndex = resultCode.indexOf('_insert(() => props.children')
    expect(headerInsertIndex).toBeGreaterThanOrEqual(0)
    expect(childrenInsertIndex).toBeGreaterThanOrEqual(0)
    expect(headerInsertIndex).toBeLessThan(childrenInsertIndex)
  })

  it('caches sibling node lookups before earlier inserts can shift child indices', async () => {
    const resultCode = await compileClientModule(
      `<div><Header /><p>Shared layout shell updated</p><button>Layout count: {count.value}</button><main>{props.children}</main></div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toMatch(/var __eclipsaNode\d+ = _cloned\.childNodes\[0\];/)
    expect(resultCode).toMatch(/var __eclipsaNode\d+ = _cloned\.childNodes\[2\];/)
    expect(resultCode).toMatch(/var __eclipsaNode\d+ = _cloned\.childNodes\[3\];/)
    expect(resultCode).not.toContain(
      '_insert(() => count.value, _cloned.childNodes[2], _cloned.childNodes[2].childNodes[1]);',
    )
    expect(resultCode).not.toContain(
      '_insert(() => props.children, _cloned.childNodes[3], _cloned.childNodes[3].childNodes[0]);',
    )
  })

  it('normalizes multiline JSX text to match SSR output', async () => {
    const resultCode = await compileClientModule(
      `<label>
        Right
        <input />
      </label>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('<label>Right<input></input></label>')
  })

  it('emits dangerouslySetInnerHTML through runtime attr application', async () => {
    const resultCode = await compileClientModule(
      `<div dangerouslySetInnerHTML="<span>raw</span>" />`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('_attr(')
    expect(resultCode).toContain('"dangerouslySetInnerHTML"')
    expect(resultCode).not.toContain('dangerouslySetInnerHTML="&lt;span&gt;raw&lt;/span&gt;"')
  })

  it('supports namespaced SVG tags and attributes', async () => {
    const resultCode = await compileClientModule(
      `<svg><sodipodi:namedview xml:space="preserve" /></svg>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('<svg><sodipodi:namedview></sodipodi:namedview></svg>')
    expect(resultCode).toContain('"xml:space"')
  })

  it('accepts raw TSX without a JS-side preprocess step', async () => {
    const resultCode = await compileClientModule(
      `
        type Props = { title: string }
        const View = (props: Props) => <section>{props.title}</section>
      `,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('const View = (props) =>')
    expect(resultCode).not.toContain('type Props')
    expect(resultCode).not.toContain(': Props')
  })

  it('compiles nested JSX that appears inside expression callbacks', async () => {
    const resultCode = await compileClientModule(
      `<For fn={(todo, i) => <li key={i}>{todo}</li>} />`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).not.toContain('=> <li')
    expect(resultCode).toContain('_createComponent(For')
    expect(resultCode).toContain('<li><!-- 0 --></li>')
  })
})
