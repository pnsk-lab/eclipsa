import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cacheDir = resolve(__dirname, '.cache')
const benchmarkRoot = resolve(cacheDir, 'js-framework-benchmark')
const webdriverRoot = resolve(benchmarkRoot, 'webdriver-ts')
const eclipsaFrameworkRoot = resolve(benchmarkRoot, 'frameworks/keyed/eclipsa')
const eclipsaTemplateDir = resolve(__dirname, 'frameworks/keyed/eclipsa')
const defaultChromeBinary = '/usr/bin/google-chrome'

export function getCloneCommand() {
  return `git clone --depth 1 https://github.com/krausest/js-framework-benchmark.git ${benchmarkRoot}`
}

export function getInstallCommand() {
  return 'npm install --no-audit --no-fund'
}

export function getInstallWebdriverCommand() {
  return 'npm install --ignore-scripts --no-audit --no-fund && npm run compile'
}

export function getInstallFrameworkCommand() {
  return 'npm install --ignore-scripts --no-audit --no-fund'
}

export function getBuildFrameworkCommand() {
  return 'npm run build-prod'
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function getBenchCommand(chromeBinary) {
  return `npm run bench -- --runner playwright --headless true --chromeBinary ${shellQuote(chromeBinary)} keyed/eclipsa`
}

function run(command, cwd = __dirname) {
  execSync(command, { cwd, stdio: 'inherit' })
}

async function waitForServerReady(timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch('http://localhost:8080')
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Timed out waiting for js-framework-benchmark server on http://localhost:8080')
}

export function ensureBenchmarkRepository() {
  mkdirSync(cacheDir, { recursive: true })
  if (existsSync(benchmarkRoot)) return
  run(getCloneCommand(), cacheDir)
}

export function syncEclipsaFramework() {
  cpSync(eclipsaTemplateDir, eclipsaFrameworkRoot, { recursive: true, force: true })
}

function resolveChromeBinary() {
  const chromeBinary = process.env.CHROME_BINARY ?? defaultChromeBinary
  if (!existsSync(chromeBinary)) {
    throw new Error(
      `Chrome binary not found at ${chromeBinary}. Set CHROME_BINARY to an installed Chrome/Chromium executable path.`,
    )
  }
  return chromeBinary
}

export async function runClientBenchmark() {
  ensureBenchmarkRepository()
  syncEclipsaFramework()

  run(getInstallCommand(), benchmarkRoot)
  run(getInstallWebdriverCommand(), webdriverRoot)
  run(getInstallFrameworkCommand(), eclipsaFrameworkRoot)
  run(getBuildFrameworkCommand(), eclipsaFrameworkRoot)

  const chromeBinary = resolveChromeBinary()
  const server = spawn('npm', ['start'], { cwd: benchmarkRoot, stdio: 'inherit' })
  try {
    await waitForServerReady()
    run(getBenchCommand(chromeBinary), webdriverRoot)
  } finally {
    server.kill('SIGTERM')
  }
}

if (import.meta.main) {
  await runClientBenchmark()
}
