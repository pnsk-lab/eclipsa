import { expect, test } from 'vitest'
import docsPackageJson from '../../docs/package.json' with { type: 'json' }
import rootPackageJson from '../../package.json' with { type: 'json' }
import contentPackageJson from '../../packages/content/package.json' with { type: 'json' }
import createEclipsaPackageJson from '../../packages/create-eclipsa/package.json' with { type: 'json' }
import eclipsaPackageJson from '../../packages/eclipsa/package.json' with { type: 'json' }
import imagePackageJson from '../../packages/image/package.json' with { type: 'json' }
import markdownPackageJson from '../../packages/markdown/package.json' with { type: 'json' }
import motionPackageJson from '../../packages/motion/package.json' with { type: 'json' }
import optimizerPackageJson from '../../packages/optimizer/package.json' with { type: 'json' }
import reactPackageJson from '../../packages/react/package.json' with { type: 'json' }
import vuePackageJson from '../../packages/vue/package.json' with { type: 'json' }

const coverageCommand =
  'c8 --reporter=lcov --reporter=json-summary --reporter=text bunx vp test --run'

test('workspace packages expose a coverage script for CI uploads', () => {
  expect(rootPackageJson.scripts['test:coverage']).toBe('turbo run test:coverage')

  expect(docsPackageJson.scripts['test:coverage']).toBe(
    'c8 --reporter=lcov --reporter=json-summary --reporter=text bunx vitest run',
  )
  expect(contentPackageJson.scripts['test:coverage']).toBe(coverageCommand)
  expect(createEclipsaPackageJson.scripts['test:coverage']).toBe(coverageCommand)
  expect(eclipsaPackageJson.scripts['test:coverage']).toBe(
    'bun run --filter @eclipsa/optimizer build:native:dev && c8 --reporter=lcov --reporter=json-summary --reporter=text bunx vp test --run',
  )
  expect(imagePackageJson.scripts['test:coverage']).toBe(coverageCommand)
  expect(markdownPackageJson.scripts['test:coverage']).toBe(coverageCommand)
  expect(motionPackageJson.scripts['test:coverage']).toBe(coverageCommand)
  expect(optimizerPackageJson.scripts['test:coverage']).toBe(
    'bun run build:native:dev && c8 --reporter=lcov --reporter=json-summary --reporter=text bunx vp test --run',
  )
  expect(reactPackageJson.scripts['test:coverage']).toBe(coverageCommand)
  expect(vuePackageJson.scripts['test:coverage']).toBe(coverageCommand)
})
