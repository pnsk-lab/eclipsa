import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'

const host = '127.0.0.1'
const cwd = process.cwd()

const resolveWorkspaceBin = (binName: string) => {
  let currentDir = cwd

  while (true) {
    const candidatePath = path.join(currentDir, 'node_modules/.bin', binName)
    if (existsSync(candidatePath)) {
      return candidatePath
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      throw new Error(`Could not resolve "${binName}" from ${cwd}.`)
    }

    currentDir = parentDir
  }
}

const vpBinPath = resolveWorkspaceBin('vp')
const playwrightBinPath = resolveWorkspaceBin('playwright')

const resolveNodeBinary = () => {
  if (path.basename(process.execPath) === 'node' && existsSync(process.execPath)) {
    return process.execPath
  }

  const candidatePaths = [
    process.env.NVM_BIN ? path.join(process.env.NVM_BIN, 'node') : null,
    '/usr/bin/node',
    '/usr/local/bin/node',
  ].filter((candidatePath): candidatePath is string => !!candidatePath)

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }

  const nvmVersionsDir = path.join(homedir(), '.nvm/versions/node')
  if (existsSync(nvmVersionsDir)) {
    const versionDirs = readdirSync(nvmVersionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))

    for (const versionDir of versionDirs) {
      const candidatePath = path.join(nvmVersionsDir, versionDir, 'bin/node')
      if (existsSync(candidatePath)) {
        return candidatePath
      }
    }
  }

  throw new Error(`Could not resolve a Node.js binary from ${cwd}.`)
}

const nodeBinaryPath = resolveNodeBinary()

const getAvailablePort = async () =>
  await new Promise<number>((resolve, reject) => {
    const server = createServer()

    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to resolve an available Playwright port.'))
        return
      }

      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
  })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForServer = async (url: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok) {
        return
      }
      lastError = new Error(`Server responded with ${response.status} ${response.statusText}`)
    } catch (error) {
      lastError = error
    }

    await sleep(500)
  }

  throw new Error(
    `Timed out waiting for ${url}.${lastError ? ` Last error: ${String(lastError)}` : ''}`,
  )
}

const run = async () => {
  const port = await getAvailablePort()
  const env = {
    ...process.env,
    PATH: `${path.dirname(nodeBinaryPath)}:${process.env.PATH ?? ''}`,
    PLAYWRIGHT_E2E_PORT: String(port),
  }
  const devArgs = [vpBinPath, 'dev', '--host', host, '--port', String(port)]
  const devServer = spawn(nodeBinaryPath, devArgs, {
    cwd,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const waitForDevServerExit = () =>
    new Promise<never>((_, reject) => {
      devServer.once('error', reject)
      devServer.once('close', (code, signal) => {
        reject(
          new Error(
            `The dev server exited before Playwright started (code: ${code ?? 'null'}, signal: ${signal ?? 'null'}).`,
          ),
        )
      })
    })

  const terminateDevServer = () => {
    if (!devServer.killed) {
      devServer.kill('SIGTERM')
    }
  }

  const exitSignals = ['SIGINT', 'SIGTERM'] as const
  for (const signal of exitSignals) {
    process.on(signal, () => {
      terminateDevServer()
      process.exit(1)
    })
  }

  try {
    await Promise.race([waitForServer(`http://${host}:${port}/`, 240_000), waitForDevServerExit()])

    const playwrightArgs = [
      playwrightBinPath,
      'test',
      '--config',
      path.join(cwd, 'playwright.config.cjs'),
      ...process.argv.slice(2),
    ]
    const playwright = spawn(nodeBinaryPath, playwrightArgs, {
      cwd,
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    const exitCode = await new Promise<number>((resolve, reject) => {
      playwright.once('error', reject)
      playwright.once('close', (code) => {
        resolve(code ?? 1)
      })
    })

    if (exitCode !== 0) {
      process.exit(exitCode)
    }
  } finally {
    terminateDevServer()
    await new Promise((resolve) => {
      devServer.once('close', resolve)
      setTimeout(resolve, 5_000)
    })
  }
}

await run()
