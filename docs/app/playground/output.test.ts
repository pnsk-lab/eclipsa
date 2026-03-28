import { describe, expect, it } from 'vitest'
import { analyzeModule } from '../../../packages/eclipsa/compiler/analyze/mod.ts'
import { compileClientModule } from '../../../packages/eclipsa/compiler/client/mod.ts'
import { compileSSRModule } from '../../../packages/eclipsa/compiler/ssr/mod.ts'
import { createPlaygroundOutputFiles } from './output.ts'
import { DEFAULT_PLAYGROUND_SOURCE, PLAYGROUND_ENTRY_ID } from './shared.ts'

describe('playground output splitting', () => {
  it('creates a main chunk and separate resumable symbol chunks', async () => {
    const analyzed = await analyzeModule(DEFAULT_PLAYGROUND_SOURCE, PLAYGROUND_ENTRY_ID)
    const files = await createPlaygroundOutputFiles({
      analyzed,
      compileClient(source, id) {
        return compileClientModule(source, id, { hmr: false })
      },
      compileSsr(source, id) {
        return compileSSRModule(source, id)
      },
    })

    expect(files[0]?.path).toBe('/dist/app.js')
    expect(files[1]?.path).toBe('/dist/ssr.js')
    expect(files).toHaveLength(analyzed.symbols.size + 2)
    expect(files.some((file: (typeof files)[number]) => file.relativePath.startsWith('entries/symbol__'))).toBe(true)
    expect(files.some((file: (typeof files)[number]) => file.symbolKind === 'component')).toBe(true)
  })
})
