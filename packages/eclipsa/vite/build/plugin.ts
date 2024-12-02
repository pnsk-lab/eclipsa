import type { Plugin } from 'vite'
import { buildFile } from '../../optimizer/mod.ts'
import { EclipsaBuildContext } from './build-context.ts'

export const vitePluginEclipsaBuild = (): Plugin => {
  const buildContext = new EclipsaBuildContext()
  return {
    name: 'vite-plugin-eclipsa-build',
    resolveId(source, importer, options) {
      return buildContext.resolveId(this, source, importer)
    },
    load(id, options) {
      return buildContext.load(this, id)
    },
    transform(code, id) {
      if (this.environment.mode === 'build') {
        return buildContext.transform(this, code, id)
      }
    },
  }
}
