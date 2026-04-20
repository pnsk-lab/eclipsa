import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

type CliPackageJson = {
  bin?: Record<string, string>
}

export const resolveNapiCliPath = async () => {
  const require = createRequire(import.meta.url)
  const packageJsonPath = require.resolve('@napi-rs/cli/package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as CliPackageJson
  const cliRelativePath = packageJson.bin?.napi

  if (!cliRelativePath) {
    throw new Error('Unable to resolve the napi binary entry from @napi-rs/cli/package.json.')
  }

  return path.resolve(path.dirname(packageJsonPath), cliRelativePath)
}

export const runNapiCli = async (argv: string[]) => {
  const cliPath = await resolveNapiCliPath()

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...argv], {
      stdio: 'inherit',
      env: process.env,
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`napi terminated with signal ${signal}`))
        return
      }
      if (code && code !== 0) {
        reject(new Error(`napi exited with status ${code}`))
        return
      }
      resolve()
    })
  })
}

if (import.meta.main) {
  await runNapiCli(process.argv.slice(2))
}
