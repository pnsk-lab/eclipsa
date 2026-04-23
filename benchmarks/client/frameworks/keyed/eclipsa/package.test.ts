import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'bun:test'

const packageJson = JSON.parse(readFileSync(resolve(import.meta.dir, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  ['js-framework-benchmark']?: {
    frameworkVersion?: string
    frameworkVersionFromPackage?: string
  }
}

test('benchmark metadata uses an explicit framework version for the local workspace build', () => {
  expect(packageJson['js-framework-benchmark']?.frameworkVersion).toBe('0.0.0')
  expect(packageJson['js-framework-benchmark']?.frameworkVersionFromPackage).toBeUndefined()
})

test('benchmark package installs the local Eclipsa workspace as a normal dependency', () => {
  expect(packageJson.dependencies?.eclipsa).toBe('file:../../../../../packages/eclipsa')
})
