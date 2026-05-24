import type { Plugin, PluginOption } from 'vite'

export type EclipsaOutputTarget = 'node' | 'ssg'

export interface EclipsaServerAdapterBuildContext {
  clientDir: string
  root: string
  serverDir: string
}

export interface EclipsaServerAdapterFile {
  contents: string
  path: string
}

export interface EclipsaServerAdapter {
  buildFiles: (context: EclipsaServerAdapterBuildContext) => EclipsaServerAdapterFile[]
  name: string
}

export type EclipsaServerAdapterPlugin = Plugin & {
  eclipsaServerAdapter?: EclipsaServerAdapter
}

export interface EclipsaPluginOptions {
  output?: EclipsaOutputTarget
  ssg?: boolean
}

export interface ResolvedEclipsaPluginOptions {
  output: EclipsaOutputTarget
  ssg?: boolean
}

export const resolveEclipsaPluginOptions = (
  options?: EclipsaPluginOptions,
): ResolvedEclipsaPluginOptions => {
  const ssg = options?.ssg ?? options?.output === 'ssg'
  return {
    output: ssg ? 'ssg' : (options?.output ?? 'node'),
    ssg,
  }
}

const flattenPlugins = (plugins: readonly PluginOption[] | undefined): Plugin[] =>
  plugins?.flatMap((plugin) => {
    if (!plugin) {
      return []
    }
    if (Array.isArray(plugin)) {
      return flattenPlugins(plugin)
    }
    if (typeof plugin === 'object' && 'then' in plugin) {
      return []
    }
    return [plugin]
  }) ?? []

export const collectEclipsaServerAdapters = (
  plugins: readonly PluginOption[] | undefined,
): EclipsaServerAdapter[] =>
  flattenPlugins(plugins)
    .map((plugin) => (plugin as EclipsaServerAdapterPlugin).eclipsaServerAdapter)
    .filter((adapter): adapter is EclipsaServerAdapter => Boolean(adapter))
