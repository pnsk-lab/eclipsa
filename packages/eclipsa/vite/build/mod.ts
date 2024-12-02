import { build as viteBuild, type ViteBuilder, type Plugin, type UserConfig, type PluginOption } from 'vite'
import { createRoutes } from '../utils/routing.ts'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { buildFile } from '../../optimizer/mod.ts'
import * as esbuild from 'esbuild'

const buildClient = async (builder: ViteBuilder) => {
  await builder.build(builder.environments.client)
}

export const build = async (builder: ViteBuilder, userConfig: UserConfig) => {

  const userPlugins = [
    ...(userConfig.plugins?.filter(plugin => {
      if (!plugin) {
        return false
      }
      if (!('name' in plugin)) {
        return true
      }
      return plugin.name !== 'vite-plugin-eclipsa'
    }) ?? [])
  ]

  await buildClient(builder)

  /*
    const plugins = [...builder.config.plugins.filter(plugin => plugin.name !== 'vite-plugin-eclipsa'),]
    await viteBuild({
      configFile: false,
      build: {
        rollupOptions: {
          input: routes.map(route => route.filePath),
          external: ['@xely/eclipsa']
        }
      }
    })*/

}
