import { test, expect } from '@playwright/test'

test.describe('Recipe costing', () => {
  test.skip('restaurant recipe costing flow', async ({ page }) => {
    // Requires seeded restaurant auth + recipe_costing plan feature + migration 0186.
    await page.goto('/app/recipes')
    await expect(page.getByTestId('recipes-list-page')).toBeVisible()
  })
})
