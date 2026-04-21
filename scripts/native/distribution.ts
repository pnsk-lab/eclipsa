import { access, chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { writeDistPackageJson } from '../release/write-dist-package-json.ts'

export interface NativeDistributionFile {
  destination: string
  executable?: boolean
  source: string
}

export interface NativeDistributionTarget {
  arch: string
  entrypoint: string
  files: NativeDistributionFile[]
  id: string
  os: string
}

export interface NativeDistributionConfig {
  assets?: NativeDistributionFile[]
  bundleDir?: string
  targets?: NativeDistributionTarget[]
}

export interface NativeDistributionManifestTarget {
  arch: string
  entrypoint: string
  files: string[]
  id: string
  os: string
}

export interface NativeDistributionManifest {
  assets: string[]
  bundleDir: string
  formatVersion: 1
  packageName: string
  targets: NativeDistributionManifestTarget[]
}

interface NativeDistributionPackageJson {
  eclipsaNative?: NativeDistributionConfig
  name?: string
}

export interface PrepareNativeDistOptions {
  strictHostArtifacts?: boolean
}

export interface PreparedNativeDist {
  distPackageJsonPath: string
  hostManifestPath: string | null
  manifest: NativeDistributionManifest | null
}

const DEFAULT_BUNDLE_DIR = 'host'

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const normalizeBundlePath = (value: string) => value.replace(/\\/g, '/').replace(/^\.?\//, '')

const toManifestPath = (value: string) => `./${normalizeBundlePath(value)}`

const copyConfiguredFile = async (
  packageDir: string,
  bundleDir: string,
  file: NativeDistributionFile,
) => {
  const sourcePath = path.resolve(packageDir, file.source)
  const destinationPath = path.resolve(bundleDir, normalizeBundlePath(file.destination))
  await mkdir(path.dirname(destinationPath), { recursive: true })
  await copyFile(sourcePath, destinationPath)
  if (file.executable) {
    await chmod(destinationPath, 0o755)
  }
  return toManifestPath(file.destination)
}

const readNativeDistributionConfig = async (packageDir: string) => {
  const packageJsonPath = path.join(packageDir, 'package.json')
  const packageJson = JSON.parse(
    await readFile(packageJsonPath, 'utf8'),
  ) as NativeDistributionPackageJson
  return {
    config: packageJson.eclipsaNative ?? null,
    packageName: packageJson.name ?? '',
  }
}

export const prepareNativeDist = async (
  packageDir: string,
  options: PrepareNativeDistOptions = {},
): Promise<PreparedNativeDist> => {
  const distPackageJsonPath = await writeDistPackageJson(packageDir)
  const { config, packageName } = await readNativeDistributionConfig(packageDir)

  if (!config) {
    return {
      distPackageJsonPath,
      hostManifestPath: null,
      manifest: null,
    }
  }

  const distDir = path.dirname(distPackageJsonPath)
  const bundleDirName = normalizeBundlePath(config.bundleDir ?? DEFAULT_BUNDLE_DIR)
  const bundleDir = path.join(distDir, bundleDirName)
  const hostManifestPath = path.join(bundleDir, 'manifest.json')
  const missingSources: string[] = []
  const assets: string[] = []
  const manifestTargets: NativeDistributionManifestTarget[] = []

  await rm(bundleDir, { force: true, recursive: true })
  await mkdir(bundleDir, { recursive: true })

  for (const asset of config.assets ?? []) {
    const sourcePath = path.resolve(packageDir, asset.source)
    if (!(await fileExists(sourcePath))) {
      missingSources.push(path.relative(packageDir, sourcePath) || asset.source)
      continue
    }
    assets.push(await copyConfiguredFile(packageDir, bundleDir, asset))
  }

  for (const target of config.targets ?? []) {
    const missingTargetSources = await Promise.all(
      target.files.map(async (file) => {
        const sourcePath = path.resolve(packageDir, file.source)
        return (await fileExists(sourcePath))
          ? null
          : path.relative(packageDir, sourcePath) || file.source
      }),
    )
    const missingForTarget = missingTargetSources.filter((value): value is string => value != null)
    if (missingForTarget.length > 0) {
      missingSources.push(...missingForTarget)
      continue
    }

    const files = await Promise.all(
      target.files.map((file) => copyConfiguredFile(packageDir, bundleDir, file)),
    )
    manifestTargets.push({
      arch: target.arch,
      entrypoint: toManifestPath(target.entrypoint),
      files,
      id: target.id,
      os: target.os,
    })
  }

  if (missingSources.length > 0 && options.strictHostArtifacts) {
    throw new Error(
      `Missing native host artifacts for ${packageName || packageDir}: ${[...new Set(missingSources)].join(', ')}`,
    )
  }

  const manifest: NativeDistributionManifest = {
    assets,
    bundleDir: `./${bundleDirName}`,
    formatVersion: 1,
    packageName,
    targets: manifestTargets,
  }

  await writeFile(hostManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  return {
    distPackageJsonPath,
    hostManifestPath,
    manifest,
  }
}
