import type { Plugin } from 'vite'
import * as fs from 'node:fs/promises'
import { cwd } from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectRouteModules, collectRouteServerModules, createRoutes } from './utils/routing.ts'
import { build } from './build/mod.ts'
import {
  collectAppActions,
  collectAppLoaders,
  collectAppSymbols,
  createSymbolRequestId,
} from './compiler.ts'
import type { ResolvedEclipsaPluginOptions } from './options.ts'
import { createEclipsaNitroConfig, hasNitroPlugin } from './nitro.ts'

const ECLIPSA_RUNTIME_ENTRY_PATH = fileURLToPath(import.meta.resolve('eclipsa/vite/build/runtime'))

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export const createConfig =
  (options: ResolvedEclipsaPluginOptions): Plugin['config'] =>
  async (userConfig) => {
    const root = userConfig.root ?? cwd()
    const appHooksPath = path.join(root, 'app/+hooks.ts')
    const serverHooksPath = path.join(root, 'app/+hooks.server.ts')
    const hasAppHooks = await fileExists(appHooksPath)
    const hasServerHooks = await fileExists(serverHooksPath)
    const nitroEnabled = hasNitroPlugin(userConfig.plugins)
    const routes = await createRoutes(root)
    const routeModules = collectRouteModules(routes)
    const routeServerModules = collectRouteServerModules(routes)
    const actions = await collectAppActions(root)
    const loaders = await collectAppLoaders(root)
    const symbols = await collectAppSymbols(root)

    const clientInput = Object.fromEntries([
      ['client_boot', path.join(root, 'app/+client.dev.tsx')],
      ...(hasAppHooks ? [['app_hooks', appHooksPath] as const] : []),
      ...symbols.map((symbol) => [
        `symbol__${symbol.id}`,
        createSymbolRequestId(symbol.filePath, symbol.id),
      ]),
      ...routeModules.map((entry) => [entry.entryName, entry.filePath]),
    ])

    const ssrInput = Object.fromEntries([
      ['server_entry', path.join(root, 'app/+server-entry.ts')],
      ['ssr_root', path.join(root, 'app/+ssr-root.tsx')],
      ['eclipsa_runtime', ECLIPSA_RUNTIME_ENTRY_PATH],
      ...(hasAppHooks ? [['app_hooks', appHooksPath] as const] : []),
      ...(hasServerHooks ? [['server_hooks', serverHooksPath] as const] : []),
      ...actions.map((action) => [`action__${action.id}`, action.filePath]),
      ...loaders.map((loader) => [`loader__${loader.id}`, loader.filePath]),
      ...routeModules.map((entry) => [entry.entryName, entry.filePath]),
      ...routeServerModules.map((entry) => [entry.entryName, entry.filePath]),
    ])

    return {
      oxc: {
        jsx: 'preserve',
        jsxFactory: 'jsx',
        jsxImportSource: 'eclipsa',
        sourcemap: false,
      },
      ...(nitroEnabled
        ? ({
            nitro: createEclipsaNitroConfig(
              root,
              (userConfig as typeof userConfig & { nitro?: Record<string, unknown> }).nitro,
            ),
          } as Record<string, unknown>)
        : {}),
      environments: {
        client: {
          build: {
            emptyOutDir: true,
            outDir: path.join(root, 'dist/client'),
            rollupOptions: {
              input: clientInput,
              output: {
                assetFileNames: 'assets/[name]-[hash][extname]',
                chunkFileNames: 'chunks/[name]-[hash].js',
                entryFileNames: 'entries/[name].js',
              },
              preserveEntrySignatures: 'allow-extension',
            },
          },
        },
        ssr: {
          resolve: {
            noExternal: [/^eclipsa(?:\/|$)/],
          },
          build: {
            emptyOutDir: true,
            outDir: path.join(root, 'dist/ssr'),
            rollupOptions: {
              input: ssrInput,
              output: {
                assetFileNames: 'assets/[name]-[hash][extname]',
                chunkFileNames: 'chunks/[name]-[hash].mjs',
                entryFileNames: 'entries/[name].mjs',
              },
              preserveEntrySignatures: 'allow-extension',
            },
          },
        },
      },
      builder: {
        async buildApp(builder) {
          await build(builder, userConfig, options)
        },
      },
    }
  }
