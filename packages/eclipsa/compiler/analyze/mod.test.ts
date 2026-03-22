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
      await expect(`${sections.join('\n\n')}\n`).toMatchFileSnapshot(snapshotPath)
    }
  })

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
    expect([...analyzed?.hmrManifest.components.keys() ?? []]).toContain('component:Link')
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
      lazySymbols.some((symbol) => /export default(?: async)? \(__scope, event\) =>/.test(symbol.code)),
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
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'lazy')).toHaveLength(1)
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'event')).toHaveLength(0)
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
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'lazy')).toHaveLength(1)
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'event')).toHaveLength(0)
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
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'lazy')).toHaveLength(1)
    expect([...analyzed.symbols.values()].filter((symbol) => symbol.kind === 'event')).toHaveLength(0)
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
    const hmrLazy = [...analyzed.hmrManifest.symbols.values()].find((symbol) => symbol.kind === 'lazy')

    expect(component?.code).toContain(`__eclipsaLazy("${lazy?.id}"`)
    expect(component?.code).not.toContain(hmrLazy?.hmrKey ?? 'component:default:lazy:slot')
    expect(hmrLazy?.hmrKey).toBe('component:default:lazy:slot')
  })
})
