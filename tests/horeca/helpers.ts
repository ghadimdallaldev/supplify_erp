import { expect, type Page } from '@playwright/test'

export const next = (page: Page) =>
  page.locator('.sim-nav').getByRole('button', { name: 'Next', exact: true }).click()

export async function chooseWorld(page: Page, role: 'supplier' | 'restaurant') {
  await page
    .getByRole('button', {
      name: new RegExp(`I'm a ${role === 'supplier' ? 'Supplier' : 'Restaurant'}`, 'i'),
    })
    .click()
  await expect(page.locator('#experience')).toBeVisible()
  await expect(page.locator(`#sim-${role}`)).toBeVisible()
}

export async function walkSupplier(page: Page) {
  await chooseWorld(page, 'supplier')
  await page.getByRole('button', { name: /Open order/ }).click()
  await next(page)
  await page.getByRole('button', { name: 'Accept order' }).click()
  await next(page)
  await page.getByRole('button', { name: /Ship 18 kg/ }).click()
  await page.getByRole('button', { name: 'Reserve stock' }).click()
  await next(page)
  await page.getByRole('button', { name: 'Start processing', exact: true }).click()
  for (const c of await page.getByRole('checkbox', { name: 'Picked' }).all()) await c.check()
  await next(page)
  await page.getByRole('button', { name: /Fadi R\./ }).click()
  await page.getByRole('button', { name: 'Assign and ship' }).click()
  await next(page)
  await page.getByRole('button', { name: /Driver taps: Picked up/ }).click()
  await page.getByRole('button', { name: /Driver taps: Out for delivery/ }).click()
  await expect(page.locator('.mirror')).toContainText('Estimated arrival')
  await page.getByRole('button', { name: /Driver taps: Delivered/ }).click()
  await next(page)
  await expect(page.locator('.sim-stepname')).toContainText('Step 7 of 7')
}

export async function walkRestaurant(page: Page) {
  await chooseWorld(page, 'restaurant')
  await page.getByRole('button', { name: /Cedar Fresh Produce/ }).click()
  await next(page)
  await page.getByRole('button', { name: 'Add Baladi Tomatoes to cart' }).click()
  await next(page)
  await expect(page.getByText('Your cart')).toBeVisible()
  await next(page)
  await page.getByRole('button', { name: /Place order with Cedar Fresh Produce/ }).click()
  await expect(page.locator('.confirm')).toContainText('#HB-2041')
  await next(page)
  await expect(page.locator('.timeline')).toBeVisible()
  const skip = page.getByRole('button', { name: 'Skip ahead' })
  if (await skip.isVisible()) await skip.click()
  await expect(page.locator('.confirm')).toContainText('Delivered')
  await next(page)
  await page.getByRole('button', { name: 'Tick all' }).click()
  await page.getByRole('button', { name: 'Confirm receipt in full' }).click()
  await expect(page.locator('.lifecycle li[data-state="now"]')).toContainText(/Received|Invoiced/)
  await next(page)
  await page.getByRole('button', { name: 'Reorder this list' }).click()
  await expect(page.locator('.confirm')).toContainText('#HB-2052')
}
