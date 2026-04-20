import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const skillDir = new URL('../skills/eclipsa/', import.meta.url)

describe('eclipsa skill', () => {
  it('routes common requests to the right rule files and states compiler constraints', async () => {
    const skill = await readFile(new URL('./SKILL.md', skillDir), 'utf8')

    expect(skill).toContain('## Common Requests')
    expect(skill).toContain('rules/data-loading-and-actions.md')
    expect(skill).toContain('rules/resume-and-ssr.md')
    expect(skill).toContain('Keep `loader()` and `action()` at module scope')
    expect(skill).toContain('Call `useSignal()` at the top level of the component body')
  })

  it('includes concrete routing, state, and resume code snippets', async () => {
    const [routing, state, resume] = await Promise.all([
      readFile(new URL('./rules/routing-and-navigation.md', skillDir), 'utf8'),
      readFile(new URL('./rules/state-and-lifecycle.md', skillDir), 'utf8'),
      readFile(new URL('./rules/resume-and-ssr.md', skillDir), 'utf8'),
    ])

    expect(routing).toContain('const NavLink = (props: { href: string; label: string }) => {')
    expect(routing).toContain('await navigate(`/search?q=${encodeURIComponent(query.value)}`)')
    expect(state).toContain('const inputRef = useSignal<HTMLInputElement | undefined>()')
    expect(state).toContain('onMount(() => {')
    expect(resume).toContain('resumeContainer(document)')
    expect(resume).toContain("window.matchMedia('(prefers-color-scheme: dark)')")
  })

  it('includes concrete loader, action, metadata, and starter examples', async () => {
    const [gettingStarted, data, metadata] = await Promise.all([
      readFile(new URL('./rules/getting-started.md', skillDir), 'utf8'),
      readFile(new URL('./rules/data-loading-and-actions.md', skillDir), 'utf8'),
      readFile(new URL('./rules/metadata-and-server.md', skillDir), 'utf8'),
    ])

    expect(gettingStarted).toContain('<Link href="/dashboard">Open the dashboard</Link>')
    expect(data).toContain('const useTeamLoader = loader(requestMeta, async (c) => {')
    expect(data).toContain('const useSaveProfile = action(async (c) => {')
    expect(data).toContain('<saveProfile.Form class="stack">')
    expect(metadata).toContain('export const metadata = ({ url }: MetadataContext) => ({')
    expect(metadata).toContain('export default function Root(props: SSRRootProps)')
    expect(metadata).toContain('const app = new Hono()')
  })
})
