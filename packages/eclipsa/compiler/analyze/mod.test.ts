import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { analyzeModule } from './mod.ts'

describe('analyzeModule()', () => {
  it('matches the stored analyze snapshots', async () => {
    const analyzeDir = path.dirname(fileURLToPath(import.meta.url))
    const testsDir = path.join(analyzeDir, 'tests')
    const entries = await fs.readdir(testsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }

      const filePath = path.join(testsDir, entry.name)
      const tsx = await fs.readFile(filePath, 'utf8')
      const analyzed = await analyzeModule(tsx)

      if (!analyzed) {
        continue
      }

      const sections = [
        `// ================= ENTRY (${entry.name}) ==\n${tsx}`,
        `// ================= analyzed ==\n${analyzed.code}`,
      ]

      for (const [name, symbol] of analyzed.symbols) {
        sections.push(`// ================= ${name} (${symbol.kind}) ==\n${symbol.code}`)
      }

      const snapshotPath = path.join(analyzeDir, 'snapshots', `${entry.name}.snap`)
      const snapshot = await fs.readFile(snapshotPath, 'utf8')
      expect(`${sections.join('\n\n')}\n`).toBe(snapshot)
    }
  }, 15_000)

  it('rejects useSignal() outside a component', async () => {
    await expect(
      analyzeModule(`
        import { useSignal } from "eclipsa";
        const count = useSignal(0);
        export default count;
      `),
    ).rejects.toThrowError(
      'useSignal() can only be used while rendering a component and must be called at the top level of the component body (not inside nested functions).',
    )
  })

  it('accepts useAtom() from the atom subpath inside a component', async () => {
    const analyzed = await analyzeModule(`
      import { atom, useAtom } from "eclipsa/atom";

      const countAtom = atom(0);

      export default () => {
        const count = useAtom(countAtom);
        return <button>{count.value}</button>;
      };
    `)

    expect(analyzed?.code).toContain('__eclipsaComponent')
  })

  it('rejects useAtom() outside a component', async () => {
    await expect(
      analyzeModule(`
        import { atom, useAtom } from "eclipsa/atom";
        const countAtom = atom(0);
        const count = useAtom(countAtom);
        export default count;
      `),
    ).rejects.toThrowError(
      'useAtom() can only be used while rendering a component and must be called at the top level of the component body (not inside nested functions).',
    )
  })

  it('accepts useSignal() inside a top-level custom hook', async () => {
    const analyzed = await analyzeModule(`
      import { useSignal } from "eclipsa";

      const useCounter = () => {
        const count = useSignal(0);
        return count;
      };

      export default () => {
        const count = useCounter();
        return <button>{count.value}</button>;
      };
    `)

    expect(analyzed?.code).toContain('__eclipsaComponent')
    expect(analyzed?.code).toContain('const useCounter = () => {')
  })

  it('rejects early-return components', async () => {
    await expect(
      analyzeModule(`
        import { useSignal } from "eclipsa";

        export const Counter = () => {
          const count = useSignal(0);
          if (count.value > 0) {
            return <button>positive</button>;
          }
          return <button>zero</button>;
        };
      `),
    ).rejects.toThrowError(
      'must use a single final return statement. Early returns are not supported.',
    )
  })

  it('marks compiled components as optimized roots', async () => {
    const analyzed = await analyzeModule(`
      export default () => <button>ready</button>;
    `)

    expect(analyzed.code).toContain('undefined, { optimizedRoot: true }')
  })

  it('marks compiled components as optimized roots without breaking trailing commas', async () => {
    const analyzed = await analyzeModule(`
      import { __eclipsaComponent } from "eclipsa/internal";

      export const Probe = __eclipsaComponent(
        () => <button>ready</button>,
        "@@probe",
        () => [],
      );
    `)

    expect(analyzed.code).toContain('()=>[], undefined, { optimizedRoot: true }')
    expect(analyzed.code).not.toContain('() => [],\n, { optimizedRoot: true }')
  })

  it('appends optimized root options after projection slot metadata', async () => {
    const analyzed = await analyzeModule(`
      export const Probe = (props) => <div>{props.children}</div>;
    `)

    expect(analyzed.code).toContain('{ children: 1 }, { optimizedRoot: true }')
  })

  it('annotates direct projection slot props on component metadata', async () => {
    const analyzed = await analyzeModule(`
      export const Probe = (props) => (
        <section>
          <div>{props.aa}</div>
          <div>{props.children}</div>
          <span>{props.aa}</span>
        </section>
      );
    `)

    expect(analyzed?.code).toContain('__eclipsaComponent')
    expect(analyzed?.code).toContain('aa: 2')
    expect(analyzed?.code).toContain('children: 1')
  })

  it('rejects non-direct uses of projection slot props', async () => {
    await expect(
      analyzeModule(`
        export default (props) => {
          const forwarded = props.children;
          return <div>{props.children}</div>;
        };
      `),
    ).rejects.toThrowError(
      'Projection slot prop "children" must be rendered directly as {props.children} inside JSX.',
    )
  })

  it('does not mark intrinsic attribute props as projection slots', async () => {
    const analyzed = await analyzeModule(`
      export const Logo = (props) => (
        <svg class={props.class}>
          <path />
        </svg>
      );
    `)

    expect(analyzed?.code).toContain('__eclipsaComponent')
    expect(analyzed?.code).not.toContain('{ class: 1 }')
  })

  it('auto-detects PascalCase component declarations on the Rust analyze path', async () => {
    const analyzed = await analyzeModule(`
      import { onVisible as visible } from "eclipsa";
      export const Header = () => {
        visible(() => console.log("ready"));
        return <h1>ready</h1>;
      };
    `)

    expect(analyzed.code).toContain('__eclipsaComponent')
    expect(analyzed.code).toContain('__eclipsaLazy')
    expect([...analyzed.hmrManifest.components.keys()]).toContain('component:Header')
  })

  it('does not capture type-only component signature references', async () => {
    const analyzed = await analyzeModule(`
      type Props = {
        href: string;
      };

      export const Link = (_props: Props) => <a href="/ready">ready</a>;
    `)

    expect(analyzed?.code).toContain('__eclipsaComponent')
    expect(analyzed?.code).toContain('()=>[]')
    expect(analyzed?.code).not.toContain('()=>[Props]')
  })

  it('analyzes the built-in Link component without capturing top-level helpers', async () => {
    const analyzeDir = path.dirname(fileURLToPath(import.meta.url))
    const routerPath = path.resolve(analyzeDir, '../../core/router.tsx')
    const tsx = await fs.readFile(routerPath, 'utf8')

    const analyzed = await analyzeModule(tsx)

    expect(analyzed?.code).toContain('__eclipsaComponent')
    expect(analyzed?.code).not.toContain('()=>[LinkProps]')
    expect([...(analyzed?.hmrManifest.components.keys() ?? [])]).toContain('component:Link')
  })

  it('preserves async generator actions as resumable action symbols', async () => {
    const analyzed = await analyzeModule(`
      import { action } from "eclipsa";

      export const useCounterStream = action(async function* () {
        yield 0;
        yield 1;
      });
    `)

    expect(analyzed?.code).toContain('__eclipsaAction')
    const actionSymbols = [...(analyzed?.symbols.values() ?? [])].filter(
      (symbol) => symbol.kind === 'action',
    )
    expect(actionSymbols).toHaveLength(1)
    expect(actionSymbols[0]?.code).toContain('async function*')
  })

  it('inlines same-file top-level component helpers into resumable symbols', async () => {
    const analyzed = await analyzeModule(`
      const title = "ready";
      const Item = () => <span>{title}</span>;

      export default () => <Item />;
    `)

    const component = [...analyzed.symbols.values()].find(
      (symbol) => symbol.kind === 'component' && symbol.code.includes('return <Item />;'),
    )

    expect(component?.code).toContain('export default (__scope) => {')
    expect(component?.code).toContain(
      'const Item = __eclipsaComponent(() => <span>{__scope[0]}</span>',
    )
    expect(component?.code).toContain('return <Item />;')
  })

  it('analyzes the docs slug layout when it references a same-file helper component', async () => {
    const analyzeDir = path.dirname(fileURLToPath(import.meta.url))
    const layoutPath = path.resolve(analyzeDir, '../../../../docs/app/docs/[...slug]/+layout.tsx')
    const tsx = await fs.readFile(layoutPath, 'utf8')

    const analyzed = await analyzeModule(tsx, layoutPath)

    expect(analyzed?.code).toContain('__eclipsaComponent')
    expect([...(analyzed?.hmrManifest.components.keys() ?? [])]).toContain('component:default')
  })

  it('emits symbol modules that accept __scope as the first runtime argument', async () => {
    const analyzed = await analyzeModule(`
      import { onVisible, useWatch } from "eclipsa";

      export default (props) => {
        const count = props.count;
        const handler = async (event) => {
          console.log(count, event.type);
        };

        onVisible(() => {
          console.log(count);
        });

        useWatch(() => {
          console.log(count);
        });

        return <button onClick={(event) => handler(event)}>{count}</button>;
      };
    `)

    const symbols = [...analyzed.symbols.values()]
    const component = symbols.find((symbol) => symbol.kind === 'component')
    const event = symbols.find((symbol) => symbol.kind === 'event')
    const lazySymbols = symbols.filter((symbol) => symbol.kind === 'lazy')
    const watch = symbols.find((symbol) => symbol.kind === 'watch')

    expect(component?.code).toMatch(/export default \(__scope, props\) =>/)
    expect(event?.code).toMatch(/export default \(__scope, event\) =>/)
    expect(
      lazySymbols.some((symbol) =>
        /export default(?: async)? \(__scope, event\) =>/.test(symbol.code),
      ),
    ).toBe(true)
    expect(lazySymbols.some((symbol) => /export default \(__scope\) =>/.test(symbol.code))).toBe(
      true,
    )
    expect(watch?.code).toMatch(/export default \(__scope\) =>/)
  })

  it('auto-wraps local async handlers so plain event props can reference them directly', async () => {
    const analyzed = await analyzeModule(`
      export default () => {
        const ready = "ready";
        const handler = async () => {
          console.log(ready);
        };

        return <button onClick={handler}>{ready}</button>;
      };
    `)

    expect(analyzed.code).toContain('__eclipsaLazy')
    expect(analyzed.code).toContain('const handler = __eclipsaLazy(')
    expect(analyzed.code).toContain('return <button onClick={handler}>{ready}</button>;')
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'lazy')).toHaveLength(
      1,
    )
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'event')).toHaveLength(
      0,
    )
  })

  it('auto-wraps local sync handlers so plain event props can reference them directly', async () => {
    const analyzed = await analyzeModule(`
      export default () => {
        const ready = "ready";
        const handler = () => {
          console.log(ready);
        };

        return <button onClick={handler}>{ready}</button>;
      };
    `)

    expect(analyzed.code).toContain('__eclipsaLazy')
    expect(analyzed.code).toContain('const handler = __eclipsaLazy(')
    expect(analyzed.code).toContain('return <button onClick={handler}>{ready}</button>;')
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'lazy')).toHaveLength(
      1,
    )
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'event')).toHaveLength(
      0,
    )
  })

  it('auto-wraps local function declarations when plain event props reference them directly', async () => {
    const analyzed = await analyzeModule(`
      export default () => {
        const ready = "ready";

        function handler() {
          console.log(ready);
        }

        return <button onClick={handler}>{ready}</button>;
      };
    `)

    expect(analyzed.code).toContain('__eclipsaLazy')
    expect(analyzed.code).toContain('return <button onClick={__eclipsaLazy(')
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'lazy')).toHaveLength(
      1,
    )
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'event')).toHaveLength(
      0,
    )
  })

  it('auto-wraps returned hook methods so resumable callers can capture the API object', async () => {
    const analyzed = await analyzeModule(`
      import { useSignal, useWatch } from "eclipsa";

      const useCounterApi = () => {
        const count = useSignal(0);
        const increment = () => {
          count.value += 1;
        };

        return {
          increment,
        };
      };

      export default () => {
        const api = useCounterApi();

        useWatch(() => {
          api.increment();
        });

        return <button>{'ready'}</button>;
      };
    `)

    expect(analyzed.code).toContain('return {\n          increment: __eclipsaLazy(')
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'lazy')).toHaveLength(
      1,
    )
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'watch')).toHaveLength(
      1,
    )
  })

  it('rejects plain event handlers that are not component-local functions', async () => {
    await expect(
      analyzeModule(`
        const handler = () => {
          console.log("ready");
        };

        export default () => <button onClick={handler}>ready</button>;
      `),
    ).rejects.toThrowError(
      'Unsupported plain event handler "handler" for "onClick". Use an inline function, a component-local function declaration, or a component-local const function value.',
    )
  })

  it('rejects unsupported plain event handler expressions', async () => {
    await expect(
      analyzeModule(`
        export default (props) => <button onClick={props.onClick}>ready</button>;
      `),
    ).rejects.toThrowError(
      'Unsupported plain event handler for "onClick". Use an inline function, a component-local function declaration, or a component-local const function value.',
    )
  })

  it('explains how to fix mutable props captures in resumable callbacks', async () => {
    await expect(
      analyzeModule(`
        import { useWatch } from "eclipsa";

        export default (props) => {
          useWatch(() => {
            console.log(props.label);
          });

          return <div>{props.label}</div>;
        };
      `),
    ).rejects.toThrowError(
      'Unsupported resumable capture "props". Mutable locals are not resumable. Read the needed value into a const before the resumable callback (for example, `const value = props.foo`) or store runtime state in a signal/atom.',
    )
  })

  it('rejects useWatch() when the first argument is not a function expression', async () => {
    await expect(
      analyzeModule(`
        import { useWatch } from "eclipsa";

        export default () => {
          useWatch(1);
          return <div>ok</div>;
        };
      `),
    ).rejects.toThrowError('useWatch() expects a function expression as the first argument.')
  })

  it('keeps same-file helper functions that capture top-level constants inside the resumable scope', async () => {
    const analyzed = await analyzeModule(`
      import { useWatch } from "eclipsa";

      const threshold = 0.5;
      const pick = (value) => value > threshold ? 1 : 0;

      export default () => {
        useWatch(() => {
          pick(1);
        });

        return <div>ok</div>;
      };
    `)

    const watch = [...analyzed.symbols.values()].find((symbol) => symbol.kind === 'watch')
    expect(watch?.code).toContain('const pick = (value) => value > __scope[0] ? 1 : 0;')
    expect(watch?.code).toContain('export default (__scope) => {')
    expect(watch?.code).toContain('pick(1);')
  })

  it('keeps concrete local symbol ids in emitted component code while preserving HMR metadata', async () => {
    const analyzed = await analyzeModule(`
      import { onVisible } from "eclipsa";

      export default () => {
        onVisible(() => {
          console.log("ready");
        });

        return <div>ready</div>;
      };
    `)

    const component = [...analyzed.symbols.values()].find((symbol) => symbol.kind === 'component')
    const lazy = [...analyzed.symbols.values()].find((symbol) => symbol.kind === 'lazy')
    const hmrLazy = [...analyzed.hmrManifest.symbols.values()].find(
      (symbol) => symbol.kind === 'lazy',
    )

    expect(component?.code).toContain(`__eclipsaLazy("${lazy?.id}"`)
    expect(component?.code).not.toContain(hmrLazy?.hmrKey ?? 'component:default:lazy:slot')
    expect(hmrLazy?.hmrKey).toBe('component:default:lazy:slot')
  })

  it('collects prewrapped component helpers with explicit symbol ids', async () => {
    const analyzed = await analyzeModule(`
      import { __eclipsaComponent } from "eclipsa/internal";
      const theme = "ready";

      export const MotionRenderer = __eclipsaComponent(
        (props: { label: string }) => <div>{theme}{props.label}</div>,
        "@pkg:motion",
        () => [],
      );
    `)

    expect(analyzed.symbols.has('@pkg:motion')).toBe(true)
    expect(analyzed.symbols.get('@pkg:motion')?.kind).toBe('component')
    expect(analyzed.symbols.get('@pkg:motion')?.captures).toEqual(['theme'])
    expect(analyzed.code).toContain('()=>[theme]')
  })

  it('treats top-level eclipsifyReact() bindings as resumable components', async () => {
    const analyzed = await analyzeModule(`
      import { eclipsifyReact } from "@eclipsa/react";
      import { createElement } from "react";

      const ReactView = (props: { title: string; children?: unknown }) =>
        createElement("section", null, [
          createElement("h1", { key: "title" }, props.title),
          props.children,
        ]);

      export const ReactIsland = eclipsifyReact(ReactView, { slots: ["children"] });
    `)

    expect(analyzed.code).toContain('__eclipsaComponent(eclipsifyReact(')
    expect(analyzed.code).toContain('{ external: { kind: "react", slots: ["children"] } }')
    expect([...analyzed.hmrManifest.components.keys()]).toContain('component:ReactIsland')

    const component = [...analyzed.symbols.values()].find(
      (symbol) => symbol.kind === 'component' && symbol.code.includes('const __e_component ='),
    )
    expect(component?.code).toContain('import { eclipsifyReact } from "@eclipsa/react";')
    expect(component?.code).toContain('const __e_component = eclipsifyReact(ReactView')
  })

  it('treats top-level eclipsifyVue() bindings as resumable components', async () => {
    const analyzed = await analyzeModule(`
      import { eclipsifyVue } from "@eclipsa/vue";
      import { defineComponent, h } from "vue";

      const VueView = defineComponent({
        props: {
          title: String,
        },
        setup(props, { slots }) {
          return () => h("section", null, [
            h("h1", null, props.title),
            slots.default?.(),
          ]);
        },
      });

      export const VueIsland = eclipsifyVue(VueView);
    `)

    expect(analyzed.code).toContain('__eclipsaComponent(eclipsifyVue(')
    expect(analyzed.code).toContain('{ external: { kind: "vue", slots: ["children"] } }')
    expect([...analyzed.hmrManifest.components.keys()]).toContain('component:VueIsland')
  })

  it('rejects unsupported eclipsify*() placements and dynamic targets', async () => {
    await expect(
      analyzeModule(`
        import { eclipsifyReact } from "@eclipsa/react";
        import { createElement } from "react";

        export default () => {
          const View = () => createElement("div", null, "ready");
          const Island = eclipsifyReact(View);
          return <Island />;
        };
      `),
    ).rejects.toThrowError('eclipsifyReact() must be assigned to a top-level PascalCase binding.')

    await expect(
      analyzeModule(`
        import { eclipsifyVue } from "@eclipsa/vue";

        const registry = {
          Primary: {},
        };
        const key = "Primary";
        export const VueIsland = eclipsifyVue(registry[key]);
      `),
    ).rejects.toThrowError(
      'eclipsify*() requires a static component reference as the first argument. Dynamic targets are not supported.',
    )
  })
})
