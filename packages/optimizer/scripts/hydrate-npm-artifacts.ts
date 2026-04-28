import { access, copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

interface PackageJson {
  files?: string[]
  name?: string
}

interface HydrateNpmArtifactsOptions {
  artifactsDir?: string
  cwd?: string
  generatedDir?: string
  npmDir?: string
}

const readPackageJson = async (filePath: string) =>
  JSON.parse(await readFile(filePath, 'utf8')) as PackageJson

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const resolveArtifactSource = async (fileName: string, sourceDirs: string[]) => {
  for (const sourceDir of sourceDirs) {
    const candidate = path.join(sourceDir, fileName)
    if (await fileExists(candidate)) {
      return candidate
    }
  }
  return null
}

export const hydrateNpmArtifacts = async (options: HydrateNpmArtifactsOptions = {}) => {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const npmDir = path.resolve(cwd, options.npmDir ?? 'npm')
  const sourceDirs = [
    path.resolve(cwd, options.artifactsDir ?? 'artifacts'),
    path.resolve(cwd, options.generatedDir ?? 'generated'),
  ]

  const packageDirEntries = await readdir(npmDir, { withFileTypes: true })
  const missingArtifacts: string[] = []

  for (const entry of packageDirEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const packageDir = path.join(npmDir, entry.name)
    const packageJson = await readPackageJson(path.join(packageDir, 'package.json'))
    const files = packageJson.files ?? []

    for (const fileName of files) {
      const sourcePath = await resolveArtifactSource(fileName, sourceDirs)
      if (!sourcePath) {
        missingArtifacts.push(`${packageJson.name ?? entry.name}: ${fileName}`)
        continue
      }

      const targetPath = path.join(packageDir, fileName)
      await mkdir(path.dirname(targetPath), { recursive: true })
      await copyFile(sourcePath, targetPath)
    }
  }

  if (missingArtifacts.length > 0) {
    throw new Error(`Missing optimizer npm artifacts:\n${missingArtifacts.join('\n')}`)
  }
}

const parseArgs = (argv: string[]) => {
  const parsed: HydrateNpmArtifactsOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]

    if (!value) {
      continue
    }

    if (argument === '--artifacts-dir') {
      parsed.artifactsDir = value
      index += 1
      continue
    }

    if (argument === '--cwd') {
      parsed.cwd = value
      index += 1
      continue
    }

    if (argument === '--generated-dir') {
      parsed.generatedDir = value
      index += 1
      continue
    }

    if (argument === '--npm-dir') {
      parsed.npmDir = value
      index += 1
    }
  }

  return parsed
}

if (import.meta.main) {
  await hydrateNpmArtifacts(parseArgs(process.argv.slice(2)))
}
