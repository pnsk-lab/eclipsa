import { build as viteBuild, type ViteBuilder, type Plugin, type UserConfig, type PluginOption } from 'vite'
import { createRoutes } from '../utils/routing.ts'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { buildFile } from '../../optimizer/mod.ts'
import * as esbuild from 'esbuild'

const buildClient = async (builder: ViteBuilder, distDir: string, userPlugins: PluginOption[]) => {
  const clientDir = path.join(distDir, 'client')
  await fs.mkdir(clientDir)
  const clientTmpDir = path.join(clientDir, 'tmp')
  await fs.mkdir(clientTmpDir)

  const plugins = [
    ...builder.config.plugins.filter(plugin => plugin.name !== 'vite-plugin-eclipsa')
  ]

  const routes = await createRoutes(builder.config.root)
  for (const route of routes) {
    const relativePath = path.relative(builder.config.root, route.filePath)
    await fs.mkdir(path.dirname(path.join(clientTmpDir, relativePath)), { recursive: true })

    const tsx = await fs.readFile(route.filePath, { encoding: 'utf8' })
    const jsx = (await esbuild.transform(tsx, {
      jsx: 'preserve',
      loader: 'tsx'
    })).code
    const built = await buildFile(jsx)
    if (!built) {
      continue
    }
    let entryContent = ''
    for (const [eurl, { id, code }] of built.client) {
      if (!id) {
        continue
      }
      entryContent += (id === 'default' ? `export default ` : `export const ${id} = `) + `"${eurl}"\n`
      await fs.writeFile(path.join(clientTmpDir, relativePath, '..', eurl), code)
    }
    await fs.writeFile(path.join(clientTmpDir, relativePath), entryContent)
  }

}

export const build = async (builder: ViteBuilder, userConfig: UserConfig) => {
  const distDir = path.join(builder.config.root, 'dist')
  await fs.rm(distDir, { recursive: true })
  await fs.mkdir(distDir)

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

  await buildClient(builder, distDir, userPlugins)

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
