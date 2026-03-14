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

  it('rejects useSignal() outside component$()', async () => {
    await expect(
      analyzeModule(`
        import { useSignal } from "eclipsa";
        const count = useSignal(0);
        export default count;
      `),
    ).rejects.toThrowError(
      'useSignal() can only be used while rendering a component$ and must be called at the top level of the component$ body (not inside nested functions).',
    )
  })

  it('annotates direct projection slot props on component metadata', async () => {
    const analyzed = await analyzeModule(`
      import { component$ } from "eclipsa";
      export const Probe = component$((props) => (
        <section>
          <div>{props.aa}</div>
          <div>{props.children}</div>
          <span>{props.aa}</span>
        </section>
      ));
    `)

    expect(analyzed?.code).toContain('__eclipsaComponent')
    expect(analyzed?.code).toContain('aa: 2')
    expect(analyzed?.code).toContain('children: 1')
  })

  it('rejects non-direct uses of projection slot props', async () => {
    await expect(
      analyzeModule(`
        import { component$ } from "eclipsa";
        export default component$((props) => {
          const forwarded = props.children;
          return <div>{props.children}</div>;
        });
      `),
    ).rejects.toThrowError(
      'Projection slot prop "children" must be rendered directly as {props.children} inside JSX.',
    )
  })
})
