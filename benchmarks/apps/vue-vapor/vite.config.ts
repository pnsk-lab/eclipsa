import { defineConfig } from 'vite'
import vue from '@vue-vapor/vite-plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: /^vue\/server-renderer$/, replacement: '@vue-vapor/server-renderer' },
      { find: /^vue$/, replacement: '/home/nakasyou/eclipsa/benchmarks/apps/vue-vapor/src/vue-compat.js' },
    ],
  },
  build: {
    rolldownOptions: {
      input: './src/main.js',
      external: ['@vue-vapor/server-renderer', '@vue-vapor/vapor'],
    }
  }
})
