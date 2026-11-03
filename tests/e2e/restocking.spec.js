import { test, expect } from '@playwright/test'

test.describe('restocking', () => {
  test('slider drives the recommendations and Place Order state', async ({ page }) => {
    await page.goto('/restocking')
    const slider = page.getByRole('slider', { name: 'Budget' })
    const rows = page.locator('tbody tr')
    const placeOrder = page.getByRole('button', { name: 'Place Order' })

    await expect(slider).toHaveAttribute('min', '0')
    await expect(slider).toHaveAttribute('max', '500000')
    await expect(slider).toHaveAttribute('step', '5000')

    await slider.fill('0')
    await expect(rows).toHaveCount(0)
    await expect(placeOrder).toBeDisabled()

    await slider.fill('100000')
    await expect(rows.first()).toBeVisible()
    await expect(placeOrder).toBeEnabled()
    const small = await rows.count()

    await slider.fill('500000')
    await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(small)
  })

  test('placing an order shows it under Submitted Orders with its lead time', async ({ page }) => {
    await page.goto('/restocking')
    await page.getByRole('slider', { name: 'Budget' }).fill('300000')
    await page.getByRole('button', { name: 'Place Order' }).click()

    const banner = page.getByRole('status')
    await expect(banner).toContainText('Order submitted')
    const orderNumber = (await banner.innerText()).match(/RST-\d{4}-\d{4}/)[0]
    const leadDays = (await banner.innerText()).match(/lead time of (\d+) days/)[1]

    await banner.getByRole('link', { name: /Orders tab/ }).click()
    await expect(page).toHaveURL(/\/orders$/)

    const row = page.locator('tr', { hasText: orderNumber })
    await expect(row).toBeVisible()
    await expect(row).toContainText(`${leadDays} days`)
    await expect(row).toContainText(/submitted/i)
  })

  test('restocking orders do not change the main orders table', async ({ page, request }) => {
    const before = (await (await request.get('http://localhost:8001/api/orders')).json()).length
    await page.goto('/restocking')
    await page.getByRole('slider', { name: 'Budget' }).fill('50000')
    await page.getByRole('button', { name: 'Place Order' }).click()
    await expect(page.getByRole('status')).toContainText('Order submitted')
    const after = (await (await request.get('http://localhost:8001/api/orders')).json()).length
    expect(after).toBe(before)
  })
})
