import type { Plugin } from 'vite'
import { DevEnvironment } from 'vite'
import { build } from './build/mod.ts'

export const createConfig: Plugin['config'] = (userConfig) => {
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
          manifest: true,
          
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
