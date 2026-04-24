import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  getBenchCommand,
  getBenchmarkUrl,
  getFrameworkListUrl,
  getBuildFrameworkCommand,
  getCloneCommand,
  getInstallCommand,
  getInstallFrameworkCommand,
  getInstallWebdriverCommand,
  getPatchedBenchmarkServerEntry,
  normalizeListenHost,
  shouldCopyEclipsaTemplatePath,
  syncFrameworkTemplate,
} from './run.js'

test('commands are stable', () => {
  expect(getCloneCommand()).toContain('js-framework-benchmark.git')
  expect(getInstallCommand()).toBe('npm install --no-audit --no-fund')
  expect(getInstallWebdriverCommand()).toBe(
    'npm install --ignore-scripts --no-audit --no-fund && npm run compile',
  )
  expect(getInstallFrameworkCommand()).toBe('npm install --ignore-scripts --no-audit --no-fund')
  expect(getBuildFrameworkCommand()).toBe('npm run build-prod')
  expect(getBenchCommand('/usr/bin/google-chrome')).toBe(
    "npm run bench -- --runner playwright --headless true --chromeBinary '/usr/bin/google-chrome' keyed/eclipsa",
  )
})

test('bench command quotes chrome paths with spaces', () => {
  expect(getBenchCommand('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')).toBe(
    "npm run bench -- --runner playwright --headless true --chromeBinary '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' keyed/eclipsa",
  )
})

test('benchmark host helpers handle ipv6 host syntax', () => {
  expect(normalizeListenHost('[::1]')).toBe('::1')
  expect(normalizeListenHost('localhost')).toBe('localhost')
  expect(getBenchmarkUrl('[::1]')).toBe('http://[::1]:8081')
  expect(getFrameworkListUrl('[::1]')).toBe('http://[::1]:8081/ls')
})

test('patched benchmark server entry binds to env host', () => {
  const source = getPatchedBenchmarkServerEntry()
  expect(source).toContain('const HOST = process.env.HOST ?? "localhost";')
  expect(source).toContain('await server.listen({ host: HOST, port: PORT });')
})

test('template sync skips generated output and installed dependencies', () => {
  expect(shouldCopyEclipsaTemplatePath('/tmp/eclipsa/src/main.tsx')).toBe(true)
  expect(shouldCopyEclipsaTemplatePath('/tmp/eclipsa/dist/assets/main.js')).toBe(false)
  expect(shouldCopyEclipsaTemplatePath('/tmp/eclipsa/node_modules/eclipsa/mod.ts')).toBe(false)
})

test('template sync replaces stale files in the destination project', () => {
  const root = mkdtempSync(join(tmpdir(), 'eclipsa-bench-'))
  const sourceDir = join(root, 'source')
  const destinationDir = join(root, 'destination')

  mkdirSync(join(sourceDir, 'src'), { recursive: true })
  writeFileSync(join(sourceDir, 'index.html'), '<div id="main"></div>')
  writeFileSync(join(sourceDir, 'src/main.tsx'), 'export default null')

  mkdirSync(destinationDir, { recursive: true })
  writeFileSync(join(destinationDir, 'vite.config.js'), 'stale')

  try {
    syncFrameworkTemplate(sourceDir, destinationDir)

    expect(existsSync(join(destinationDir, 'vite.config.js'))).toBe(false)
    expect(readFileSync(join(destinationDir, 'index.html'), 'utf8')).toBe('<div id="main"></div>')
    expect(readFileSync(join(destinationDir, 'src/main.tsx'), 'utf8')).toBe('export default null')
  } finally {
    rmSync(root, {
      recursive: true,
      force: true,
    })
  }
})

test('template sync can rewrite the local framework dependency for the cached benchmark copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'eclipsa-bench-deps-'))
  const sourceDir = join(root, 'source')
  const destinationDir = join(root, 'destination')

  mkdirSync(sourceDir, { recursive: true })
  writeFileSync(
    join(sourceDir, 'package.json'),
    JSON.stringify({
      dependencies: {
        eclipsa: 'file:../../../../../packages/eclipsa',
      },
    }),
  )

  try {
    syncFrameworkTemplate(sourceDir, destinationDir, {
      frameworkDependency: 'file:../../../../../../../packages/eclipsa',
    })

    const packageJson = JSON.parse(readFileSync(join(destinationDir, 'package.json'), 'utf8'))
    expect(packageJson.dependencies.eclipsa).toBe('file:../../../../../../../packages/eclipsa')
  } finally {
    rmSync(root, {
      recursive: true,
      force: true,
    })
  }
})
