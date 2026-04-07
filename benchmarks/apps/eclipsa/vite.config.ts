import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { eclipsa } from '../../../packages/eclipsa/vite/mod.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const eclipsaPackageDir = path.resolve(rootDir, '../../../packages/eclipsa')

export default defineConfig({
  appType: 'custom',
  build: {
    rolldownOptions: {
      input: './app/index.ts',
    }
  },
  resolve: {
    alias: [
      { find: /^eclipsa$/, replacement: path.join(eclipsaPackageDir, 'mod.ts') },
      { find: /^eclipsa\/client$/, replacement: path.join(eclipsaPackageDir, 'core/client/mod.ts') },
      {
        find: /^eclipsa\/dev-client$/,
        replacement: path.join(eclipsaPackageDir, 'core/dev-client/mod.ts'),
      },
      {
        find: /^eclipsa\/internal$/,
        replacement: path.join(eclipsaPackageDir, 'core/internal.ts'),
      },
      {
        find: /^eclipsa\/jsx$/,
        replacement: path.join(eclipsaPackageDir, 'jsx/mod.ts'),
      },
      {
        find: /^eclipsa\/jsx-dev-runtime$/,
        replacement: path.join(eclipsaPackageDir, 'jsx/jsx-dev-runtime.ts'),
      },
      {
        find: /^eclipsa\/jsx-runtime$/,
        replacement: path.join(eclipsaPackageDir, 'jsx/jsx-runtime.ts'),
      },
      {
        find: /^eclipsa\/prod-client$/,
        replacement: path.join(eclipsaPackageDir, 'core/prod-client/mod.ts'),
      },
      { find: /^eclipsa\/vite$/, replacement: path.join(eclipsaPackageDir, 'vite/mod.ts') },
    ],
  },
  plugins: [eclipsa()],
})
