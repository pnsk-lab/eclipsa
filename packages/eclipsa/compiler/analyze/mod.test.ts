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
})
