import { test, expect, devices } from '@playwright/test'

test.use({ ...devices['Pixel 7'] })

test('mobile docs drawer closes after tapping a navigation link', async ({ page }) => {
  await page.goto('/docs/getting-started/overview', { waitUntil: 'networkidle' })
  const toggle = page.getByTestId('docs-mobile-nav-toggle')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('link', { name: 'Routing' }).click()
  await page.waitForURL('**/docs/materials/routing')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)

  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#docs-mobile-drawer-shell')).toHaveClass(/pointer-events-none/)
  await expect(page.locator('h1').first()).toHaveText('Routing')
})
