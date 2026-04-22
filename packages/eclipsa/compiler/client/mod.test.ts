import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { analyzeModule } from '../analyze/mod.ts'
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

    const headerInsertIndex = resultCode.indexOf('_insertStatic(_createComponent(Header')
    const childrenInsertIndex = resultCode.indexOf('_insertElementStatic(props.children')
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

    expect(resultCode).toMatch(/var __eclipsaNode\d+ = _cloned\.firstChild;/)
    expect(resultCode).toMatch(/var __eclipsaNode\d+ = _cloned\.childNodes\[2\];/)
    expect(resultCode).toMatch(/var __eclipsaNode\d+ = __eclipsaNode\d+\.nextSibling;/)
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

  it('embeds static intrinsic attributes into the template html', async () => {
    const resultCode = await compileClientModule(
      `<div class="card" data-testid="probe" />`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('<div class=\\"card\\" data-testid=\\"probe\\"></div>')
    expect(resultCode).not.toContain('_attr(_cloned, "class"')
    expect(resultCode).not.toContain('_attr(_cloned, "data-testid"')
  })

  it('keeps dynamic and runtime-only attributes on the runtime attr path', async () => {
    const resultCode = await compileClientModule(
      `<div class="card" data-id={id} dangerouslySetInnerHTML="<span>raw</span>" />`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('<div class=\\"card\\"></div>')
    expect(resultCode).not.toContain('_attr(_cloned, "class"')
    expect(resultCode).toContain('_attrStatic(_cloned, "data-id", id);')
    expect(resultCode).toContain(
      '_attrStatic(_cloned, "dangerouslySetInnerHTML", "<span>raw</span>");',
    )
  })

  it('routes tracked class bindings through the specialized class helper', async () => {
    const resultCode = await compileClientModule(
      `<div class={selected.value === rowId ? 'danger' : ''} />`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain(
      '_className(_cloned, () => selected.value === rowId ? "danger" : "");',
    )
    expect(resultCode).not.toContain('_attr(_cloned, "class"')
  })

  it('routes static event bindings through the specialized event helper', async () => {
    const resultCode = await compileClientModule(
      `<button onClick={handleClick}>Run</button>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('_eventStatic(_cloned, "click", handleClick);')
    expect(resultCode).not.toContain('_attrStatic(_cloned, "onClick", handleClick);')
  })

  it('routes direct-mode static event bindings through the plain listener helper', async () => {
    const resultCode = await compileClientModule(
      `<button onClick={handleClick}>Run</button>`,
      'mod.test.tsx',
      {
        eventMode: 'direct',
        hmr: false,
      },
    )

    expect(resultCode).toContain('_listenerStatic(_cloned, "click", handleClick);')
    expect(resultCode).not.toContain('_eventStatic(_cloned, "click", handleClick);')
  })

  it('emits dangerouslySetInnerHTML through runtime attr application', async () => {
    const resultCode = await compileClientModule(
      `<div dangerouslySetInnerHTML="<span>raw</span>" />`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('_attrStatic(')
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

    expect(resultCode).toContain(
      '<svg><sodipodi:namedview xml:space=\\"preserve\\"></sodipodi:namedview></svg>',
    )
    expect(resultCode).not.toContain('_attr(')
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
    expect(resultCode).toContain('const __eclipsaTemplate0 = _createTemplate("<li></li>");')
    expect(resultCode).toContain('_insertElementStatic(todo, _cloned);')
  })

  it('emits one-shot inserts for expressions that do not read signals directly', async () => {
    const resultCode = await compileClientModule(`<div>{row.label}</div>`, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).toContain('_insertElementStatic(row.label, _cloned);')
    expect(resultCode).not.toContain('_insert(() => row.label')
  })

  it('omits comment markers for intrinsic elements that only contain one static runtime child', async () => {
    const resultCode = await compileClientModule(`<a>{label}</a>`, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).toContain('const __eclipsaTemplate0 = _createTemplate("<a></a>");')
    expect(resultCode).toContain('_insertElementStatic(label, _cloned);')
    expect(resultCode).not.toContain('<!-- 0 -->')
  })

  it('keeps signal-backed text expressions on the tracked insert path', async () => {
    const resultCode = await compileClientModule(`<div>{count.value}</div>`, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).toContain('_text(() => count.value, _cloned);')
    expect(resultCode).not.toContain('<!-- 0 -->')
  })

  it('keeps signal-backed component props on the tracked insert path', async () => {
    const resultCode = await compileClientModule(
      `<div><Layout value={count.value} flag={enabled.value} /></div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('_insert(() => _createComponent(Layout, {')
    expect(resultCode).toMatch(/get "value"\(\)\s*\{\s*return count\.value;\s*\}/)
    expect(resultCode).toMatch(/get "flag"\(\)\s*\{\s*return enabled\.value;\s*\}/)
    expect(resultCode).not.toContain('_insertStatic(_createComponent(Layout')
  })

  it('keeps dynamic For props on the tracked insert path', async () => {
    const resultCode = await compileClientModule(
      `<div><For arr={rows.value} fn={(row) => <li>{row.label}</li>} key={(row) => row.id} /></div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('_insert(() => _createComponent(For, {')
    expect(resultCode).toMatch(/get "arr"\(\)\s*\{\s*return rows\.value;\s*\}/)
    expect(resultCode).not.toContain('_insertStatic(_createComponent(For')
  })

  it('reuses identical intrinsic templates across multiple lowered JSX roots', async () => {
    const resultCode = await compileClientModule(
      `
        <div>
          {left.map((item) => <span>{item.label}</span>)}
          {right.map((item) => <span>{item.label}</span>)}
        </div>
      `,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(
      resultCode.match(/const __eclipsaTemplate\d+ = _createTemplate\("<span><\/span>"\);/g),
    ).toHaveLength(1)
  })

  it('keeps explicit For callbacks on raw rows unless the user opts into reactive row handles', async () => {
    const resultCode = await compileClientModule(
      `
        <For
          arr={rows}
          fn={(row) => {
            const rowId = row.id
            const label = row.label
            const handleClick = () => select(rowId)

            return (
              <tr class={selected.value === rowId ? 'danger' : ''}>
                <td>{rowId}</td>
                <td><a onClick={handleClick}>{label}</a></td>
              </tr>
            )
          }}
          key={(row) => row.id}
        />
      `,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).not.toContain('"reactiveRows": true')
    expect(resultCode).not.toContain('"reactiveIndex": false')
    expect(resultCode).toContain('const rowId = row.id;')
    expect(resultCode).toContain('const label = row.label;')
    expect(resultCode).toContain('_insertElementStatic(rowId')
    expect(resultCode).toContain('_insertElementStatic(label')
    expect(resultCode).toContain('_className(')
    expect(resultCode).toContain('selected.value === rowId')
    expect(resultCode).toContain('_eventStatic(')
    expect(resultCode).toContain('"click", handleClick')
    expect(resultCode).not.toContain('"onClick", () => __eclipsaLazy')
  })

  it('passes function props to components as stable values', async () => {
    const resultCode = await compileClientModule(
      `<For fn={(todo, i) => <li key={i}>{todo.label}</li>} key={(todo) => todo.id} />`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('"fn": (todo, i) => (() => {')
    expect(resultCode).toContain('"key": (todo) => todo.id')
    expect(resultCode).not.toContain('get "fn"()')
    expect(resultCode).not.toContain('get "key"()')
  })

  it('lowers direct JSX map callbacks onto reactive row signals when callback params are simple identifiers', async () => {
    const resultCode = await compileClientModule(
      `<ul>{items.map((item, i) => <li data-id={item.id}>{i}:{item.label}</li>)}</ul>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('reactiveRows: true')
    expect(resultCode).toContain('_text(() => i.value')
    expect(resultCode).toContain('item.value.label')
    expect(resultCode).toContain('item.value.id')
    expect(resultCode).not.toContain('reactiveIndex: false')
  })

  it('skips reactive row lowering when callback params already access a raw value property', async () => {
    const resultCode = await compileClientModule(
      `<ul>{items.map((item) => <li>{item.value}</li>)}</ul>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).not.toContain('reactiveRows: true')
    expect(resultCode).toContain('item.value')
    expect(resultCode).not.toContain('item.value.value')
  })

  it('lowers ternaries with JSX branches to Show components', async () => {
    const resultCode = await compileClientModule(
      `<div>{flag ? <span>on</span> : <span>off</span>}</div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).toContain('_createComponent(__eclipsaShow')
    expect(resultCode).toContain('when: flag')
    expect(resultCode).not.toContain('flag ? <span>')
  })

  it('lowers && expressions with JSX branches to Show components', async () => {
    const resultCode = await compileClientModule(
      `<div>{count && <span>{count}</span>}</div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).toContain('_createComponent(__eclipsaShow')
    expect(resultCode).toContain('fallback: (__e_showValue) => __e_showValue')
    expect(resultCode).toContain('const __eclipsaTemplate0 = _createTemplate("<span></span>");')
    expect(resultCode).toContain('_insertElementStatic(count, _cloned);')
  })

  it('lowers || expressions with JSX branches to Show components', async () => {
    const resultCode = await compileClientModule(
      `<div>{label || <span>empty</span>}</div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).toContain('_createComponent(__eclipsaShow')
    expect(resultCode).toContain('children: (__e_showValue) => __e_showValue')
    expect(resultCode).toContain('fallback: (__e_showValue) => (() => {')
  })

  it('lowers direct JSX map expressions to For components', async () => {
    const resultCode = await compileClientModule(
      `<ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).toContain('_createComponent(__eclipsaFor')
    expect(resultCode).toContain('arr: items')
    expect(resultCode).not.toContain('=> <li')
  })

  it('passes explicit map keys through lowered For components', async () => {
    const resultCode = await compileClientModule(
      `<ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).toMatch(/key:\s*\(?item\)?\s*=>\s*item\.id/)
  })

  it('does not lower non-JSX map expressions to For components', async () => {
    const resultCode = await compileClientModule(
      `<div>{items.map((item) => item.toString())}</div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).not.toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).not.toContain('_createComponent(__eclipsaFor')
    expect(resultCode).toContain('items.map((item) => item.toString())')
  })

  it('does not lower map expressions inside component children', async () => {
    const resultCode = await compileClientModule(
      `<Layout>{items.map((item, i) => <li key={i}>{item}</li>)}</Layout>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).not.toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).not.toContain('_createComponent(__eclipsaFor')
    expect(resultCode).toContain('items.map((item, i) => (() => {')
  })

  it('does not lower logical JSX expressions inside component children', async () => {
    const resultCode = await compileClientModule(
      `<Layout>{flag && <span>ready</span>}</Layout>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).not.toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).not.toContain('_createComponent(__eclipsaShow')
    expect(resultCode).toContain('flag && (() => {')
  })

  it('does not emit free __scope references before the docs layout default symbol', async () => {
    const clientDir = path.dirname(fileURLToPath(import.meta.url))
    const layoutPath = path.resolve(clientDir, '../../../../docs/app/docs/[...slug]/+layout.tsx')
    const tsx = await fs.readFile(layoutPath, 'utf8')
    const analyzed = await analyzeModule(tsx, layoutPath)
    const component = [...analyzed.symbols.values()].find(
      (symbol) => symbol.kind === 'component' && symbol.code.includes('export default'),
    )

    expect(component).toBeDefined()

    const resultCode = await compileClientModule(component!.code, 'docs-layout-symbol.tsx', {
      hmr: false,
    })
    const defaultMatch = resultCode.match(/export default \(__scope(?:, props)?\)/)
    const defaultIndex = defaultMatch?.index ?? -1

    expect(defaultIndex).toBeGreaterThan(0)
    expect(resultCode.slice(0, defaultIndex)).not.toContain('__scope')
  })
})
