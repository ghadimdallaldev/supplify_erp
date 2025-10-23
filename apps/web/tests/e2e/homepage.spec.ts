import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should display welcome message', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Welcome to Supplify' })).toBeVisible();
    await expect(page.getByText('B2B F&B Procurement Platform')).toBeVisible();
  });

  test('should display feature cards', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('For Restaurants')).toBeVisible();
    await expect(page.getByText('For Suppliers')).toBeVisible();
    await expect(page.getByText('Analytics')).toBeVisible();
  });
});

test.describe('Dashboard', () => {
  test('should display dashboard metrics', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Total Orders')).toBeVisible();
    await expect(page.getByText('Total Spend')).toBeVisible();
    await expect(page.getByText('Active Suppliers')).toBeVisible();
    await expect(page.getByText('Loyalty Points')).toBeVisible();
  });

  test('should show recent orders section', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByText('Recent Orders')).toBeVisible();
  });
});

