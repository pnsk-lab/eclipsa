import { expect, test } from 'bun:test'
import {
  getBenchCommand,
  getBuildFrameworkCommand,
  getCloneCommand,
  getInstallCommand,
  getInstallFrameworkCommand,
  getInstallWebdriverCommand,
} from './run.js'

test('commands are stable', () => {
  expect(getCloneCommand()).toContain('js-framework-benchmark.git')
  expect(getInstallCommand()).toBe('npm install --no-audit --no-fund')
  expect(getInstallWebdriverCommand()).toBe('npm install --ignore-scripts --no-audit --no-fund && npm run compile')
  expect(getInstallFrameworkCommand()).toBe('npm install --ignore-scripts --no-audit --no-fund')
  expect(getBuildFrameworkCommand()).toBe('npm run build-prod')
  expect(getBenchCommand('/usr/bin/google-chrome')).toBe(
    'npm run bench -- --runner playwright --headless true --chromeBinary /usr/bin/google-chrome keyed/eclipsa',
  )
})
