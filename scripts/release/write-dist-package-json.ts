#!/usr/bin/env bun
import type { Dirent } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }
type DependencyMap = Record<string, string>

const PACKAGE_FIELDS = [
  'name',
  'version',
  'description',
  'keywords',
  'homepage',
  'bugs',
  'license',
  'author',
  'contributors',
  'funding',
  'repository',
  'type',
  'sideEffects',
  'main',
  'module',
  'types',
  'exports',
  'typesVersions',
  'bin',
  'man',
  'dependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
  'engines',
  'os',
  'cpu',
  'files',
  'directories',
  'preferUnplugged',
] as const

const PUBLISH_CONFIG_ONLY_FIELDS = [
  'access',
  'tag',
  'registry',
  'provenance',
  'otp',
  'dryRun',
] as const

const PACKAGE_FIELD_SET = new Set<string>(PACKAGE_FIELDS)
const PUBLISH_CONFIG_ONLY_FIELD_SET = new Set<string>(PUBLISH_CONFIG_ONLY_FIELDS)

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }

  if (isObject(value)) {
    return Object.values(value).every(isJsonValue)
  }

  return false
}

const cloneJson = <T extends JsonValue>(value: T): T => structuredClone(value)

const pickFields = (source: Record<string, unknown>, fields: Iterable<string>) => {
  const result: JsonObject = {}
  for (const field of fields) {
    const value = source[field]
    if (isJsonValue(value)) {
      result[field] = cloneJson(value)
    }
  }
  return result
}

const findWorkspaceRoot = async (startDir: string) => {
  let currentDir = path.resolve(startDir)

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    try {
      const rootPackageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as JsonObject
      const workspaces = Array.isArray(rootPackageJson.workspaces)
        ? rootPackageJson.workspaces
        : isObject(rootPackageJson.workspaces) && Array.isArray(rootPackageJson.workspaces.packages)
          ? rootPackageJson.workspaces.packages
          : null

      if (workspaces) {
        return {
          rootDir: currentDir,
          workspaces: workspaces.filter((value): value is string => typeof value === 'string'),
        }
      }
    } catch {
      // Keep walking up until a workspace root is found.
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      return null
    }
    currentDir = parentDir
  }
}

const collectWorkspacePackageVersions = async (packageDir: string) => {
  const workspaceRoot = await findWorkspaceRoot(packageDir)
  const versions = new Map<string, string>()

  if (!workspaceRoot) {
    return versions
  }

  const packageDirs = new Set<string>()

  for (const pattern of workspaceRoot.workspaces) {
    if (pattern.endsWith('/*')) {
      const baseDir = path.join(workspaceRoot.rootDir, pattern.slice(0, -2))
      let entries: Dirent[]
      try {
        entries = await fs.readdir(baseDir, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          packageDirs.add(path.join(baseDir, entry.name))
        }
      }
      continue
    }

    packageDirs.add(path.join(workspaceRoot.rootDir, pattern))
  }

  await Promise.all(
    [...packageDirs].map(async (dir) => {
      const packageJsonPath = path.join(dir, 'package.json')
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as JsonObject
        if (typeof packageJson.name === 'string' && typeof packageJson.version === 'string') {
          versions.set(packageJson.name, packageJson.version)
        }
      } catch {
        // Ignore non-package workspace matches.
      }
    }),
  )

  return versions
}

const rewriteWorkspaceDependency = (
  packageName: string,
  spec: string,
  workspaceVersions: ReadonlyMap<string, string>,
) => {
  if (!spec.startsWith('workspace:')) {
    return spec
  }

  const resolvedVersion = workspaceVersions.get(packageName)
  if (!resolvedVersion) {
    throw new Error(`Unable to resolve workspace dependency version for "${packageName}".`)
  }

  const reference = spec.slice('workspace:'.length)
  if (reference === '' || reference === '*') {
    return resolvedVersion
  }
  if (reference === '^' || reference === '~') {
    return `${reference}${resolvedVersion}`
  }
  if (reference.startsWith('./') || reference.startsWith('../')) {
    throw new Error(`Unsupported workspace dependency specifier for "${packageName}": ${spec}`)
  }
  return reference
}

const rewriteDependencyMap = (
  value: JsonValue | undefined,
  workspaceVersions: ReadonlyMap<string, string>,
): JsonValue | undefined => {
  if (!isObject(value)) {
    return value
  }

  const rewritten: DependencyMap = {}
  for (const [packageName, spec] of Object.entries(value)) {
    if (typeof spec !== 'string') {
      continue
    }
    rewritten[packageName] = rewriteWorkspaceDependency(packageName, spec, workspaceVersions)
  }
  return rewritten as JsonValue
}

const assignJsonField = (target: JsonObject, field: string, value: JsonValue | undefined) => {
  if (value === undefined) {
    delete target[field]
    return
  }

  target[field] = value
}

export const createPublishPackageJson = (
  packageJson: Record<string, unknown>,
  workspaceVersions: ReadonlyMap<string, string> = new Map(),
) => {
  const publishConfig = isObject(packageJson.publishConfig) ? packageJson.publishConfig : {}

  const packageJsonFields = {
    ...pickFields(packageJson, PACKAGE_FIELD_SET),
    ...pickFields(publishConfig, PACKAGE_FIELD_SET),
  }

  const publishOnlyConfig = pickFields(publishConfig, PUBLISH_CONFIG_ONLY_FIELD_SET)

  if (typeof packageJsonFields.name !== 'string' || packageJsonFields.name.length === 0) {
    throw new Error('Published package.json requires a name field.')
  }

  if (typeof packageJsonFields.version !== 'string' || packageJsonFields.version.length === 0) {
    packageJsonFields.version = '0.0.0'
  }

  assignJsonField(
    packageJsonFields,
    'dependencies',
    rewriteDependencyMap(
      packageJsonFields.dependencies,
      workspaceVersions,
    ),
  )
  assignJsonField(
    packageJsonFields,
    'peerDependencies',
    rewriteDependencyMap(
      packageJsonFields.peerDependencies,
      workspaceVersions,
    ),
  )
  assignJsonField(
    packageJsonFields,
    'optionalDependencies',
    rewriteDependencyMap(
      packageJsonFields.optionalDependencies,
      workspaceVersions,
    ),
  )

  packageJsonFields.private = false

  if (Object.keys(publishOnlyConfig).length > 0) {
    packageJsonFields.publishConfig = publishOnlyConfig
  }

  return packageJsonFields
}

export const writeDistPackageJson = async (packageDir: string) => {
  const packageJsonPath = path.join(packageDir, 'package.json')
  const distDir = path.join(packageDir, 'dist')
  const distPackageJsonPath = path.join(distDir, 'package.json')
  const raw = await fs.readFile(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(raw) as JsonObject
  const workspaceVersions = await collectWorkspacePackageVersions(packageDir)
  const publishPackageJson = createPublishPackageJson(packageJson, workspaceVersions)

  await fs.mkdir(distDir, { recursive: true })
  await fs.writeFile(distPackageJsonPath, `${JSON.stringify(publishPackageJson, null, 2)}\n`)
  return distPackageJsonPath
}

const main = async () => {
  const packageDir = process.cwd()
  const writtenPath = await writeDistPackageJson(packageDir)
  console.log(path.relative(packageDir, writtenPath) || 'dist/package.json')
}

if (import.meta.main) {
  await main()
}
