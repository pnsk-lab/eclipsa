const path = require('node:path')
const { tmpdir } = require('node:os')
const { defineConfig, devices } = require('@playwright/test')

const defaultPort = 30000 + (process.pid % 20000)
const parsedPort = Number(process.env.PLAYWRIGHT_E2E_PORT ?? defaultPort)
const port = Number.isFinite(parsedPort) ? parsedPort : defaultPort
const host = '127.0.0.1'
const baseURL = `http://${host}:${port}`

process.env.PLAYWRIGHT_E2E_PORT = String(port)

const artifactsRoot = path.join(
  tmpdir(),
  'eclipsa-playwright',
  `${process.pid}-${process.env.PLAYWRIGHT_E2E_PORT ?? 'default'}`,
)

module.exports = defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(artifactsRoot, 'report') }],
  ],
  outputDir: path.join(artifactsRoot, 'test-results'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  testMatch: ['**/*.test.ts', '**/*.test.cts'],
})
