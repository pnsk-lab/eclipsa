import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { filterNapiStderrLines, resolveNapiTypeDefTempFolder } from './run-napi.ts'

describe('run-napi helper', () => {
  it('matches the napi cli temp type definition folder naming', () => {
    const folder = resolveNapiTypeDefTempFolder(
      '/tmp/eclipsa-target',
      'eclipsa_compiler',
      '/workspace/packages/eclipsa/compiler/rust/Cargo.toml',
      '3.5.1',
    )

    expect(folder).toBe(path.join('/tmp/eclipsa-target', 'napi-rs', 'eclipsa_compiler-1fb2df07'))
  })

  it('suppresses the known noisy missing temp type definition warnings', () => {
    const filtered = filterNapiStderrLines(
      [
        'Compiling eclipsa_compiler v0.1.0',
        'Failed to write type def file: Os { code: 2, kind: NotFound, message: "No such file or directory" }',
        'Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.71s',
      ].join('\n'),
    )

    expect(filtered.suppressedCount).toBe(1)
    expect(filtered.forwarded).toContain('Compiling eclipsa_compiler')
    expect(filtered.forwarded).toContain('Finished `dev` profile')
    expect(filtered.forwarded).not.toContain('Failed to write type def file')
  })
})
