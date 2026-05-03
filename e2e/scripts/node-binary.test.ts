import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { resolveNodeBinary } from './node-binary.ts'

test('resolves Node.js from PATH when the runner is launched by bun', () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'eclipsa-node-path-'))
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
