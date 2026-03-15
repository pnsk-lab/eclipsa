import { readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const hmrSvgPagePath = fileURLToPath(new URL('../app/hmr-svg/+page.tsx', import.meta.url))
const hmrBeforeLabel = 'svg hmr before'
const hmrAfterLabel = 'svg hmr after'
const imagePagePath = fileURLToPath(new URL('../app/image/+page.tsx', import.meta.url))
const imageHmrBeforeLabel = 'Responsive image metadata should survive navigation, resume, and HMR.'
const imageHmrAfterLabel =
  'Responsive image metadata should survive navigation, resume, HMR, and page transitions.'

const writeSourceAtomically = async (filePath: string, source: string) => {
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, source)
  await rename(tempPath, filePath)
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

  test('does not duplicate route content when navigate() returns into a shared layout', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /^Layout count:\s*0$/ }).click()
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

  test('prefetches route html on link intent and reuses prefetched loader state on navigation', async ({
    page,
  }) => {
    const routeRequests: string[] = []
    const loaderRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/actions') {
        routeRequests.push(url.pathname)
      }
      if (url.pathname.startsWith('/__eclipsa/loader/')) {
        loaderRequests.push(url.pathname)
      }
    })

    await page.goto('/')
    routeRequests.length = 0
    loaderRequests.length = 0

    await page.getByRole('link', { name: 'Open actions without prefetch' }).hover()
    await page.waitForTimeout(250)
    expect(routeRequests).toHaveLength(0)

    const actionsLink = page.getByRole('link', { name: 'Actions', exact: true })

    await actionsLink.hover()
    await expect.poll(() => routeRequests.length).toBeGreaterThan(0)

    routeRequests.length = 0
    loaderRequests.length = 0

    await actionsLink.click()

    await expect(page).toHaveURL(/\/actions$/)
    await expect(page.getByText(/loader data:\s*loader-ready/)).toBeVisible()
    await expect.poll(() => loaderRequests.length).toBe(0)
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
    await expect(page.getByTestId('suspense-value')).toHaveText('ready')
    await expect(page.getByTestId('suspense-fallback')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Suspense Playground' })).toBeVisible()
  })

  test('navigates imperatively and updates the counter', async ({ page }) => {
    await page.goto('/')

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

    await expect(page.getByText(/loader data:\s*loader-ready/)).toBeVisible()
    await expect(page.getByText(/loader last:\s*No manual load yet/)).toBeVisible()

    await page.getByRole('button', { name: 'Reload loader' }).click()

    await expect(page.getByText(/loader last:\s*loader-ready \(trace-loader\)/)).toBeVisible()
    await expect(page.getByText(/loader loading:\s*false/)).toBeVisible()
  })

  test('shows structured validation failures from action$', async ({ page }) => {
    await page.goto('/actions')

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
      await expect(status).toHaveText(hmrAfterLabel)
    } finally {
      await writeSourceAtomically(hmrSvgPagePath, originalSource)
      await expect(heading).toBeVisible()
      await expect(status).toHaveText(hmrBeforeLabel)
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

      await expect(page.getByText(imageHmrAfterLabel)).toBeVisible()
      await expect(page.getByTestId('responsive-image')).toHaveAttribute(
        'srcset',
        /240w.*480w.*960w.*1200w/,
      )
    } finally {
      await writeSourceAtomically(imagePagePath, originalSource)
      await expect(page.getByText(imageHmrBeforeLabel)).toBeVisible()
    }
  })
})
