import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const testDir = path.dirname(fileURLToPath(import.meta.url))

const hmrSvgPagePath = path.resolve(testDir, '../app/hmr-svg/+page.tsx')
const hmrBeforeLabel = 'svg hmr before'
const hmrAfterLabel = 'svg hmr after'
const imagePagePath = path.resolve(testDir, '../app/image/+page.tsx')
const imageHmrBeforeLabel = 'Responsive image metadata should survive navigation, resume, and HMR.'
const imageHmrAfterLabel =
  'Responsive image metadata should survive navigation, resume, HMR, and page transitions.'
const contentMarkdownPath = path.resolve(testDir, '../app/content/docs/guide/getting-started.md')
const contentBodyBeforeLabel = 'Content body before.'
const contentBodyAfterLabel = 'Content body after.'
const contentDescriptionBeforeLabel = 'Content description before'
const contentDescriptionAfterLabel = 'Content description after'
const homePagePath = path.resolve(testDir, '../app/+page.tsx')
const homeHmrBeforeLabel = 'Go to counter with navigate()'
const homeHmrAfterLabel = 'Go to counter with navigate()!'
const sidebarShellLayoutPath = path.resolve(testDir, '../app/sidebar-shell/+layout.tsx')
const sidebarShellBeforeTitle = "title: 'Materials'"
const sidebarShellAfterTitle = "title: 'Materials HMR'"
const hmrTimeout = 15_000
const writeSourceAtomically = async (filePath: string, source: string) => {
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, source)
  await rename(tempPath, filePath)
}

const waitForResumedRoute = async (page: Page) => {
  await expect(page.locator('body')).toHaveAttribute('data-e-resume', 'resumed')
  await page.waitForTimeout(250)
}

test.describe('example app in dev mode', () => {
  test.describe.configure({ mode: 'serial' })

  test('renders the SSR shell and adds todos after resume', async ({ page }) => {
    await page.goto('/')
    const propComponentContent = page.getByText('Prop component content')
    const childrenComponentContent = page.getByText('Children component content')

    await expect(page).toHaveTitle('Home | E2E')
    await expect(page.getByRole('heading', { name: 'Todo List' })).toBeVisible()
    await expect(page.getByText('Shared layout shell updated')).toBeVisible()
    await expect(propComponentContent).toHaveCount(2)
    await expect(propComponentContent.first()).toBeVisible()
    await expect(childrenComponentContent).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(1)
    await expect(page.getByRole('listitem').first()).toHaveText('ToDo1')

    const input = page.getByRole('textbox')
    await input.fill('Ship e2e')
    await page.getByRole('button', { name: 'Add' }).click()

    await expect(page.getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('listitem').nth(1)).toHaveText('Ship e2e')
    await expect(input).toHaveValue('')
  })

  test('composes metadata on SSR and updates it on client navigation', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Home | E2E')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'E2E layout description',
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'E2E Home OG',
    )

    await page.getByRole('link', { name: 'Actions', exact: true }).click()

    await expect(page).toHaveURL(/\/actions$/)
    await expect(page).toHaveTitle('Actions | /actions')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', '/actions')
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'E2E Actions OG',
    )
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'E2E layout description',
    )
  })

  test('keeps layout state across Link navigation', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /^Layout count:\s*0$/ }).click()
    await expect(page.getByRole('button', { name: /^Layout count:\s*1$/ })).toBeVisible()

    await page.getByRole('link', { name: 'Open counter with Link' }).click()

    await expect(page).toHaveURL(/\/counter$/)
    await expect(page.getByText('Counter page')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Layout count:\s*1$/ })).toBeVisible()

    await page.getByRole('link', { name: 'Back home with Link' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: /^Layout count:\s*1$/ })).toBeVisible()
  })

  test('restores the previous route when using the browser back button', async ({ page }) => {
    await page.goto('/')
    await waitForResumedRoute(page)

    await page.getByRole('link', { name: 'Open counter with Link' }).click()

    await expect(page).toHaveURL(/\/counter$/)
    await expect(page.getByText('Counter page')).toBeVisible()

    await page.goBack()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Go to counter with navigate()' })).toBeVisible()
    await expect(page.getByText('Counter page')).toHaveCount(0)
  })

  test('does not duplicate route content when navigate() returns into a shared layout', async ({
    page,
  }) => {
    await page.goto('/')
    await waitForResumedRoute(page)

    await page.getByRole('button', { name: /^Layout count:\s*0$/ }).click()
    await expect(page.getByRole('button', { name: /^Layout count:\s*1$/ })).toBeVisible()
    await page.getByRole('button', { name: 'Go to counter with navigate()' }).click()

    await expect(page).toHaveURL(/\/counter$/)
    await expect(page.getByText('Counter page')).toHaveCount(1)

    await page.getByRole('button', { name: 'Back home with navigate()' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Counter page')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Open counter with Link' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /^Layout count:\s*1$/ })).toBeVisible()
  })

  test('runs route middleware redirects during Link navigation without dropping layout state', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /^Layout count:\s*0$/ }).click()
    await expect(page.getByRole('button', { name: /^Layout count:\s*1$/ })).toBeVisible()

    await page.getByRole('link', { name: 'Open guarded route with Link' }).click()

    await expect(page).toHaveURL(/\/counter$/)
    await expect(page.getByText('Counter page')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Layout count:\s*1$/ })).toBeVisible()
  })

  test('allows guarded routes on full requests when middleware passes', async ({ page }) => {
    await page.goto('/guarded?allow=1')

    await expect(page).toHaveURL(/\/guarded\?allow=1$/)
    await expect(page.getByText('Guarded page')).toBeVisible()
  })

  test('prefetches route data on link intent and reuses prefetched loader state on navigation', async ({
    page,
  }) => {
    const routeDataRequests: string[] = []
    const loaderRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (
        url.pathname === '/__eclipsa/route-data' &&
        new URL(url.searchParams.get('href')!, page.url()).pathname === '/actions'
      ) {
        routeDataRequests.push(request.url())
      }
      if (url.pathname.startsWith('/__eclipsa/loader/')) {
        loaderRequests.push(url.pathname)
      }
    })

    await page.goto('/')
    routeDataRequests.length = 0
    loaderRequests.length = 0

    await page.getByRole('link', { name: 'Open actions without prefetch' }).hover()
    await page.waitForTimeout(250)
    expect(routeDataRequests).toHaveLength(0)

    const actionsLink = page.getByRole('link', { name: 'Actions', exact: true })

    await actionsLink.hover()
    await expect.poll(() => routeDataRequests.length).toBeGreaterThan(0)

    routeDataRequests.length = 0
    loaderRequests.length = 0

    await actionsLink.click()

    await expect(page).toHaveURL(/\/actions$/)
    await expect(page.getByText(/loader data:\s*loader-ready/)).toBeVisible()
    await expect.poll(() => routeDataRequests.length).toBe(0)
    await expect.poll(() => loaderRequests.length).toBe(0)
  })

  test('updates loader-backed catch-all content inside a shared layout on Link navigation', async ({
    page,
  }) => {
    await page.goto('/loader-nav/overview')

    await expect(page).toHaveURL(/\/loader-nav\/overview$/)
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()
    await expect(page.getByTestId('loader-nav-overview-state')).toHaveText(' active')
    await expect(page.getByTestId('loader-nav-quick-start-state')).toHaveText(' inactive')
    await expect(page.getByTestId('loader-nav-overview-state-link')).toHaveClass(/active/)
    await expect(page.getByTestId('loader-nav-quick-start-state-link')).toHaveClass(/inactive/)
    await page.getByRole('link', { name: /Quick Start/ }).click()

    await expect(page).toHaveURL(/\/loader-nav\/quick-start$/)
    await expect(page.getByRole('heading', { name: 'quick-start' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'overview' })).toHaveCount(0)
    await expect(page.getByTestId('loader-nav-overview-state')).toHaveText(' inactive')
    await expect(page.getByTestId('loader-nav-quick-start-state')).toHaveText(' active')
    await expect(page.getByTestId('loader-nav-overview-state-link')).toHaveClass(/inactive/)
    await expect(page.getByTestId('loader-nav-quick-start-state-link')).toHaveClass(/active/)
    await expect(page.locator('a[href="/loader-nav/quick-start"]')).toHaveCount(1)
  })

  test('keeps shared-layout loader-nav links stable across repeated Link navigation', async ({
    page,
  }) => {
    await page.goto('/loader-nav/overview')

    await expect(page).toHaveURL(/\/loader-nav\/overview$/)
    await page.locator('a[href="/loader-nav/quick-start"]').click()

    await expect(page).toHaveURL(/\/loader-nav\/quick-start$/)
    await expect(page.locator('a[href="/loader-nav/overview"]')).toHaveCount(1)
    await expect(page.locator('a[href="/loader-nav/quick-start"]')).toHaveCount(1)

    await page.locator('a[href="/loader-nav/overview"]').click()

    await expect(page).toHaveURL(/\/loader-nav\/overview$/)
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()
    await expect(page.locator('a[href="/loader-nav/overview"]')).toHaveCount(1)
    await expect(page.locator('a[href="/loader-nav/quick-start"]')).toHaveCount(1)
  })

  test('scrolls to hash targets during client-side same-route Link navigation', async ({
    page,
  }) => {
    await page.goto('/hash-nav')
    await waitForResumedRoute(page)

    await expect(page).toHaveURL(/\/hash-nav$/)
    await expect(
      page
        .locator('[data-testid="hash-nav-target"]')
        .evaluate((element) => element.getBoundingClientRect().top),
    ).resolves.toBeGreaterThan(2000)

    await page.getByRole('link', { name: 'Jump to deep dive' }).click()

    await expect(page).toHaveURL(/\/hash-nav#deep-dive$/)
    await expect.poll(async () => await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
    await expect
      .poll(
        async () =>
          await page.locator('[data-testid="hash-nav-target"]').evaluate((element) => {
            const top = element.getBoundingClientRect().top
            return top >= 0 && top < window.innerHeight
          }),
      )
      .toBe(true)
  })

  test('updates shared layout-owned location state on Link navigation', async ({ page }) => {
    await page.goto('/layout-location/overview')

    await expect(page).toHaveURL(/\/layout-location\/overview$/)
    await expect(page.getByRole('heading', { name: 'layout overview' })).toBeVisible()
    await expect(page.getByTestId('layout-location-state')).toHaveText('overview-active')
    await expect(page.getByTestId('layout-location-nav')).toHaveClass(/overview/)
    await expect(page.getByTestId('layout-location-nav')).toHaveClass(/active/)

    await page.getByRole('link', { name: 'Docs', exact: true }).click()

    await expect(page).toHaveURL(/\/layout-location\/docs$/)
    await expect(page.getByRole('heading', { name: 'layout docs' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'layout overview' })).toHaveCount(0)
    await expect(page.getByTestId('layout-location-state')).toHaveText('docs-active')
    await expect(page.getByTestId('layout-location-nav')).toHaveClass(/docs/)
    await expect(page.getByTestId('layout-location-nav')).toHaveClass(/inactive/)
  })

  test('hydrates React islands and keeps projected Eclipsa content live', async ({ page }) => {
    await page.goto('/react')

    await expect(page).toHaveTitle('React Island | E2E')
    await expect(page.getByRole('heading', { name: 'React island' })).toBeVisible()
    await expect(page.getByTestId('react-ssr-copy')).toBeVisible()
    await expect(page.getByTestId('react-projected-value')).toHaveText('0')

    await waitForResumedRoute(page)

    await page.getByRole('button', { name: 'Increment React' }).click()
    await expect(page.getByTestId('react-island-count')).toHaveText('React count:1')

    await page.getByRole('button', { name: 'Increment projected React child' }).click()
    await expect(page.getByTestId('react-projected-value')).toHaveText('1')
    await expect(page.getByTestId('react-island-count')).toHaveText('React count:1')
  })

  test('hydrates Vue islands and keeps projected Eclipsa content live', async ({ page }) => {
    await page.goto('/vue')

    await expect(page).toHaveTitle('Vue Island | E2E')
    await expect(page.getByRole('heading', { name: 'Vue island' })).toBeVisible()
    await expect(page.getByTestId('vue-ssr-copy')).toBeVisible()
    await expect(page.getByTestId('vue-projected-value')).toHaveText('0')

    await waitForResumedRoute(page)

    await page.getByRole('button', { name: 'Increment Vue' }).click()
    await expect(page.getByTestId('vue-island-count')).toHaveText('Vue count:1')

    await page.getByRole('button', { name: 'Increment projected Vue child' }).click()
    await expect(page.getByTestId('vue-projected-value')).toHaveText('1')
    await expect(page.getByTestId('vue-island-count')).toHaveText('Vue count:1')
  })

  test('runs motion enter/exit and shared layout flows', async ({ page }) => {
    await page.goto('/motion')
    await waitForResumedRoute(page)

    await expect(page).toHaveTitle('Motion | E2E')
    await expect(page.getByRole('heading', { name: 'Motion Playground' })).toBeVisible()
    await expect(page.getByTestId('motion-card')).toBeVisible()

    await page.getByRole('button', { name: 'Toggle motion card' }).click()
    await expect(page.getByTestId('motion-card')).toHaveCSS('opacity', '0')
    await page.getByRole('button', { name: 'Toggle motion card' }).click()
    await expect(page.getByTestId('motion-card')).toHaveCSS('opacity', '1')

    await expect(page.getByTestId('motion-indicator')).toHaveText('Left active')
  })

  test('shares atom state across components and preserves it across Link navigation', async ({
    page,
  }) => {
    await page.goto('/atom')
    await waitForResumedRoute(page)

    await expect(page).toHaveTitle('Atom | E2E')
    await expect(page.getByRole('heading', { name: 'Atom Playground' })).toBeVisible()
    await expect(page.getByTestId('atom-summary')).toHaveText('Shared atom count: 0')
    await expect(page.getByTestId('atom-label')).toHaveText('Shared atom label: idle')

    await page.getByTestId('atom-left').click()

    await expect(page.getByTestId('atom-summary')).toHaveText('Shared atom count: 1')
    await expect(page.getByTestId('atom-left')).toHaveText('Left atom count: 1')
    await expect(page.getByTestId('atom-right')).toHaveText('Right atom count: 1')

    await page.getByTestId('atom-label-toggle').click()
    await expect(page.getByTestId('atom-label')).toHaveText('Shared atom label: updated')

    await page.getByTestId('atom-local').click()
    await expect(page.getByTestId('atom-local')).toHaveText('Local count: 1')
    await expect(page.getByTestId('atom-summary')).toHaveText('Shared atom count: 1')

    await page.getByRole('link', { name: 'Back home with Link' }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.getByRole('link', { name: 'Open atom route' }).click()

    await expect(page).toHaveURL(/\/atom$/)
    await expect(page.getByTestId('atom-summary')).toHaveText('Shared atom count: 1')
    await expect(page.getByTestId('atom-left')).toHaveText('Left atom count: 1')
    await expect(page.getByTestId('atom-right')).toHaveText('Right atom count: 1')
    await expect(page.getByTestId('atom-label')).toHaveText('Shared atom label: updated')
    await expect(page.getByTestId('atom-local')).toHaveText('Local count: 0')
  })

  test('replays motion animate hook transitions across repeated toggles', async ({ page }) => {
    await page.goto('/motion')
    await waitForResumedRoute(page)

    const toggle = page.getByRole('button', { name: 'Toggle motion card' })
    const card = page.getByTestId('motion-card')

    await expect(card).toHaveCSS('opacity', '1')
    await toggle.click()
    await expect(card).toHaveCSS('opacity', '0')
    await toggle.click()
    await expect(card).toHaveCSS('opacity', '1')
    await toggle.click()
    await expect(card).toHaveCSS('opacity', '0')
  })

  test('applies declarative motion animate transforms without imperative animate() calls', async ({
    page,
  }) => {
    await page.goto('/motion')
    await waitForResumedRoute(page)

    const toggle = page.getByRole('button', { name: 'Toggle motion card' })
    const card = page.getByTestId('motion-card')

    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
    await toggle.click()
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -16, 0)')
    await toggle.click()
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  })

  test('updates projection-slot sidebar link state inside a shared layout on Link navigation', async ({
    page,
  }) => {
    await page.goto('/slot-nav/overview')

    await expect(page).toHaveURL(/\/slot-nav\/overview$/)
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()
    await expect(page.getByTestId('slot-nav-overview-state')).toHaveText(' active')
    await expect(page.getByTestId('slot-nav-quick-start-state')).toHaveText(' inactive')
    await expect(page.getByTestId('slot-nav-overview-state-link')).toHaveClass(/active/)
    await expect(page.getByTestId('slot-nav-quick-start-state-link')).toHaveClass(/inactive/)

    await page.getByRole('link', { name: 'Quick Start' }).click()

    await expect(page).toHaveURL(/\/slot-nav\/quick-start$/)
    await expect(page.getByRole('heading', { name: 'quick-start' })).toBeVisible()
    await expect(page.getByTestId('slot-nav-overview-state')).toHaveText(' inactive')
    await expect(page.getByTestId('slot-nav-quick-start-state')).toHaveText(' active')
    await expect(page.getByTestId('slot-nav-overview-state-link')).toHaveClass(/inactive/)
    await expect(page.getByTestId('slot-nav-quick-start-state-link')).toHaveClass(/active/)

    await page.getByRole('link', { name: 'Overview' }).click()

    await expect(page).toHaveURL(/\/slot-nav\/overview$/)
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()
    await expect(page.getByTestId('slot-nav-overview-state')).toHaveText(' active')
    await expect(page.getByTestId('slot-nav-quick-start-state')).toHaveText(' inactive')
    await expect(page.getByTestId('slot-nav-overview-state-link')).toHaveClass(/active/)
    await expect(page.getByTestId('slot-nav-quick-start-state-link')).toHaveClass(/inactive/)
  })

  test('does not reload when repeatedly navigating projection-slot sidebar links inside a shared layout', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const key = '__slotNavLoadCount'
      const current = Number(sessionStorage.getItem(key) ?? '0')
      sessionStorage.setItem(key, String(current + 1))
    })

    await page.goto('/slot-nav/overview')
    await expect(page).toHaveURL(/\/slot-nav\/overview$/)
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('__slotNavLoadCount')))
      .toBe('1')

    for (const target of ['Quick Start', 'Overview', 'Quick Start', 'Overview'] as const) {
      await page.getByRole('link', { name: target }).click()
      await expect(
        page.getByRole('heading', { name: target.toLowerCase().replace(' ', '-') }),
      ).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => sessionStorage.getItem('__slotNavLoadCount')))
        .toBe('1')
    }
  })

  test('keeps layout-local signal toggles working after resuming a shared projection-slot layout', async ({
    page,
  }) => {
    await page.goto('/slot-nav/overview')
    await waitForResumedRoute(page)

    await expect(page.getByTestId('slot-nav-toggle-state')).toHaveText('open')
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()

    await page.getByTestId('slot-nav-toggle').click()
    await expect(page.getByTestId('slot-nav-toggle-state')).toHaveText('closed')
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()

    await page.getByTestId('slot-nav-toggle').click()
    await expect(page.getByTestId('slot-nav-toggle-state')).toHaveText('open')
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()
    await expect(page.getByTestId('slot-nav-overview-state')).toHaveText(' active')
  })

  test('keeps the first layout-local signal toggle working after resume when the layout also reads location', async ({
    page,
  }) => {
    await page.goto('/slot-nav/overview')
    await waitForResumedRoute(page)

    await expect(page.getByTestId('slot-nav-pathname')).toHaveText('/slot-nav/overview')
    await expect(page.getByTestId('slot-nav-toggle-state')).toHaveText('open')

    await page.getByTestId('slot-nav-toggle').click()
    await expect(page.getByTestId('slot-nav-toggle-state')).toHaveText('closed')

    await page.getByTestId('slot-nav-toggle').click()
    await expect(page.getByTestId('slot-nav-toggle-state')).toHaveText('open')
    await expect(page.getByTestId('slot-nav-pathname')).toHaveText('/slot-nav/overview')
  })

  test('keeps declarative motion sidebar toggles working after resume inside a shared layout', async ({
    page,
  }) => {
    await page.goto('/slot-motion-nav/overview')
    await waitForResumedRoute(page)

    const toggle = page.getByTestId('slot-motion-nav-toggle')
    const state = page.getByTestId('slot-motion-nav-toggle-state')
    const panel = page.getByTestId('slot-motion-nav-panel')

    await expect(state).toHaveText('open')
    await expect(panel).toHaveCSS('max-height', '96px')
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()

    await toggle.click()
    await expect(state).toHaveText('closed')
    await expect(panel).toHaveCSS('max-height', '0px')

    await toggle.click()
    await expect(state).toHaveText('open')
    await expect(panel).toHaveCSS('max-height', '96px')
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()
    await expect(page.getByTestId('slot-motion-nav-overview-link')).toHaveClass(/active/)
  })

  test('keeps declarative motion sidebar toggles wired after shared layout navigation', async ({
    page,
  }) => {
    await page.goto('/slot-motion-nav/overview')
    await waitForResumedRoute(page)

    const toggle = page.getByTestId('slot-motion-nav-toggle')
    const state = page.getByTestId('slot-motion-nav-toggle-state')
    const panel = page.getByTestId('slot-motion-nav-panel')

    await expect(state).toHaveText('open')
    await expect(panel).toHaveCSS('max-height', '96px')

    await page.getByTestId('slot-motion-nav-quick-start-link').click()
    await expect(page).toHaveURL(/\/slot-motion-nav\/quick-start$/)
    await expect(page.getByRole('heading', { name: 'quick-start' })).toBeVisible()

    await toggle.click()
    await expect(state).toHaveText('closed')
    await expect(panel).toHaveCSS('max-height', '0px')

    await toggle.click()
    await expect(state).toHaveText('open')
    await expect(panel).toHaveCSS('max-height', '96px')
    await expect(page.getByTestId('slot-motion-nav-quick-start-link')).toHaveClass(/active/)
  })

  test('runs onMount for Link navigation targets after refs are connected', async ({ page }) => {
    await page.goto('/mount-connected-start')

    await page.getByRole('link', { name: 'Open mount connected target' }).click()

    await expect(page).toHaveURL(/\/mount-connected-target$/)
    await expect(page.getByTestId('mount-connected-state')).toHaveText('connected')
    await expect(page.getByTestId('mount-connected-canvas')).toHaveJSProperty('width', 321)
    await expect(page.getByTestId('mount-connected-canvas')).toHaveJSProperty('height', 123)
    await expect(page.getByTestId('mount-connected-canvas')).toHaveAttribute(
      'data-mounted-canvas',
      'true',
    )
  })

  test('keeps motion section titles when sidebar links patch a shared layout shell', async ({
    page,
  }) => {
    await page.goto('/sidebar-shell/overview')
    await waitForResumedRoute(page)

    const gettingStartedButton = page.getByTestId('sidebar-shell-section-button-getting-started')
    const materialsButton = page.getByTestId('sidebar-shell-section-button-materials')

    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()
    await expect(gettingStartedButton).toContainText('Getting Started')
    await expect(materialsButton).toContainText('Materials')
    await expect(page.getByTestId('sidebar-shell-link-state-overview')).toHaveText(' active')
    await expect(page.getByTestId('sidebar-shell-link-state-routing')).toHaveText(' inactive')

    await page.getByTestId('sidebar-shell-link-materials-routing').click()

    await expect(page).toHaveURL(/\/sidebar-shell\/routing$/)
    await expect(page.getByRole('heading', { name: 'routing' })).toBeVisible()
    await expect(page.getByTestId('sidebar-shell-pathname')).toHaveText('/sidebar-shell/routing')
    await expect(gettingStartedButton).toContainText('Getting Started')
    await expect(materialsButton).toContainText('Materials')
    await expect(page.getByTestId('sidebar-shell-link-state-overview')).toHaveText(' inactive')
    await expect(page.getByTestId('sidebar-shell-link-state-routing')).toHaveText(' active')

    await page.getByTestId('sidebar-shell-link-getting-started-quick-start').click()

    await expect(page).toHaveURL(/\/sidebar-shell\/quick-start$/)
    await expect(page.getByRole('heading', { name: 'quick-start' })).toBeVisible()
    await expect(gettingStartedButton).toContainText('Getting Started')
    await expect(materialsButton).toContainText('Materials')
  })

  test('keeps sidebar section motion toggles live after repeated shared layout route patches', async ({
    page,
  }) => {
    await page.goto('/sidebar-shell/overview')
    await waitForResumedRoute(page)

    const materialsButton = page.getByTestId('sidebar-shell-section-button-materials')
    const materialsPanel = page.getByTestId('sidebar-shell-section-links-materials')

    await expect(materialsButton).toContainText('Materials')
    await expect(materialsButton).toHaveAttribute('aria-expanded', 'true')
    await expect(materialsPanel).toHaveCSS('max-height', '96px')

    await materialsButton.click()
    await expect(materialsButton).toHaveAttribute('aria-expanded', 'false')
    await expect(materialsPanel).toHaveCSS('max-height', '0px')

    await page.getByTestId('sidebar-shell-link-getting-started-quick-start').click()
    await expect(page).toHaveURL(/\/sidebar-shell\/quick-start$/)
    await expect(page.getByRole('heading', { name: 'quick-start' })).toBeVisible()

    await materialsButton.click()
    await expect(materialsButton).toHaveAttribute('aria-expanded', 'true')
    await expect(materialsPanel).toHaveCSS('max-height', '96px')

    await page.goBack()
    await expect(page).toHaveURL(/\/sidebar-shell\/overview$/)
    await expect(page.getByRole('heading', { name: 'overview' })).toBeVisible()

    await materialsButton.click()
    await expect(materialsButton).toHaveAttribute('aria-expanded', 'false')
    await expect(materialsPanel).toHaveCSS('max-height', '0px')

    await page.goForward()
    await expect(page).toHaveURL(/\/sidebar-shell\/quick-start$/)
    await expect(page.getByRole('heading', { name: 'quick-start' })).toBeVisible()

    await materialsButton.click()
    await expect(materialsButton).toHaveAttribute('aria-expanded', 'true')
    await expect(materialsPanel).toHaveCSS('max-height', '96px')
  })

  test('keeps sidebar section motion toggles live after layout HMR and route patches', async ({
    page,
  }) => {
    const originalSource = await readFile(sidebarShellLayoutPath, 'utf8')

    try {
      await page.goto('/sidebar-shell/overview')
      await waitForResumedRoute(page)

      const materialsButton = page.getByTestId('sidebar-shell-section-button-materials')
      const materialsPanel = page.getByTestId('sidebar-shell-section-links-materials')
      await expect(materialsButton).toContainText('Materials')

      const updatedSource = originalSource.replace(sidebarShellBeforeTitle, sidebarShellAfterTitle)
      expect(updatedSource).not.toBe(originalSource)
      await writeSourceAtomically(sidebarShellLayoutPath, updatedSource)

      await expect(materialsButton).toContainText('Materials HMR', { timeout: hmrTimeout })
      await materialsButton.click()
      await expect(materialsButton).toHaveAttribute('aria-expanded', 'false')
      await expect(materialsPanel).toHaveCSS('max-height', '0px')
      await materialsButton.click()
      await expect(materialsButton).toHaveAttribute('aria-expanded', 'true')
      await expect(materialsPanel).toHaveCSS('max-height', '96px')

      await page.getByTestId('sidebar-shell-link-materials-routing').click()
      await expect(page).toHaveURL(/\/sidebar-shell\/routing$/)
      await expect(page.getByRole('heading', { name: 'routing' })).toBeVisible()

      await materialsButton.click()
      await expect(materialsButton).toHaveAttribute('aria-expanded', 'false')
      await expect(materialsPanel).toHaveCSS('max-height', '0px')
      await materialsButton.click()
      await expect(materialsButton).toHaveAttribute('aria-expanded', 'true')
      await expect(materialsPanel).toHaveCSS('max-height', '96px')
    } finally {
      await writeSourceAtomically(sidebarShellLayoutPath, originalSource)
      await page.goto('/sidebar-shell/overview')
      await expect(page.getByTestId('sidebar-shell-section-button-materials')).toContainText(
        'Materials',
        { timeout: hmrTimeout },
      )
    }
  })

  test('keeps declarative motion sidebar toggles working after resume across nested layouts', async ({
    page,
  }) => {
    await page.goto('/resume-motion-root/overview')
    await waitForResumedRoute(page)

    const toggle = page.getByTestId('resume-motion-toggle')
    const state = page.getByTestId('resume-motion-toggle-state')
    const panel = page.getByTestId('resume-motion-panel')

    await expect(page.getByTestId('resume-motion-root-path')).toHaveText(
      '/resume-motion-root/overview',
    )
    await expect(state).toHaveText('open')
    await expect(panel).toHaveCSS('max-height', '96px')

    await toggle.click()
    await expect(state).toHaveText('closed')
    await expect(panel).toHaveCSS('max-height', '0px')

    await toggle.click()
    await expect(state).toHaveText('open')
    await expect(panel).toHaveCSS('max-height', '96px')
    await expect(page.getByTestId('resume-motion-overview-link')).toHaveClass(/active/)
  })

  test('renders responsive image metadata and keeps it stable across navigation', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Open image route' }).click()

    await expect(page).toHaveURL(/\/image$/)
    await expect(page.getByRole('heading', { name: 'Image Playground' })).toBeVisible()

    const image = page.getByTestId('responsive-image')
    await expect(image).toHaveAttribute('loading', 'lazy')
    await expect(image).toHaveAttribute('decoding', 'async')
    await expect(image).toHaveAttribute('width', '1200')
    await expect(image).toHaveAttribute('height', '800')
    await expect(image).toHaveAttribute('srcset', /240w.*480w.*960w.*1200w/)
    await expect(image).toHaveAttribute('sizes', '(min-width: 960px) 720px, 100vw')

    await page.getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.getByRole('link', { name: 'Open image route' }).click()
    await expect(page.getByTestId('responsive-image')).toHaveAttribute(
      'srcset',
      /240w.*480w.*960w.*1200w/,
    )
  })

  test('renders content collections on SSR and after Link navigation', async ({ page }) => {
    await page.goto('/content')

    await expect(page).toHaveTitle('Content | /content')
    await expect(page.getByRole('heading', { name: 'Content Playground' })).toBeVisible()
    await expect(page.getByTestId('content-description')).toHaveText(contentDescriptionBeforeLabel)
    await expect(page.getByTestId('content-entry-ids')).toContainText('guide/overview :: Overview')
    await expect(page.getByTestId('content-entry-ids')).toContainText(
      'guide/start-here :: Getting Started',
    )
    await expect(page.getByTestId('content-headings')).toContainText('h1 :: getting-started')
    await expect(page.getByTestId('content-body')).toContainText(contentBodyBeforeLabel)
    await expect(page.locator('[data-testid="content-body"] .shiki')).toBeVisible()
    await expect(page.locator('[data-testid="content-body"] .shiki')).toContainText(
      "const greeting = 'highlighted content'",
    )

    await page.locator('main').getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.getByRole('link', { name: 'Open content route' }).click()

    await expect(page).toHaveURL(/\/content$/)
    await expect(page.getByTestId('content-body')).toContainText(contentBodyBeforeLabel)
    await expect(page.locator('[data-testid="content-body"] .shiki')).toBeVisible()
  })

  test('keeps component-valued props and children rendered after client updates', async ({
    page,
  }) => {
    await page.goto('/')
    const propComponentContent = page.getByText('Prop component content')
    const childrenComponentContent = page.getByText('Children component content')
    const probeButton = page.getByRole('button', { name: /^Probe count:\s*0$/ })

    await expect(propComponentContent).toHaveCount(2)
    await expect(propComponentContent.first()).toBeVisible()
    await expect(childrenComponentContent).toBeVisible()

    await probeButton.click()
    await expect(page.getByRole('button', { name: /^Probe count:\s*1$/ })).toBeVisible()
    await expect(propComponentContent).toHaveCount(2)
    await expect(propComponentContent.first()).toBeVisible()
    await expect(childrenComponentContent).toBeVisible()

    const input = page.getByRole('textbox')
    await input.fill('Keeps component props')
    await page.getByRole('button', { name: 'Add' }).click()

    await expect(page.getByRole('listitem')).toHaveCount(2)
    await expect(propComponentContent).toHaveCount(2)
    await expect(propComponentContent.first()).toBeVisible()
    await expect(childrenComponentContent).toBeVisible()
  })

  test('streams suspense fallback before resolved content on direct requests', async ({ page }) => {
    await page.goto('/suspense', { waitUntil: 'commit' })

    await expect(page.getByRole('heading', { name: 'Suspense Playground' })).toBeVisible()
    await expect(page.getByTestId('suspense-fallback')).toHaveText('loading')
    await expect(page.getByTestId('suspense-value')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Layout count:\s*0$/ })).toBeVisible()
    await expect(page.getByTestId('suspense-value')).toHaveText('ready')
    await expect(page.getByTestId('suspense-fallback')).toHaveCount(0)
  })

  test('resolves suspense content after Link navigation', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Suspense' }).click()
    await expect(page).toHaveURL(/\/suspense$/)
    await expect(page.getByText('ready', { exact: true })).toBeVisible()
    await expect(page.getByTestId('suspense-fallback')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Suspense Playground' })).toBeVisible()
  })

  test('shows suspense fallback during Link navigation before resolved content', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Suspense' }).click()
    await expect(page).toHaveURL(/\/suspense$/)
    await expect(page.getByRole('heading', { name: 'Suspense Playground' })).toBeVisible()
    await expect(page.getByText('loading', { exact: true })).toBeVisible()
    await expect(page.getByText('ready', { exact: true })).toBeVisible()
    await expect(page.getByText('loading', { exact: true })).toHaveCount(0)
  })

  test('keeps layout state when navigating to suspense with Link', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /^Layout count:\s*0$/ }).click()
    await expect(page.getByRole('button', { name: /^Layout count:\s*1$/ })).toBeVisible()

    await page.getByRole('link', { name: 'Suspense' }).click()

    await expect(page).toHaveURL(/\/suspense$/)
    await expect(page.getByRole('heading', { name: 'Suspense Playground' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Layout count:\s*1$/ })).toBeVisible()
    await expect(page.getByText('ready', { exact: true })).toBeVisible()
  })

  test('navigates imperatively and updates the counter', async ({ page }) => {
    await page.goto('/')
    await waitForResumedRoute(page)

    await page.getByRole('button', { name: 'Go to counter with navigate()' }).click()

    await expect(page).toHaveURL(/\/counter$/)
    const counterButton = page.getByRole('button', { name: /^Count:\s*0$/ })
    await expect(counterButton).toBeVisible()
    await counterButton.click()
    await expect(page.getByRole('button', { name: /^Count:\s*1$/ })).toBeVisible()

    await page.getByRole('button', { name: 'Back home with navigate()' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Go to counter with navigate()' })).toBeVisible()
  })

  test('runs action$ with middleware and validator on the actions page', async ({ page }) => {
    await page.goto('/actions')
    await waitForResumedRoute(page)

    await expect(page.getByRole('heading', { name: 'Action Playground' })).toBeVisible()
    await expect(page.getByText(/loader data:\s*loader-ready/)).toBeVisible()
    await expect(page.getByText(/loader loading:\s*false/)).toBeVisible()
    await expect(page.getByText(/loader error:\s*no error/)).toBeVisible()
    await expect(page.getByText(/action pending:\s*false/)).toBeVisible()
    await expect(page.getByText(/action result:\s*none/)).toBeVisible()

    await page.getByRole('textbox', { name: 'Left', exact: true }).fill('20')
    await page.getByRole('textbox', { name: 'Right', exact: true }).fill('22')
    await page.getByRole('button', { name: 'Run action' }).click()

    await expect(page.getByText(/action result:\s*42/)).toBeVisible()
    await expect(page.getByText(/action last:\s*20 \+ 22 = 42 \(trace-e2e\)/)).toBeVisible()
    await expect(page.getByText(/action error:\s*no error/)).toBeVisible()
    await expect(page.getByText(/action pending:\s*false/)).toBeVisible()
  })

  test('progressively enhances native form submissions through action$', async ({ page }) => {
    await page.goto('/actions')
    await waitForResumedRoute(page)

    await page.getByRole('textbox', { name: 'Form Left' }).fill('9')
    await page.getByRole('textbox', { name: 'Form Right' }).fill('3')
    await page.getByRole('button', { name: 'Submit form action' }).click()

    await expect(page).toHaveURL(/\/actions$/)
    await expect(page.getByText(/form result:\s*12/)).toBeVisible()
    await expect(page.getByText(/form last:\s*9 \+ 3/)).toBeVisible()
    await expect(page.getByText(/form error:\s*no error/)).toBeVisible()
    await expect(page.getByText(/form pending:\s*false/)).toBeVisible()
  })

  test('hydrates loader$ from SSR payload and reloads it over RPC', async ({ page }) => {
    await page.goto('/actions')
    await waitForResumedRoute(page)

    await expect(page.getByText(/loader data:\s*loader-ready/)).toBeVisible()
    await expect(page.getByText(/loader last:\s*No manual load yet/)).toBeVisible()

    await page.getByRole('button', { name: 'Reload loader' }).click()

    await expect(page.getByText(/loader last:\s*loader-ready \(trace-loader\)/)).toBeVisible()
    await expect(page.getByText(/loader loading:\s*false/)).toBeVisible()
  })

  test('shows structured validation failures from action$', async ({ page }) => {
    await page.goto('/actions')
    await waitForResumedRoute(page)

    await page.getByRole('textbox', { name: 'Left', exact: true }).fill('abc')
    await page.getByRole('textbox', { name: 'Right', exact: true }).fill('22')
    await page.getByRole('button', { name: 'Run action' }).click()

    await expect(page.getByText(/action result:\s*none/)).toBeVisible()
    await expect(page.getByText(/action last:\s*No result yet/)).toBeVisible()
    await expect(page.getByText(/action error:\s*\{"issues":\[/)).toContainText(
      'left and right must be numeric strings',
    )
  })

  test('rerenders the page for native form POSTs when javascript is unavailable', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    })
    const page = await context.newPage()

    try {
      await page.goto('/actions')

      await page.getByRole('textbox', { name: 'Form Left' }).fill('11')
      await page.getByRole('textbox', { name: 'Form Right' }).fill('4')
      await page.getByRole('button', { name: 'Submit form action' }).click()

      await expect(page).toHaveURL(/\/actions$/)
      await expect(page.getByText(/form result:\s*15/)).toBeVisible()
      await expect(page.getByText(/form last:\s*11 \+ 4/)).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Form Left' })).toHaveValue('11')
      await expect(page.getByRole('textbox', { name: 'Form Right' })).toHaveValue('4')
    } finally {
      await context.close()
    }
  })

  test('keeps JSX text whitespace stable between SSR and client navigation', async ({ page }) => {
    await page.goto('/actions')

    const getRightLabelText = () =>
      page
        .locator('label')
        .nth(1)
        .evaluate((element) => {
          const label = element as HTMLLabelElement
          return label.textContent
        })

    await expect.poll(getRightLabelText).toBe('Right')

    await page.getByRole('link', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.getByRole('link', { name: 'Actions', exact: true }).click()
    await expect(page).toHaveURL(/\/actions$/)

    await expect.poll(getRightLabelText).toBe('Right')
  })

  test('applies resumable HMR updates for pages that render inline SVG', async ({ page }) => {
    const originalSource = await readFile(hmrSvgPagePath, 'utf8')
    const heading = page.getByRole('heading', { name: 'SVG HMR Probe' })
    const status = page.locator('main main p').first()
    const icon = page.locator('main main svg').first()

    await page.goto('/hmr-svg')
    await expect(heading).toBeVisible()
    await expect(icon).toBeVisible()
    await expect(status).toHaveText(hmrBeforeLabel)

    const updatedSource = originalSource.replace(hmrBeforeLabel, hmrAfterLabel)
    expect(updatedSource).not.toBe(originalSource)

    try {
      await writeSourceAtomically(hmrSvgPagePath, updatedSource)
      await expect(heading).toBeVisible()
      await expect(status).toHaveText(hmrAfterLabel, {
        timeout: hmrTimeout,
      })
    } finally {
      await writeSourceAtomically(hmrSvgPagePath, originalSource)
      await expect(heading).toBeVisible()
      await expect(status).toHaveText(hmrBeforeLabel, {
        timeout: hmrTimeout,
      })
    }
  })

  test('keeps responsive image routes working after HMR updates', async ({ page }) => {
    const originalSource = await readFile(imagePagePath, 'utf8')

    try {
      await page.goto('/image')
      await expect(page.getByText(imageHmrBeforeLabel)).toBeVisible()

      const updatedSource = originalSource.replace(imageHmrBeforeLabel, imageHmrAfterLabel)
      expect(updatedSource).not.toBe(originalSource)
      await writeSourceAtomically(imagePagePath, updatedSource)

      await expect(page.getByText(imageHmrAfterLabel)).toBeVisible({
        timeout: hmrTimeout,
      })
      await expect(page.getByTestId('responsive-image')).toHaveAttribute(
        'srcset',
        /240w.*480w.*960w.*1200w/,
      )
    } finally {
      await writeSourceAtomically(imagePagePath, originalSource)
      await page.reload({ waitUntil: 'networkidle' })
      await expect(page.getByText(imageHmrBeforeLabel)).toBeVisible({
        timeout: hmrTimeout,
      })
    }
  })

  test('updates content routes after markdown and frontmatter HMR changes', async ({ page }) => {
    const originalSource = await readFile(contentMarkdownPath, 'utf8')

    try {
      await page.goto('/content')
      await expect(page.getByTestId('content-description')).toHaveText(
        contentDescriptionBeforeLabel,
      )
      await expect(page.getByTestId('content-body')).toContainText(contentBodyBeforeLabel)

      const updatedSource = originalSource
        .replace(contentDescriptionBeforeLabel, contentDescriptionAfterLabel)
        .replace(contentBodyBeforeLabel, contentBodyAfterLabel)
      expect(updatedSource).not.toBe(originalSource)
      await writeSourceAtomically(contentMarkdownPath, updatedSource)

      await expect(page.getByTestId('content-description')).toHaveText(
        contentDescriptionAfterLabel,
        {
          timeout: hmrTimeout,
        },
      )
      await expect(page.getByTestId('content-body')).toContainText(contentBodyAfterLabel, {
        timeout: hmrTimeout,
      })
    } finally {
      await writeSourceAtomically(contentMarkdownPath, originalSource)
      await expect(page.getByTestId('content-description')).toHaveText(
        contentDescriptionBeforeLabel,
        {
          timeout: hmrTimeout,
        },
      )
      await expect(page.getByTestId('content-body')).toContainText(contentBodyBeforeLabel, {
        timeout: hmrTimeout,
      })
    }
  })

  test('does not duplicate projected component content across HMR updates', async ({ page }) => {
    const originalHomeSource = await readFile(homePagePath, 'utf8')
    const propA = page.getByTestId('probe-aa-0')
    const propB = page.getByTestId('probe-aa-1')
    const children = page.getByTestId('probe-children')

    try {
      await page.goto('/')
      await expect(propA).toHaveText('Prop component content')
      await expect(propB).toHaveText('Prop component content')
      await expect(children).toHaveText('Children component content')

      const updatedHomeSource = originalHomeSource.replace(homeHmrBeforeLabel, homeHmrAfterLabel)
      expect(updatedHomeSource).not.toBe(originalHomeSource)
      await writeSourceAtomically(homePagePath, updatedHomeSource)

      await expect(page.getByRole('button', { name: homeHmrAfterLabel })).toBeVisible({
        timeout: hmrTimeout,
      })
      await expect(propA).toHaveText('Prop component content')
      await expect(propB).toHaveText('Prop component content')
      await expect(children).toHaveText('Children component content')
    } finally {
      await writeSourceAtomically(homePagePath, originalHomeSource)
      await page.goto('/')
      await expect(page.getByRole('button', { name: homeHmrBeforeLabel })).toBeVisible({
        timeout: hmrTimeout,
      })
      await expect(propA).toHaveText('Prop component content')
      await expect(propB).toHaveText('Prop component content')
      await expect(children).toHaveText('Children component content')
    }
  })
})
