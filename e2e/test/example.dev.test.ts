import { expect, test } from '@playwright/test'

test.describe('example app in dev mode', () => {
  test.describe.configure({ mode: 'serial' })

  test('renders the SSR shell and adds todos after resume', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Document')
    await expect(page.getByRole('heading', { name: 'Todo List' })).toBeVisible()
    await expect(page.getByText('Shared layout shell updated')).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(1)
    await expect(page.getByRole('listitem').first()).toHaveText('ToDo1')

    const input = page.getByRole('textbox')
    await input.fill('Ship e2e')
    await page.getByRole('button', { name: 'Add' }).click()

    await expect(page.getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('listitem').nth(1)).toHaveText('Ship e2e')
    await expect(input).toHaveValue('')
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

    await page.getByRole('textbox', { name: 'Left' }).fill('20')
    await page.getByRole('textbox', { name: 'Right' }).fill('22')
    await page.getByRole('button', { name: 'Run action' }).click()

    await expect(page.getByText(/action result:\s*42/)).toBeVisible()
    await expect(page.getByText(/action last:\s*20 \+ 22 = 42 \(trace-e2e\)/)).toBeVisible()
    await expect(page.getByText(/action error:\s*no error/)).toBeVisible()
    await expect(page.getByText(/action pending:\s*false/)).toBeVisible()
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

    await page.getByRole('textbox', { name: 'Left' }).fill('abc')
    await page.getByRole('textbox', { name: 'Right' }).fill('22')
    await page.getByRole('button', { name: 'Run action' }).click()

    await expect(page.getByText(/action result:\s*none/)).toBeVisible()
    await expect(page.getByText(/action last:\s*No result yet/)).toBeVisible()
    await expect(page.getByText(/action error:\s*\{"issues":\[/)).toContainText(
      'left and right must be numeric strings',
    )
  })

  test('keeps JSX text whitespace stable between SSR and client navigation', async ({ page }) => {
    await page.goto('/actions')

    const getRightLabelText = () =>
      page.locator('label').nth(1).evaluate((element) => {
        const label = element as HTMLLabelElement
        return label.textContent
      })

    await expect.poll(getRightLabelText).toBe('Right')

    await page.getByRole('link', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.getByRole('link', { name: 'Actions' }).click()
    await expect(page).toHaveURL(/\/actions$/)

    await expect.poll(getRightLabelText).toBe('Right')
  })
})
