#!/usr/bin/env bun
import path from 'node:path'
import process from 'node:process'
import { prepareNativeDist } from './distribution.ts'

const main = async () => {
  const packageDir = process.cwd()
  const strictHostArtifacts =
    process.env.ECLIPSA_NATIVE_REQUIRE_HOST_ARTIFACTS === '1' ||
    process.env.ECLIPSA_NATIVE_REQUIRE_HOST_ARTIFACTS === 'true'
  const prepared = await prepareNativeDist(packageDir, {
    strictHostArtifacts,
  })

  if (!prepared.hostManifestPath) {
    console.log(path.relative(packageDir, prepared.distPackageJsonPath) || 'dist/package.json')
    return
  }

  console.log(
    [
      path.relative(packageDir, prepared.distPackageJsonPath) || 'dist/package.json',
      path.relative(packageDir, prepared.hostManifestPath) || 'dist/host/manifest.json',
    ].join('\n'),
  )
}

if (import.meta.main) {
  await main()
}
