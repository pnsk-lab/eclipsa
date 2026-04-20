import { access, copyFile, mkdir, opendir, readFile } from 'node:fs/promises'
import path from 'node:path'

const MATCHED_ARTIFACT_NAMES = [
  /^optimizer\..+\.node$/,
  /^optimizer\..+\.wasm$/,
  /^optimizer\..+\.cjs$/,
  /^optimizer\.wasi-browser\.js$/,
  /^wasi-worker(?:-browser)?\.mjs$/,
]

export const shouldFlattenArtifact = (fileName: string) =>
  MATCHED_ARTIFACT_NAMES.some((pattern) => pattern.test(fileName))

const sameFileContent = async (leftPath: string, rightPath: string) => {
  const [left, right] = await Promise.all([readFile(leftPath), readFile(rightPath)])
  return left.equals(right)
}

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const walkFiles = async function* (rootDir: string): AsyncGenerator<string> {
  const directory = await opendir(rootDir)
  for await (const entry of directory) {
    const entryPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      yield* walkFiles(entryPath)
      continue
    }
    if (entry.isFile()) {
      yield entryPath
    }
  }
}

export const prepareDownloadedArtifacts = async (artifactsDir = path.resolve('artifacts')) => {
  await mkdir(artifactsDir, { recursive: true })

  for await (const sourcePath of walkFiles(artifactsDir)) {
    const fileName = path.basename(sourcePath)
    if (!shouldFlattenArtifact(fileName)) {
      continue
    }

    const targetPath = path.join(artifactsDir, fileName)
    if (sourcePath === targetPath) {
      continue
    }

    if (await fileExists(targetPath)) {
      if (await sameFileContent(sourcePath, targetPath)) {
        continue
      }
      throw new Error(`Conflicting artifact contents for ${fileName}`)
    }

    await copyFile(sourcePath, targetPath)
  }
}

const parseArtifactsDirArg = (argv: string[]) => {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--artifacts-dir') {
      return path.resolve(argv[index + 1] ?? '')
    }
  }
  return path.resolve('artifacts')
}

if (import.meta.main) {
  await prepareDownloadedArtifacts(parseArtifactsDirArg(process.argv.slice(2)))
}
