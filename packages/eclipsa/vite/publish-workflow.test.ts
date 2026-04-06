import * as fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const workflowPath = new URL('../../../.github/workflows/publish.yml', import.meta.url)

const extractStep = (source: string, stepName: string) => {
  const marker = `- name: ${stepName}`
  const start = source.indexOf(marker)
  if (start === -1) {
    throw new Error(`Step not found: ${stepName}`)
  }

  const rest = source.slice(start + marker.length)
  const nextStepOffset = rest.search(/\n\s+- name: /)
  return nextStepOffset === -1 ? source.slice(start) : source.slice(start, start + marker.length + nextStepOffset)
}

describe('publish workflow', () => {
  it('offers content and motion as releasable packages', async () => {
    const workflow = await fs.readFile(workflowPath, 'utf8')

    expect(workflow).toContain('          - content')
    expect(workflow).toContain('          - motion')
    expect(workflow).toContain('            content)')
    expect(workflow).toContain('              package_dir="packages/content"')
    expect(workflow).toContain('            motion)')
    expect(workflow).toContain('              package_dir="packages/motion"')
  })

  it('uses trusted publishing instead of npm tokens for every publish step', async () => {
    const workflow = await fs.readFile(workflowPath, 'utf8')
    const publishSteps = [
      'Publish optimizer native packages',
      'Publish optimizer package',
      'Publish eclipsa package',
      'Publish package tarball to npm',
    ]

    for (const step of publishSteps) {
      expect(extractStep(workflow, step)).not.toContain('NODE_AUTH_TOKEN')
    }
  })

  it('publishes the optimizer root package from a packed tarball', async () => {
    const workflow = await fs.readFile(workflowPath, 'utf8')

    expect(extractStep(workflow, 'Pack optimizer tarball')).toContain(
      'bun ./scripts/sync-package-manifest.ts publish',
    )
    expect(extractStep(workflow, 'Pack optimizer tarball')).toContain('bun pm pack --quiet')
    expect(extractStep(workflow, 'Publish optimizer package')).toContain(
      "npm publish '${{ steps.pack_optimizer.outputs.path }}' --provenance --access public",
    )
  })
})
