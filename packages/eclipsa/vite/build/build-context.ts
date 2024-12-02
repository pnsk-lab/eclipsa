import type { PluginContext, ResolveIdResult, LoadResult, TransformResult } from 'rollup'
import { buildFile } from '../../optimizer/mod.ts'

interface EurlData {
  code: string
  origin: string
}
export class EclipsaBuildContext {
  #eurls = new Map<string, EurlData>()

  async resolveId(ctx: PluginContext, source: string, importer: string | undefined): Promise<ResolveIdResult> {
    if (this.#eurls.has(source)) {
      return {
        id: `eurl:${source}`
      }
    }
    if (importer?.startsWith('eurl:') && source.startsWith('.')) {
      const eurl = importer.slice(5)
      const meta = this.#eurls.get(eurl)
      const resolved = await ctx.resolve(source, meta?.origin)
      return resolved
    }
  }

  async load(ctx: PluginContext, id: string): Promise<LoadResult> {
    if (id.startsWith('eurl:')) {
      const eurl = id.slice(5)
      const meta = this.#eurls.get(eurl)
      if (meta) {
        return {
          code: meta.code
        }
      }
    }
  }

  async transform(ctx: PluginContext, code: string, id: string): Promise<TransformResult> {
    if (!id.endsWith('.tsx')) {
      return
    }
    const built = await buildFile(code)
    if (!built) {
      return
    }
    let entryCode = ''
    for (const [eurl, { id: componentId, code }] of built.client) {
      if (componentId) {
        entryCode += `${componentId === 'default' ? 'export default' : `export const ${componentId} = `}'${eurl}'\n`
      }
      this.#eurls.set(eurl, {
        code,
        origin: id
      })
      ctx.emitFile({
        type: 'chunk',
        id: eurl,
        fileName: `ec/${eurl}`
      })
    }
    return {
      code: entryCode,
    }
  }
}