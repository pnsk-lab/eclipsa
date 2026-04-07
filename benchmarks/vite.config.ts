import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    tasks: {
      'build:all': {
        dependsOn: [
          'build:astro',
          'build:react',
          'build:qwik',
          'build:eclipsa',
          'build:hono',
          'build:solid',
          'build:svelte',
          'build:vue',
          'build:vue-vapor',
        ],
        command: ''
      },
      'build:astro': {
        command: 'bun run build',
        cwd: 'apps/astro',
      },
      'build:react': {
        command: 'bun run build',
        cwd: 'apps/react',
      },
      'build:qwik': {
        command: 'bun run build',
        cwd: 'apps/qwik',
      },
      'build:eclipsa': {
        command: 'bun run build',
        cwd: 'apps/eclipsa',
      },
      'build:hono': {
        command: 'bun run build',
        cwd: 'apps/hono',
      },
      'build:solid': {
        command: 'bun run build',
        cwd: 'apps/solid',
      },
      'build:svelte': {
        command: 'bun run build',
        cwd: 'apps/svelte',
      },
      'build:vue': {
        command: 'bun run build',
        cwd: 'apps/vue',
      },
      'build:vue-vapor': {
        command: 'bun run build',
        cwd: 'apps/vue-vapor',
      }
    }
  }
})
