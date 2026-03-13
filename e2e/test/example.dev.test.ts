import { expect, test } from '@playwright/test'

test.describe('example app in dev mode', () => {
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
})
