#!/usr/bin/env bun
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const TEMPLATE_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'template',
  'node-ssr',
)

const PACKAGE_NAME_TOKEN = '__APP_NAME__'

const TEMPLATE_TEXT_EXTENSIONS = new Set(['.json', '.ts', '.tsx', '.md', '.gitignore'])

const toPackageName = (input: string) =>
  input
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-_]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replaceAll(/^-|-$/g, '') || 'my-eclipsa-app'

const isTextTemplate = (filePath: string) => {
  const extension = path.extname(filePath)
  return TEMPLATE_TEXT_EXTENSIONS.has(extension) || path.basename(filePath) === '.gitignore'
}

const ensureDirectory = async (targetPath: string) => {
  await fs.mkdir(targetPath, { recursive: true })
}

const isDirectoryEmpty = async (targetPath: string) => {
  try {
    const entries = await fs.readdir(targetPath)
    return entries.length === 0
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true
    }
    throw error
  }
}

const copyTemplateDirectory = async (
  sourceDir: string,
  targetDir: string,
  packageName: string,
): Promise<void> => {
  await ensureDirectory(targetDir)

  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copyTemplateDirectory(sourcePath, targetPath, packageName)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (isTextTemplate(sourcePath)) {
      const content = await fs.readFile(sourcePath, 'utf8')
      await fs.writeFile(targetPath, content.replaceAll(PACKAGE_NAME_TOKEN, packageName))
      continue
    }

    await fs.copyFile(sourcePath, targetPath)
  }
}

export const scaffoldApp = async (
  targetDir: string,
  options?: {
    packageName?: string
  },
) => {
  const resolvedTarget = path.resolve(targetDir)
  if (!(await isDirectoryEmpty(resolvedTarget))) {
    throw new Error(`Target directory is not empty: ${resolvedTarget}`)
  }

  const packageName = toPackageName(options?.packageName ?? path.basename(resolvedTarget))
  await copyTemplateDirectory(TEMPLATE_ROOT, resolvedTarget, packageName)
  return {
    packageName,
    targetDir: resolvedTarget,
  }
}

const printUsage = () => {
  console.log('Usage: create-eclipsa [target-directory]')
}

const isDirectExecution = () => {
  const entryPath = process.argv[1]
  if (!entryPath) {
    return false
  }
  return path.resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  const targetDir = process.argv[2] ?? '.'
  if (targetDir === '--help' || targetDir === '-h') {
    printUsage()
    process.exit(0)
  }

  scaffoldApp(targetDir)
    .then(({ packageName, targetDir: resolvedTarget }) => {
      console.log(`Created ${packageName} in ${resolvedTarget}`)
      console.log('Next steps:')
      console.log(`  cd ${path.relative(process.cwd(), resolvedTarget) || '.'}`)
      console.log('  bun install')
      console.log('  bun run dev')
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
