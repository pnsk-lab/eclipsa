import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { analyzeModule } from '../analyze/mod.ts'
import { compileClientModule } from './mod.ts'

describe('compileClientModule', () => {
  it('injects only the client runtime helpers used by generated code', async () => {
    const resultCode = await compileClientModule(
      `<div a="a">
        <Header a="a" />
      </div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('from "eclipsa/runtime/dom-compiled"')
    expect(resultCode).not.toContain('from "eclipsa/dev-client"')
    expect(resultCode).toContain('createTemplate as _createTemplate')
    expect(resultCode).toContain('createComponent as _createComponent')
    expect(resultCode).not.toContain('attrStatic as _attrStatic')
    expect(resultCode).not.toContain('from "eclipsa/runtime/event"')
  })

  it('omits the client runtime import when no client helper is generated', async () => {
    const resultCode = await compileClientModule('const value = 1; export { value }', 'mod.ts', {
      hmr: false,
    })

    expect(resultCode).not.toContain('from "eclipsa/runtime/')
  })

  it('rewrites core runtime imports to narrower subpath exports', async () => {
    const resultCode = await compileClientModule(
      `
        import { useSignal, For, Show, Link } from 'eclipsa'
        const value = useSignal
        export { value, For, Show, Link }
      `,
      'mod.ts',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('import { Link } from "eclipsa";')
    expect(resultCode).toContain('import { useSignal } from "eclipsa/runtime/reactive";')
    expect(resultCode).toContain('import { For, Show } from "eclipsa/runtime/dom-compiled";')
    expect(resultCode).not.toContain('import { useSignal, For, Show, Link } from "eclipsa";')
  })

  it('rewrites compiled hydrate and metadata imports to light client entries', async () => {
    const resultCode = await compileClientModule(
      `
        import { hydrate } from 'eclipsa/client'
        import { __eclipsaComponent, __eclipsaEvent, __eclipsaAction } from 'eclipsa/internal'
        hydrate(__eclipsaComponent(() => <button />, 'button', []), document.body)
        export const click = __eclipsaEvent.__0('click', 'symbol')
        export const action = __eclipsaAction
      `,
      'mod.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('import { hydrate } from "eclipsa/runtime/hydrate";')
    expect(resultCode).toContain(
      'import { __eclipsaComponent, __eclipsaEvent } from "eclipsa/meta";',
    )
    expect(resultCode).toContain('import { __eclipsaAction } from "eclipsa/internal";')
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
    const childrenInsertIndex = resultCode.indexOf('let _textValue0 = props.children')
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

    expect(resultCode).not.toContain('_materializeTemplateRefs(_cloned,')
    expect(resultCode).toContain('let _ref0 = _cloned.firstChild;')
    expect(resultCode).toContain('let _ref1 = _cloned.childNodes[2];')
    expect(resultCode).toContain('let _ref2 = _ref1.nextSibling;')
    expect(resultCode).toContain('let _ref3 = _ref1.childNodes[1];')
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
      '_classSignalEqualsStatic(_cloned, selected, rowId, "danger", "");',
    )
    expect(resultCode).not.toContain('_className(_cloned')
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

  it('routes packed resumable event bindings through the specialized direct event helper', async () => {
    const analyzed = await analyzeModule(`
      export default () => {
        const rowId = 1;
        const selected = { value: null };
        return <button onClick={() => [selected, rowId]}>Run</button>;
      };
    `)

    const resultCode = await compileClientModule(analyzed.code, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).toContain('_eventStatic.__2(')
    expect(resultCode).toContain('eventStatic as _eventStatic')
    expect(resultCode).toContain('from "eclipsa/runtime/event"')
    expect(resultCode).not.toContain('_eventStatic(_cloned, "click", __eclipsaEvent.__2(')
  })

  it('routes parenthesized packed resumable event bindings through the specialized direct event helper', async () => {
    const resultCode = await compileClientModule(
      `
        <button onClick={(__eclipsaEvent.__2("click", "symbol-click", selected, rowId))}>
          Run
        </button>
      `,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('_eventStatic.__2(')
    expect(resultCode).not.toContain(
      '_eventStatic(_cloned, "click", (__eclipsaEvent.__2("click", "symbol-click", selected, rowId)));',
    )
  })

  it('routes aliased packed resumable event bindings inside reactive row callbacks through the specialized direct event helper', async () => {
    const resultCode = await compileClientModule(
      `
        <For
          arr={rows.value}
          fn={(row) => {
            const rowId = row.value.id
            const handleSelect = __eclipsaEvent.__2("click", "symbol-click", selected, rowId)
            return <button onClick={handleSelect}>{row.value.label}</button>
          }}
          key={(row) => row.id}
        />
      `,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('_eventStatic.__2(')
    expect(resultCode).toContain('"symbol-click", selected, rowId')
    expect(resultCode).not.toContain('_eventStatic(_cloned, "click", handleSelect);')
    expect(resultCode).not.toContain('const handleSelect = __eclipsaEvent.__2(')
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
    expect(resultCode).toContain('__e_for: true')
    expect(resultCode).toContain('const __eclipsaTemplate0 = _createTemplate("<li> </li>");')
    expect(resultCode).toMatch(/"?reactiveRows"?: true/)
    expect(resultCode).toMatch(/"?domOnlyRows"?: true/)
    expect(resultCode).toContain('_textNodeSignalValue(todo, _ref0);')
    expect(resultCode).not.toContain('_attr(_cloned, "key"')
  })

  it('emits one-shot inserts for expressions that do not read signals directly', async () => {
    const resultCode = await compileClientModule(`<div>{row.label}</div>`, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).toContain('let _textValue0 = row.label;')
    expect(resultCode).not.toContain('_insert(() => row.label')
  })

  it('omits comment markers for intrinsic elements that only contain one static runtime child', async () => {
    const resultCode = await compileClientModule(`<a>{label}</a>`, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).toContain('const __eclipsaTemplate0 = _createTemplate("<a></a>");')
    expect(resultCode).not.toContain('let _textValue0 = label;')
    expect(resultCode).toContain('typeof label')
    expect(resultCode).not.toContain('<!-- 0 -->')
  })

  it('keeps signal-backed text expressions on the fixed-signal text path', async () => {
    const resultCode = await compileClientModule(`<div>{count.value}</div>`, 'mod.test.tsx', {
      hmr: false,
    })

    expect(resultCode).toContain('const __eclipsaTemplate0 = _createTemplate("<div> </div>");')
    expect(resultCode).toContain('_textNodeSignalValue(count, _ref0);')
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

    expect(resultCode).toMatch(/_insertFor\(\{\s*arrSignal: rows/)
    expect(resultCode).toMatch(/get "arr"\(\)\s*\{\s*return rows\.value;\s*\}/)
    expect(resultCode).toContain('keyMember: "id"')
    expect(resultCode).toContain('"directRowUpdates": true')
    expect(resultCode).not.toContain('_createComponent(For')
    expect(resultCode).not.toContain('_insertStatic(({ __e_for: true')
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
      resultCode.match(/const __eclipsaTemplate\d+ = _createTemplate\("<span> <\/span>"\);/g),
    ).toHaveLength(1)
  })

  it('lowers eligible explicit For callbacks onto reactive row signals without changing row syntax', async () => {
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

    expect(resultCode).toMatch(/"?reactiveRows"?: true/)
    expect(resultCode).toMatch(/"?domOnlyRows"?: true/)
    expect(resultCode).toContain('directRowUpdates: true')
    expect(resultCode).toContain('reactiveIndex: false')
    expect(resultCode).toContain('const rowId = row.value.id;')
    expect(resultCode).not.toContain('let _textValue0 = rowId;')
    expect(resultCode).toContain('typeof rowId')
    expect(resultCode).toContain('_textNodeSignalMemberStatic(row, "label"')
    expect(resultCode).not.toContain('<!-- 1,0,0 -->')
    expect(resultCode).toContain('_classSignalEqualsStatic(')
    expect(resultCode).toContain('_eventStatic(')
    expect(resultCode).toContain('"click", handleClick')
    expect(resultCode).toContain('keyMember: "id"')
    expect(resultCode).not.toContain('"onClick", () => __eclipsaLazy')
  })

  it('keeps lowered For callbacks with nested components on owner-backed rows', async () => {
    const resultCode = await compileClientModule(
      `
        <For
          arr={rows}
          fn={(row) => <li><Widget value={row.label} /></li>}
          key={(row) => row.id}
        />
      `,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toMatch(/"?reactiveRows"?: true/)
    expect(resultCode).toContain('_createComponent(Widget')
    expect(resultCode).not.toMatch(/"?domOnlyRows"?: true/)
  })

  it('preserves explicit reactive row handle usage in For callbacks', async () => {
    const resultCode = await compileClientModule(
      `
        <For
          arr={rows}
          reactiveRows={true}
          fn={(row, i) => <li data-id={row.value.id}>{i.value}:{row.value.label}</li>}
          key={(row) => row.id}
        />
      `,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toMatch(/"?reactiveRows"?: true/)
    expect(resultCode).toContain('row.value.id')
    expect(resultCode).toContain('row.value.label')
    expect(resultCode).toContain('i.value')
    expect(resultCode).not.toContain('row.value.value')
    expect(resultCode).not.toContain('i.value.value')
  })

  it('passes signal handles to compiler-lowered For inserts when the array prop reads signal.value', async () => {
    const resultCode = await compileClientModule(
      `
        <For
          arr={rows.value}
          fn={(row) => <li>{row.label}</li>}
          key={(row) => row.id}
        />
      `,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain('arrSignal: rows')
    expect(resultCode).toMatch(/"?domOnlyRows"?: true/)
  })

  it('omits comment markers for tracked single-child text insertions inside nested elements', async () => {
    const resultCode = await compileClientModule(
      `<tr><td>{label.value}</td><td><a>{label.value}</a></td></tr>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).toContain(
      'const __eclipsaTemplate0 = _createTemplate("<tr><td> </td><td><a> </a></td></tr>");',
    )
    expect(resultCode).toContain('_textNodeSignalValue(label, _ref2);')
    expect(resultCode).toContain('_textNodeSignalValue(label, _ref4);')
    expect(resultCode).not.toContain('<!-- 0,0 -->')
    expect(resultCode).not.toContain('<!-- 1,0,0 -->')
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
    expect(resultCode).not.toContain('domOnlyRows: true')
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
    expect(resultCode).toContain('_textNodeSignalValue(item, _ref0);')
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

    expect(resultCode).not.toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).toContain('__e_show: true')
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

    expect(resultCode).not.toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).toContain('__e_show: true')
    expect(resultCode).toContain('fallback: (__e_showValue) => __e_showValue')
    expect(resultCode).toContain('const __eclipsaTemplate0 = _createTemplate("<span></span>");')
    expect(resultCode).not.toContain('let _textValue0 = count;')
    expect(resultCode).toContain('typeof count')
  })

  it('lowers || expressions with JSX branches to Show components', async () => {
    const resultCode = await compileClientModule(
      `<div>{label || <span>empty</span>}</div>`,
      'mod.test.tsx',
      {
        hmr: false,
      },
    )

    expect(resultCode).not.toContain('import { Show as __eclipsaShow } from "eclipsa";')
    expect(resultCode).toContain('__e_show: true')
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

    expect(resultCode).not.toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).toContain('__e_for: true')
    expect(resultCode).toContain('arr: items')
    expect(resultCode).not.toContain('keyMember')
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

    expect(resultCode).not.toContain('import { For as __eclipsaFor } from "eclipsa";')
    expect(resultCode).toContain('__e_for: true')
    expect(resultCode).toMatch(/key:\s*\(?item\)?\s*=>\s*item\.id/)
    expect(resultCode).toContain('keyMember: "id"')
    expect(resultCode).toContain('domOnlyRows: true')
    expect(resultCode).toContain('directRowUpdates: true')
    expect(resultCode).not.toContain('_attr(_cloned, "key"')
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
