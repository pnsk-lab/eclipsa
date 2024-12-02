import type { Plugin } from 'vite'
import { build } from './build/mod.ts'
import { createRoutes } from './utils/routing.ts'
import { cwd } from 'node:process'

export const createConfig: Plugin['config'] = async (userConfig) => {
  const routes = await createRoutes(userConfig.root ?? cwd())

  return {
    esbuild: {
      jsxFactory: 'jsx',
      jsxImportSource: '@xely/eclipsa',
      jsx: 'preserve',
      sourcemap: false,
    },
    environments: {
      client: {
        build: {
          rollupOptions: {
            input: routes.map(route => route.filePath),
            preserveEntrySignatures: 'allow-extension'
          }
        }
      }
    },
    builder: {
      async buildApp(builder) {
        await build(builder, userConfig)
      },
    }
  }
}
