import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cacheDir = resolve(__dirname, '.cache')
const benchmarkRoot = resolve(cacheDir, 'js-framework-benchmark')
const webdriverRoot = resolve(benchmarkRoot, 'webdriver-ts')
const benchmarkServerEntry = resolve(benchmarkRoot, 'server/index.ts')
const eclipsaFrameworkRoot = resolve(benchmarkRoot, 'frameworks/keyed/eclipsa')
const eclipsaTemplateDir = resolve(__dirname, 'frameworks/keyed/eclipsa')
const defaultChromeBinaryCandidates = [
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

const excludedTemplateEntries = new Set(['dist', 'node_modules'])

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

export function getBenchmarkHost() {
  return process.env.BENCHMARK_HOST ?? 'localhost'
}

export function normalizeListenHost(host) {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

export function getBenchmarkUrl(host = getBenchmarkHost()) {
  return `http://${host}:8080`
}

export function getFrameworkListUrl(host = getBenchmarkHost()) {
  return `${getBenchmarkUrl(host)}/ls`
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function getBenchCommand(chromeBinary) {
  return `npm run bench -- --runner playwright --headless true --chromeBinary ${shellQuote(chromeBinary)} keyed/eclipsa`
}

export function getPatchedBenchmarkServerEntry() {
  return `import { buildServer } from "./app.js";

const PORT = 8080;
const HOST = process.env.HOST ?? "localhost";

const server = buildServer();

try {
  await server.listen({ host: HOST, port: PORT });
  console.log(\`Server running on http://\${HOST}:\${PORT}\`);
} catch (error) {
  if (error instanceof Error && "code" in error && (error).code === "EADDRINUSE") {
    console.error(\`ERROR: Port \${PORT} is already in use for host \${HOST}.\`);
  } else {
    console.error("Failed to start server:", error);
  }
  process.exit(1);
}
`
}

function run(command, cwd = __dirname, envOverrides = {}) {
  execSync(command, {
    cwd,
    env: { ...process.env, ...envOverrides },
    stdio: 'inherit',
  })
}

async function waitForServerReady(host = getBenchmarkHost(), timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(getFrameworkListUrl(host))
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(
    `Timed out waiting for js-framework-benchmark server on ${getFrameworkListUrl(host)}`,
  )
}

export function ensureBenchmarkRepository() {
  mkdirSync(cacheDir, { recursive: true })
  if (existsSync(benchmarkRoot)) return
  run(getCloneCommand(), cacheDir)
}

export function shouldCopyEclipsaTemplatePath(sourcePath) {
  return !sourcePath.split(/[\\/]/).some((segment) => excludedTemplateEntries.has(segment))
}

export function syncFrameworkTemplate(sourceDir, destinationDir) {
  rmSync(destinationDir, {
    recursive: true,
    force: true,
  })
  cpSync(sourceDir, destinationDir, {
    recursive: true,
    force: true,
    filter: shouldCopyEclipsaTemplatePath,
  })
}

export function syncEclipsaFramework() {
  syncFrameworkTemplate(eclipsaTemplateDir, eclipsaFrameworkRoot)
}

function patchBenchmarkServerEntry() {
  writeFileSync(benchmarkServerEntry, getPatchedBenchmarkServerEntry(), 'utf8')
}

function resolveChromeBinary() {
  if (process.env.CHROME_BINARY) {
    if (!existsSync(process.env.CHROME_BINARY)) {
      throw new Error(
        `Chrome binary not found at ${process.env.CHROME_BINARY}. Set CHROME_BINARY to an installed Chrome/Chromium executable path.`,
      )
    }
    return process.env.CHROME_BINARY
  }

  for (const candidate of defaultChromeBinaryCandidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(
    `Chrome binary not found. Checked ${defaultChromeBinaryCandidates.join(', ')}. Set CHROME_BINARY to an installed Chrome/Chromium executable path.`,
  )
}

export async function runClientBenchmark() {
  ensureBenchmarkRepository()
  syncEclipsaFramework()
  patchBenchmarkServerEntry()

  run(getInstallCommand(), benchmarkRoot)
  run(getInstallWebdriverCommand(), webdriverRoot)
  run(getInstallFrameworkCommand(), eclipsaFrameworkRoot)
  run(getBuildFrameworkCommand(), eclipsaFrameworkRoot)

  const chromeBinary = resolveChromeBinary()
  const benchmarkHost = getBenchmarkHost()
  const listenHost = normalizeListenHost(benchmarkHost)
  const server = spawn('npm', ['start'], {
    cwd: benchmarkRoot,
    env: { ...process.env, HOST: listenHost },
    stdio: 'inherit',
  })
  try {
    await waitForServerReady(benchmarkHost)
    run(getBenchCommand(chromeBinary), webdriverRoot, { HOST: benchmarkHost })
  } finally {
    server.kill('SIGTERM')
  }
}

if (import.meta.main) {
  await runClientBenchmark()
}
