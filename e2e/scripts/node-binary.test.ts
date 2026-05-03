import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { resolveNodeBinary } from './node-binary.ts'

const createFixtureDir = () => {
  const fixtureDir = path.join(process.cwd(), `eclipsa-node-path-${randomUUID()}.tmp`)
  mkdirSync(fixtureDir, { recursive: true })
  return fixtureDir
}

test('resolves Node.js from PATH when the runner is launched by bun', () => {
  const fixtureDir = createFixtureDir()
  const nodePath = path.join(fixtureDir, 'node')
  writeFileSync(nodePath, '')
  chmodSync(nodePath, 0o755)

  try {
    expect(
      resolveNodeBinary({
        cwd: '/workspace/e2e',
        env: { PATH: fixtureDir },
        execPath: path.join(fixtureDir, 'bun'),
        homeDir: path.join(fixtureDir, 'home'),
      }),
    ).toBe(nodePath)
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true })
  }
})

test('resolves node.exe from PATH on Windows-like environments', () => {
  const fixtureDir = createFixtureDir()
  const nodePath = path.join(fixtureDir, 'node.exe')
  writeFileSync(nodePath, '')
  chmodSync(nodePath, 0o755)

  try {
    expect(
      resolveNodeBinary({
        cwd: '/workspace/e2e',
        env: { PATH: fixtureDir },
        execPath: path.join(fixtureDir, 'bun.exe'),
        homeDir: path.join(fixtureDir, 'home'),
      }),
    ).toBe(nodePath)
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true })
  }
})
