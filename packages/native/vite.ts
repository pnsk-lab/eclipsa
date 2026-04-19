import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createNativeJsxTransformOptions,
  emitNativeBootstrapModule,
  emitResolvedNativeMapModule,
  emitNativeRouteModule,
  isNativeJsxLikeRequest,
} from '@eclipsa/optimizer/native'
import { createRoutes, matchRoute, normalizeRoutePath } from '../eclipsa/vite/utils/routing.ts'
import {
  mergeConfig,
  transformWithOxc,
  type EnvironmentOptions,
  type FetchableDevEnvironment,
  type Plugin,
  type PluginOption,
  type ResolvedConfig,
  type ViteBuilder,
} from 'vite'
import {
  incomingMessageToRequest,
  responseForServerResponse,
} from '../eclipsa/utils/node-connect.ts'

const require = createRequire(import.meta.url)

const VIRTUAL_BOOTSTRAP_MODULE_ID = 'virtual:eclipsa-native/bootstrap'
const RESOLVED_BOOTSTRAP_MODULE_ID = '\0virtual:eclipsa-native/bootstrap'
const VIRTUAL_APP_MODULE_ID = 'virtual:eclipsa-native/app'
const RESOLVED_APP_MODULE_ID = '\0virtual:eclipsa-native/app'
const VIRTUAL_MAP_MODULE_ID = 'virtual:eclipsa-native/map'
const RESOLVED_MAP_MODULE_ID = '\0virtual:eclipsa-native/map'
const VIRTUAL_DEV_CLIENT_MODULE_ID = 'virtual:eclipsa-native/dev-client'
const RESOLVED_DEV_CLIENT_MODULE_ID = '\0virtual:eclipsa-native/dev-client'
const DEFAULT_NATIVE_SERVE_PATH = '/__eclipsa_native__'
const DEFAULT_NATIVE_OUT_DIR = path.join('dist', 'native')
const DEFAULT_NATIVE_MAP_BASENAME = '+native-map'
const DEFAULT_NATIVE_PATHNAME = '/'

export interface NativePluginOptions {
  environmentName?: string
  outDir?: string
  pathname?: string
  servePath?: string
  target: NativeTargetAdapter
}

interface ResolvedNativePluginOptions {
  eclipsaDevClientFile: string
  environmentName: string
  manifestPath: string
  nativeMapFile: string | null
  outDir: string
  route: ResolvedNativeRoute
  root: string
  servePath: string
  target: ResolvedNativeTarget
}

interface ResolvedNativeRoute {
  layoutFiles: string[]
  pageFile: string
  params: Record<string, string | string[] | undefined>
  pathname: string
}

export interface NativeTargetAdapter {
  bindingPackage: string
  defaultMap?: Record<string, string>
  environmentName: string
  name: string
  platform: string
  createEnvironmentOptions?:
    | ((context: NativeTargetEnvironmentContext) => EnvironmentOptions | null | undefined)
    | undefined
  workspaceFallback?: string
}

export interface NativeTargetEnvironmentContext {
  manifestPath: string
  root: string
  servePath: string
  target: {
    name: string
    platform: string
  }
}

interface NativePluginState {
  config?: ResolvedConfig
  resolved?: ResolvedNativePluginOptions
}

interface ResolvedNativeTarget extends NativeTargetAdapter {}

interface NativeBootstrapChunk {
  fileName: string
  isEntry: boolean
  type: 'chunk'
}

const resolveWorkspaceBinding = (target: ResolvedNativeTarget, root: string) => {
  try {
    return require.resolve(target.bindingPackage, { paths: [root] })
  } catch {}
  if (target.workspaceFallback && existsSync(target.workspaceFallback)) {
    return target.workspaceFallback
  }
  throw new Error(
    `Native target "${target.name}" requires ${target.bindingPackage}. Install it or provide the matching workspace package before using the native Vite plugin.`,
  )
}

const resolveWorkspaceImport = (specifier: string, root: string, fallback: string) => {
  try {
    return require.resolve(specifier, { paths: [root] })
  } catch {}
  if (existsSync(fallback)) {
    return fallback
  }
  throw new Error(
    `Failed to resolve ${specifier}. Install the package or provide the matching workspace source before using the native Vite plugin.`,
  )
}

const withLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`)

const normalizeServePath = (value: string) => withLeadingSlash(value).replace(/\/$/, '')

const createNativeEnvironmentOptions = (
  resolved: ResolvedNativePluginOptions,
): EnvironmentOptions => {
  const baseEnvironment: EnvironmentOptions = {
    consumer: 'server',
    build: {
      emptyOutDir: true,
      outDir: resolved.outDir,
      rollupOptions: {
        input: VIRTUAL_BOOTSTRAP_MODULE_ID,
        output: {
          entryFileNames: 'bootstrap.js',
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
      sourcemap: true,
    },
  }
  const targetEnvironment =
    resolved.target.createEnvironmentOptions?.({
      manifestPath: resolved.manifestPath,
      root: resolved.root,
      servePath: resolved.servePath,
      target: {
        name: resolved.target.name,
        platform: resolved.target.platform,
      },
    }) ?? {}
  return mergeConfig(baseEnvironment, targetEnvironment)
}

const resolveNativeRoute = async (root: string, pathname: string): Promise<ResolvedNativeRoute> => {
  const normalizedPath = normalizeRoutePath(pathname)
  const routes = await createRoutes(root)
  const matched = matchRoute(routes, normalizedPath)

  if (!matched?.route.page) {
    throw new Error(
      `Could not find a native route for ${normalizedPath}. Add app/+page.tsx or pass native({ pathname }) with an existing route.`,
    )
  }

  return {
    layoutFiles: matched.route.layouts.map((layout) => layout.filePath),
    pageFile: matched.route.page.filePath,
    params: matched.params,
    pathname: normalizedPath,
  }
}

const resolveNativeMapFile = (root: string) => {
  const basePath = path.resolve(root, 'app', DEFAULT_NATIVE_MAP_BASENAME)
  for (const extension of ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs']) {
    const candidate = `${basePath}${extension}`
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

const resolveNativeOptions = async (
  root: string,
  options: NativePluginOptions,
): Promise<ResolvedNativePluginOptions> => {
  const target = options.target
  if (!target) {
    throw new Error(
      'The native Vite plugin requires a platform adapter. Pass native({ target: swiftui() }) or another @eclipsa/native target adapter.',
    )
  }
  resolveWorkspaceBinding(target, root)

  const route = await resolveNativeRoute(root, options.pathname ?? DEFAULT_NATIVE_PATHNAME)

  const servePath = normalizeServePath(options.servePath ?? DEFAULT_NATIVE_SERVE_PATH)
  return {
    eclipsaDevClientFile: resolveWorkspaceImport(
      'eclipsa/dev-client',
      root,
      fileURLToPath(new URL('../eclipsa/core/dev-client/mod.ts', import.meta.url)),
    ),
    environmentName: options.environmentName ?? target.environmentName,
    manifestPath: `${servePath}/manifest.json`,
    nativeMapFile: resolveNativeMapFile(root),
    outDir: path.resolve(root, options.outDir ?? DEFAULT_NATIVE_OUT_DIR),
    route,
    root,
    servePath,
    target,
  }
}

const findBootstrapChunk = (
  bundle: Record<string, { type: string; isEntry?: boolean; fileName: string }>,
) =>
  Object.values(bundle).find(
    (item): item is NativeBootstrapChunk => item.type === 'chunk' && item.isEntry === true,
  )

const createNativeManifestSource = (
  resolved: ResolvedNativePluginOptions,
  bootstrapFileName: string,
) =>
  JSON.stringify(
    {
      bindingPackage: resolved.target.bindingPackage,
      bootstrap: `./${bootstrapFileName}`,
      platform: resolved.target.platform,
      target: resolved.target.name,
    },
    null,
    2,
  )

const resolveRequestOrigin = (
  req: { headers: Record<string, string | string[] | undefined> },
  server: { config: ResolvedConfig },
) => {
  const forwardedProto = req.headers['x-forwarded-proto']
  const protocol =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ??
    (server.config.server.https ? 'https' : 'http')
  const headerHost = req.headers.host
  const host =
    (Array.isArray(headerHost) ? headerHost[0] : headerHost) ??
    (typeof server.config.server.host === 'string'
      ? server.config.server.host
      : `127.0.0.1:${server.config.server.port}`)
  return `${protocol}://${host}`
}

const resolveNativeRpcUrl = (origin: string, resolved: ResolvedNativePluginOptions) =>
  new URL(`${resolved.servePath.replace(/\/$/, '')}/rpc`, `${origin}/`).href

const resolveNativeHmrUrl = (origin: string, config: ResolvedConfig) => {
  const hmrConfig = typeof config.server.hmr === 'object' ? config.server.hmr : undefined
  const originUrl = new URL(origin)
  const protocol = hmrConfig?.protocol ?? (originUrl.protocol === 'https:' ? 'wss' : 'ws')
  const hostname = hmrConfig?.host ?? originUrl.hostname
  const port = hmrConfig?.clientPort ?? hmrConfig?.port ?? originUrl.port
  const basePath = hmrConfig?.path ? path.posix.join(config.base, hmrConfig.path) : config.base
  const hostWithPort = port ? `${hostname}:${port}` : hostname
  const url = new URL(`${protocol}://${hostWithPort}${basePath}`)
  url.searchParams.set('token', config.webSocketToken)
  return url.href
}

const createNativeDevManifest = (
  origin: string,
  config: ResolvedConfig,
  resolved: ResolvedNativePluginOptions,
) => ({
  bindingPackage: resolved.target.bindingPackage,
  entry: VIRTUAL_BOOTSTRAP_MODULE_ID,
  hmr: {
    url: resolveNativeHmrUrl(origin, config),
  },
  mode: 'dev' as const,
  platform: resolved.target.platform,
  rpc: resolveNativeRpcUrl(origin, resolved),
  target: resolved.target.name,
})

const createNativeCorePlugin = (
  state: NativePluginState,
  options: NativePluginOptions,
): Plugin => ({
  name: 'vite-plugin-eclipsa-native',
  enforce: 'pre',
  async config(userConfig) {
    const root = userConfig.root ?? process.cwd()
    const resolved = await resolveNativeOptions(root, options)
    state.resolved = resolved
    return {
      appType: 'custom',
      builder: {},
      environments: {
        [resolved.environmentName]: {},
      },
    }
  },
  configEnvironment(name) {
    const resolved = state.resolved
    if (!resolved || name !== resolved.environmentName) {
      return null
    }
    return createNativeEnvironmentOptions(resolved)
  },
  configResolved(config) {
    state.config = config
  },
  async buildApp(builder: ViteBuilder) {
    const resolved = state.resolved
    if (!resolved) {
      throw new Error('Resolved native plugin options are unavailable during buildApp().')
    }
    const environment = builder.environments[resolved.environmentName]
    if (!environment) {
      throw new Error(
        `The native Vite plugin expected a build environment named "${resolved.environmentName}".`,
      )
    }
    await builder.build(environment)
  },
  async configureServer(server) {
    const resolved = state.resolved
    if (!resolved) {
      throw new Error('Resolved native plugin options are unavailable during configureServer().')
    }
    const environment = server.environments[resolved.environmentName] as
      | FetchableDevEnvironment
      | undefined
    if (!environment) {
      throw new Error(
        `The native Vite plugin expected a dev environment named "${resolved.environmentName}". Configure it with Vite's environment API before starting the dev server.`,
      )
    }
    if (typeof environment.dispatchFetch !== 'function') {
      throw new Error(
        `The native Vite plugin expected "${resolved.environmentName}" to be a fetchable dev environment.`,
      )
    }

    server.middlewares.use(async (req, res, next) => {
      const requestPath = req.url?.split('?')[0] ?? '/'
      if (requestPath === '/' || requestPath === resolved.servePath) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            manifest: `${resolved.servePath}/manifest.json`,
            platform: resolved.target.platform,
            target: resolved.target.name,
          }),
        )
        return
      }

      if (!requestPath.startsWith(resolved.servePath)) {
        next()
        return
      }

      if (requestPath === `${resolved.servePath}/manifest.json`) {
        const origin = resolveRequestOrigin(req, server)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(createNativeDevManifest(origin, server.config, resolved), null, 2))
        return
      }

      if (requestPath === `${resolved.servePath}/rpc`) {
        const response = await environment.dispatchFetch(incomingMessageToRequest(req))
        await responseForServerResponse(response, res)
        return
      }

      res.statusCode = 404
      res.end('Not Found')
    })
  },
})

const createNativeHmrPlugin = (state: NativePluginState): Plugin => ({
  name: 'vite-plugin-eclipsa-native:hmr',
  enforce: 'post',
  applyToEnvironment(environment) {
    return environment.name === state.resolved?.environmentName
  },
  hotUpdate(options) {
    const resolved = state.resolved
    if (!resolved?.nativeMapFile || options.file !== resolved.nativeMapFile) {
      return
    }
    this.environment.hot.send('eclipsa:native-map-update', {
      file: resolved.nativeMapFile,
    })
  },
})

const createNativePlugin = (state: NativePluginState, options: NativePluginOptions): Plugin[] => [
  createNativeCorePlugin(state, options),
  createNativeHmrPlugin(state),
]

const createNativeResolverPlugin = (state: NativePluginState): Plugin => ({
  name: 'vite-plugin-eclipsa-native:modules',
  enforce: 'pre',
  applyToEnvironment(environment) {
    return environment.name === state.resolved?.environmentName
  },
  resolveId(id) {
    if (id === VIRTUAL_BOOTSTRAP_MODULE_ID) {
      return RESOLVED_BOOTSTRAP_MODULE_ID
    }
    if (id === VIRTUAL_APP_MODULE_ID) {
      return RESOLVED_APP_MODULE_ID
    }
    if (id === VIRTUAL_MAP_MODULE_ID) {
      return RESOLVED_MAP_MODULE_ID
    }
    if (id === VIRTUAL_DEV_CLIENT_MODULE_ID) {
      return RESOLVED_DEV_CLIENT_MODULE_ID
    }
    return null
  },
  load(id) {
    const resolved = state.resolved
    if (!resolved) {
      throw new Error('Resolved native plugin options are unavailable during load().')
    }
    if (id === RESOLVED_BOOTSTRAP_MODULE_ID) {
      return emitNativeBootstrapModule({
        appModuleId: VIRTUAL_APP_MODULE_ID,
        hmr: state.config?.command === 'serve',
        hmrHelpersImport: resolved.eclipsaDevClientFile,
        mapModuleId: VIRTUAL_MAP_MODULE_ID,
      })
    }
    if (id === RESOLVED_APP_MODULE_ID) {
      return emitNativeRouteModule({
        hmr: state.config?.command === 'serve',
        hmrHelpersImport: resolved.eclipsaDevClientFile,
        layoutFiles: resolved.route.layoutFiles,
        pageFile: resolved.route.pageFile,
        params: resolved.route.params,
        pathname: resolved.route.pathname,
      })
    }
    if (id === RESOLVED_MAP_MODULE_ID) {
      return emitResolvedNativeMapModule({
        bindingImport: resolved.target.bindingPackage,
        defaultMap: resolved.target.defaultMap,
        mapFile: resolved.nativeMapFile,
      })
    }
    if (id === RESOLVED_DEV_CLIENT_MODULE_ID) {
      return [
        `import { bootNativeDevClient } from ${JSON.stringify('@eclipsa/native-core')};`,
        `bootNativeDevClient();`,
        '',
      ].join('\n')
    }
    return null
  },
  async transform(code, id) {
    if (!isNativeJsxLikeRequest(id)) {
      return null
    }
    const config = state.config
    if (!config) {
      throw new Error('Resolved Vite config is unavailable during transform().')
    }
    return transformWithOxc(code, id, createNativeJsxTransformOptions(id, config.isProduction))
  },
  generateBundle(_, bundle) {
    const resolved = state.resolved
    if (!resolved) {
      throw new Error('Resolved native plugin options are unavailable during generateBundle().')
    }
    const bootstrapChunk = findBootstrapChunk(bundle)
    if (!bootstrapChunk || bootstrapChunk.type !== 'chunk') {
      throw new Error('Failed to emit the native bootstrap entry chunk.')
    }
    this.emitFile({
      type: 'asset',
      fileName: 'manifest.json',
      source: createNativeManifestSource(resolved, bootstrapChunk.fileName),
    })
  },
  async writeBundle(_, bundle) {
    const resolved = state.resolved
    if (!resolved) {
      throw new Error('Resolved native plugin options are unavailable during writeBundle().')
    }
    const bootstrapChunk = findBootstrapChunk(bundle)
    if (!bootstrapChunk) {
      throw new Error('Failed to write the native manifest because the bootstrap chunk is missing.')
    }
    await mkdir(resolved.outDir, { recursive: true })
    await writeFile(
      path.join(resolved.outDir, 'manifest.json'),
      createNativeManifestSource(resolved, bootstrapChunk.fileName),
      'utf8',
    )
  },
})

export const native = (options: NativePluginOptions): PluginOption => {
  const state: NativePluginState = {}
  return [...createNativePlugin(state, options), createNativeResolverPlugin(state)]
}
