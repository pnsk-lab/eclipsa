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
  return nextStepOffset === -1
    ? source.slice(start)
    : source.slice(start, start + marker.length + nextStepOffset)
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

  it('creates releases from the workflow commit without pushing version bumps back to git', async () => {
    const workflow = await fs.readFile(workflowPath, 'utf8')

    expect(workflow).not.toContain('Commit and push version update')
    expect(workflow).not.toContain('git push origin "HEAD:${{ github.ref_name }}"')
    expect(workflow).toContain("--target '${{ github.sha }}'")
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

  it('skips the optimizer root package when the target version is already published', async () => {
    const workflow = await fs.readFile(workflowPath, 'utf8')
    const step = extractStep(workflow, 'Publish optimizer package')

    expect(step).toContain('npm view "${package_name}@${package_version}" version --json')
    expect(step).toContain('Skipping already published package: ${package_name}@${package_version}')
  })

  it('skips optimizer native packages that are already published at the target version', async () => {
    const workflow = await fs.readFile(workflowPath, 'utf8')
    const step = extractStep(workflow, 'Publish optimizer native packages')

    expect(step).toContain('npm view "${package_name}@${package_version}" version --json')
    expect(step).toContain('Skipping already published package: ${package_name}@${package_version}')
  })
})
