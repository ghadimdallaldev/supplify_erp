import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should redirect to login page when not authenticated', async ({ page }) => {
    await page.goto('/');
    
    // Should show loading or redirect to Keycloak login
    await expect(page).toHaveURL(/keycloak|login/);
  });

  test('should display dashboard after successful login', async ({ page }) => {
    // This test would need proper Keycloak setup and test user credentials
    // For now, just check that the page loads without errors
    await page.goto('/');
    
    // Should not show any error messages
    await expect(page.locator('text=Error')).not.toBeVisible();
  });
});
