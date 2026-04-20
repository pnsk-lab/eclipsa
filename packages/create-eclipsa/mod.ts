#!/usr/bin/env bun
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const TEMPLATE_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'template',
  'node-ssr',
)

const PACKAGE_NAME_TOKEN = '__APP_NAME__'
const DEV_COMMAND_TOKEN = '__DEV_COMMAND__'
const BUILD_COMMAND_TOKEN = '__BUILD_COMMAND__'
const VITE_IMPORT_SOURCE_TOKEN = '__VITE_IMPORT_SOURCE__'
const VITE_DEPENDENCY_NAME_TOKEN = '__VITE_DEPENDENCY_NAME__'
const VITE_DEPENDENCY_VERSION_TOKEN = '__VITE_DEPENDENCY_VERSION__'

const TEMPLATE_TEXT_EXTENSIONS = new Set(['.json', '.ts', '.tsx', '.md', '.gitignore'])

export type Toolchain = 'vite' | 'vite-plus'

const TOOLCHAIN_CONFIG: Record<
  Toolchain,
  {
    buildCommand: string
    devCommand: string
    dependencyName: string
    dependencyVersion: string
    importSource: string
  }
> = {
  vite: {
    buildCommand: 'vite build',
    devCommand: 'vite dev',
    dependencyName: 'vite',
    dependencyVersion: 'latest',
    importSource: 'vite',
  },
  'vite-plus': {
    buildCommand: 'vp build',
    devCommand: 'vp dev',
    dependencyName: 'vite-plus',
    dependencyVersion: '^0.1.4',
    importSource: 'vite-plus',
  },
}

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

const normalizeToolchain = (input: string): Toolchain | null => {
  const normalized = input.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  if (normalized === 'vite' || normalized === 'vite-plus') {
    return normalized
  }
  return null
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
  toolchain: Toolchain,
): Promise<void> => {
  await ensureDirectory(targetDir)
  const toolchainConfig = TOOLCHAIN_CONFIG[toolchain]

  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copyTemplateDirectory(sourcePath, targetPath, packageName, toolchain)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (isTextTemplate(sourcePath)) {
      const content = await fs.readFile(sourcePath, 'utf8')
      await fs.writeFile(
        targetPath,
        content
          .replaceAll(PACKAGE_NAME_TOKEN, packageName)
          .replaceAll(DEV_COMMAND_TOKEN, toolchainConfig.devCommand)
          .replaceAll(BUILD_COMMAND_TOKEN, toolchainConfig.buildCommand)
          .replaceAll(VITE_IMPORT_SOURCE_TOKEN, toolchainConfig.importSource)
          .replaceAll(VITE_DEPENDENCY_NAME_TOKEN, toolchainConfig.dependencyName)
          .replaceAll(VITE_DEPENDENCY_VERSION_TOKEN, toolchainConfig.dependencyVersion),
      )
      continue
    }

    await fs.copyFile(sourcePath, targetPath)
  }
}

export const scaffoldApp = async (
  targetDir: string,
  options?: {
    packageName?: string
    toolchain?: Toolchain
  },
) => {
  const resolvedTarget = path.resolve(targetDir)
  if (!(await isDirectoryEmpty(resolvedTarget))) {
    throw new Error(`Target directory is not empty: ${resolvedTarget}`)
  }

  const packageName = toPackageName(options?.packageName ?? path.basename(resolvedTarget))
  const toolchain = options?.toolchain ?? 'vite'
  await copyTemplateDirectory(TEMPLATE_ROOT, resolvedTarget, packageName, toolchain)
  return {
    packageName,
    targetDir: resolvedTarget,
    toolchain,
  }
}

type PromptDefaults = {
  targetDir: string
  toolchain: Toolchain
}

type PromptFn = (message: string) => Promise<string>

const promptWithDefault = async (prompt: PromptFn, message: string, fallback: string) => {
  const response = (await prompt(`${message} (${fallback}): `)).trim()
  return response || fallback
}

export const promptForScaffoldOptions = async (
  defaults: PromptDefaults,
  prompt: PromptFn,
): Promise<PromptDefaults> => {
  const targetDir = await promptWithDefault(prompt, 'Project name', defaults.targetDir)

  while (true) {
    const answer = await promptWithDefault(prompt, 'Use vite or vite-plus', defaults.toolchain)
    const toolchain = normalizeToolchain(answer)
    if (toolchain) {
      return {
        targetDir,
        toolchain,
      }
    }
    console.log('Please choose either "vite" or "vite-plus".')
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
  const argTargetDir = process.argv[2]
  if (argTargetDir === '--help' || argTargetDir === '-h') {
    printUsage()
    process.exit(0)
  }

  const run = async () => {
    const defaults = {
      targetDir: argTargetDir ?? 'my-eclipsa-app',
      toolchain: 'vite' as const,
    }
    const options =
      process.stdin.isTTY && process.stdout.isTTY
        ? await (() => {
            const readline = createInterface({
              input: process.stdin,
              output: process.stdout,
            })
            const prompt = (message: string) => readline.question(message)
            return promptForScaffoldOptions(defaults, prompt).finally(() => readline.close())
          })()
        : defaults

    return scaffoldApp(options.targetDir, {
      toolchain: options.toolchain,
    })
  }

  run()
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
