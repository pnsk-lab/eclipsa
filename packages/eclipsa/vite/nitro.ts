import * as path from 'node:path'
import { pathToFileURL } from 'node:url'

const ECLIPSA_NITRO_ENTRY_ID = '#eclipsa/nitro-entry'

interface VitePluginLike {
  name?: string
  nitro?: unknown
}

interface NitroPublicAsset {
  baseURL?: string
  dir: string
  maxAge?: number
}

interface NitroConfigLike {
  entry?: string
  publicAssets?: NitroPublicAsset[]
  virtual?: Record<string, string | (() => string)>
  [key: string]: unknown
}

const normalizeAssetBaseURL = (value: string) => {
  const normalized = value.trim() || '/'
  if (normalized === '/') {
    return '/'
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

const flattenPlugins = (plugins: unknown): VitePluginLike[] => {
  if (!Array.isArray(plugins)) {
    return plugins && typeof plugins === 'object' ? [plugins as VitePluginLike] : []
  }
  return plugins.flatMap((entry) => flattenPlugins(entry))
}

export const hasNitroPlugin = (plugins: unknown): boolean =>
  flattenPlugins(plugins).some((plugin) => {
    if (!plugin || typeof plugin !== 'object') {
      return false
    }
    if ('nitro' in plugin) {
      return true
    }
    return typeof plugin.name === 'string' && plugin.name.startsWith('nitro:')
  })

export const createEclipsaNitroEntry = (appModulePath: string) =>
  [
    'import { defineHandler } from "nitro";',
    `import app from ${JSON.stringify(pathToFileURL(appModulePath).href)};`,
    '',
    'export default defineHandler((event) => app.fetch(event.req));',
    '',
  ].join('\n')

export const createEclipsaNitroConfig = (
  root: string,
  nitroConfig: NitroConfigLike | undefined,
): NitroConfigLike => {
  const clientDir = path.join(root, 'dist/client')
  const appModulePath = path.join(root, 'dist/ssr/eclipsa_app.mjs')
  const nextPublicAssets = [...(nitroConfig?.publicAssets ?? [])]
  const hasClientAssetDir = nextPublicAssets.some(
    (asset) =>
      path.resolve(root, asset.dir) === clientDir &&
      normalizeAssetBaseURL(asset.baseURL ?? '/') === '/',
  )

  if (!hasClientAssetDir) {
    nextPublicAssets.push({
      baseURL: '/',
      dir: clientDir,
    })
  }

  return {
    ...nitroConfig,
    entry: ECLIPSA_NITRO_ENTRY_ID,
    publicAssets: nextPublicAssets,
    virtual: {
      ...nitroConfig?.virtual,
      [ECLIPSA_NITRO_ENTRY_ID]: createEclipsaNitroEntry(appModulePath),
    },
  }
}
