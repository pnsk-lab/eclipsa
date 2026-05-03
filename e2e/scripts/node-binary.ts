import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

type ResolveNodeBinaryOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  execPath?: string
  homeDir?: string
}

const unique = <T>(values: T[]) => Array.from(new Set(values))

const nodeBinaryNames = ['node', 'node.exe']

export const resolveNodeBinary = (options: ResolveNodeBinaryOptions = {}) => {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const execPath = options.execPath ?? process.execPath

  if (nodeBinaryNames.includes(path.basename(execPath).toLowerCase()) && existsSync(execPath)) {
    return execPath
  }

  const pathCandidates = (env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((dir) => nodeBinaryNames.map((binaryName) => path.join(dir, binaryName)))

  const candidatePaths = unique(
    [
      ...(env.NVM_BIN
        ? nodeBinaryNames.map((binaryName) => path.join(env.NVM_BIN!, binaryName))
        : []),
      ...pathCandidates,
      '/usr/bin/node',
      '/usr/local/bin/node',
      '/opt/homebrew/bin/node',
    ].filter((candidatePath): candidatePath is string => !!candidatePath),
  )

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }

  const nvmVersionsDir = path.join(options.homeDir ?? homedir(), '.nvm/versions/node')
  if (existsSync(nvmVersionsDir)) {
    const versionDirs = readdirSync(nvmVersionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))

    for (const versionDir of versionDirs) {
      for (const binaryName of nodeBinaryNames) {
        const candidatePath = path.join(nvmVersionsDir, versionDir, 'bin', binaryName)
        if (existsSync(candidatePath)) {
          return candidatePath
        }
      }
    }
  }

  throw new Error(`Could not resolve a Node.js binary from ${cwd}.`)
}
