import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: {
      input: './src/main.js',
    },
  },
})
