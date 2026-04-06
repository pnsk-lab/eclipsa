import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type ReleaseBump = 'major' | 'minor' | 'patch'
type ReleaseChannel = 'alpha' | 'beta'
type NpmTag = 'latest' | ReleaseChannel

type ParsedReleaseType = {
  channel: ReleaseChannel | null
  bump: ReleaseBump
}

type ParsedVersion = {
  raw: string
  major: number
  minor: number
  patch: number
  prereleaseLabel: string | null
  prereleaseNumber: number | null
  channel: ReleaseChannel | null
  isStable: boolean
}

type VersionCore = {
  major: number
  minor: number
  patch: number
}

type ResolveVersionPlanInput = {
  publishedVersions?: string[]
  releaseType: string
}

type ResolveVersionPlanResult = {
  version: string
  npmTag: NpmTag
}

type ResolveReleaseMetadataInput = {
  packageJsonPath: string
  packageKey: string
  releaseType: string
}

const RELEASE_TYPE_RE = /^(?:(alpha|beta)-)?(major|minor|patch)$/
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+)(?:\.(\d+))?)?(?:\+[0-9A-Za-z.-]+)?$/

export function parseReleaseType(releaseType: string): ParsedReleaseType {
  const match = RELEASE_TYPE_RE.exec(releaseType)
  if (!match) {
    throw new Error(
      `Invalid release type: ${releaseType}. Supported values: major, minor, patch, alpha-major, alpha-minor, alpha-patch, beta-major, beta-minor, beta-patch`,
    )
  }

  return {
    channel: (match[1] as ReleaseChannel | undefined) ?? null,
    bump: match[2] as ReleaseBump,
  }
}

export function parseVersion(version: string | undefined): ParsedVersion | null {
  if (typeof version !== 'string' || version.trim() === '') {
    return null
  }

  const match = VERSION_RE.exec(version.trim())
  if (!match) {
    return null
  }

  const prereleaseLabel = match[4] ?? null
  const prereleaseNumber = match[5] == null ? null : Number(match[5])
  const channel = prereleaseLabel === 'alpha' || prereleaseLabel === 'beta' ? prereleaseLabel : null

  return {
    raw: version.trim(),
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prereleaseLabel,
    prereleaseNumber,
    channel,
    isStable: prereleaseLabel == null,
  }
}

function compareCore(a: VersionCore, b: VersionCore): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function maxCore<T extends VersionCore>(versions: T[]): T | null {
  let current: T | null = null
  for (const version of versions) {
    if (current == null || compareCore(version, current) > 0) {
      current = version
    }
  }
  return current
}

function incrementCore(core: VersionCore, bump: ReleaseBump): VersionCore {
  if (bump === 'major') {
    return { major: core.major + 1, minor: 0, patch: 0 }
  }

  if (bump === 'minor') {
    return { major: core.major, minor: core.minor + 1, patch: 0 }
  }

  return { major: core.major, minor: core.minor, patch: core.patch + 1 }
}

function formatCore(core: VersionCore): string {
  return `${core.major}.${core.minor}.${core.patch}`
}

function toCore(version: VersionCore): VersionCore {
  return {
    major: version.major,
    minor: version.minor,
    patch: version.patch,
  }
}

function filterVersionsByCore<T extends VersionCore>(versions: T[], core: VersionCore): T[] {
  return versions.filter((version) => compareCore(version, core) === 0)
}

function maxPrereleaseNumber(versions: ParsedVersion[]): number {
  let current = -1
  for (const version of versions) {
    if (Number.isInteger(version.prereleaseNumber) && version.prereleaseNumber > current) {
      current = version.prereleaseNumber
    }
  }
  return current
}

export function resolveVersionPlan({
  publishedVersions,
  releaseType,
}: ResolveVersionPlanInput): ResolveVersionPlanResult {
  const release = parseReleaseType(releaseType)
  const parsedPublished = (publishedVersions ?? [])
    .map((version) => parseVersion(version))
    .filter((version): version is ParsedVersion => version != null)
  const stablePublished = parsedPublished.filter((version) => version.isStable)
  const stableBase = maxCore(stablePublished) ?? {
    major: 0,
    minor: 0,
    patch: 0,
  }
  const targetCore = incrementCore(toCore(stableBase), release.bump)

  if (release.channel == null) {
    return {
      version: formatCore(targetCore),
      npmTag: 'latest',
    }
  }

  const matchingPublishedSeries = filterVersionsByCore(
    parsedPublished.filter((version) => version.channel === release.channel),
    targetCore,
  )

  if (matchingPublishedSeries.length > 0) {
    return {
      version: `${formatCore(targetCore)}-${release.channel}.${maxPrereleaseNumber(matchingPublishedSeries) + 1}`,
      npmTag: release.channel,
    }
  }

  if (stablePublished.length === 0) {
    const channelPublishedVersions = parsedPublished.filter(
      (version) =>
        version.channel === release.channel && Number.isInteger(version.prereleaseNumber),
    )

    if (channelPublishedVersions.length > 0) {
      const latestChannelCore = toCore(maxCore(channelPublishedVersions)!)
      const currentSeries = filterVersionsByCore(channelPublishedVersions, latestChannelCore)

      return {
        version: `${formatCore(latestChannelCore)}-${release.channel}.${maxPrereleaseNumber(currentSeries) + 1}`,
        npmTag: release.channel,
      }
    }

  }

  return {
    version: `${formatCore(targetCore)}-${release.channel}.0`,
    npmTag: release.channel,
  }
}

function readPackageJson(packageJsonPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>
}

function fetchPublishedVersions(packageName: string): string[] {
  try {
    const output = execFileSync('npm', ['view', packageName, 'versions', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    }).trim()

    if (output === '') {
      return []
    }

    const parsed = JSON.parse(output) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string')
    }

    if (typeof parsed === 'string') {
      return [parsed]
    }

    return []
  } catch {
    return []
  }
}

function parseCliArgs(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const key = arg.slice(2)
    const value = argv[index + 1]
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }

    options[key] = value
    index += 1
  }

  return options
}

export function resolveReleaseMetadata({
  packageJsonPath,
  packageKey,
  releaseType,
}: ResolveReleaseMetadataInput): {
  packageKey: string
  packageName: string
  version: string
  npmTag: NpmTag
  tag: string
} {
  const pkg = readPackageJson(packageJsonPath)
  const packageName =
    typeof pkg.name === 'string' && pkg.name.trim() !== '' ? pkg.name.trim() : null

  if (packageName == null) {
    throw new Error(`package.json does not contain a valid name field: ${packageJsonPath}`)
  }

  const versionPlan = resolveVersionPlan({
    publishedVersions: fetchPublishedVersions(packageName),
    releaseType,
  })

  return {
    packageKey,
    packageName,
    version: versionPlan.version,
    npmTag: versionPlan.npmTag,
    tag: `${packageKey}@${versionPlan.version}`,
  }
}

function runCli(): void {
  const options = parseCliArgs(process.argv.slice(2))
  const packageJsonPath = options['package-json']
  const packageKey = options['package-key']
  const releaseType = options['release-type']

  if (!packageJsonPath || !packageKey || !releaseType) {
    throw new Error(
      'Usage: bun scripts/release/resolve-release-metadata.ts --package-json <path> --package-key <key> --release-type <type>',
    )
  }

  const metadata = resolveReleaseMetadata({
    packageJsonPath: resolve(packageJsonPath),
    packageKey,
    releaseType,
  })

  process.stdout.write(`${JSON.stringify(metadata)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
}
