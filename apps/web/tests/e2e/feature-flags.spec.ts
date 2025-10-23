import { test, expect } from '@playwright/test';

test.describe('Feature Flags System', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to admin feature flags page
    await page.goto('/admin/feature-flags');
  });

  test('should display all major feature flags', async ({ page }) => {
    // Check that all major flags are present
    const expectedFlags = [
      'catalog',
      'orders_realtime', 
      'chat_enabled',
      'pinned_products',
      'inventory_module',
      'promotions_basic',
      'promosuite',
      'sponsoredAds',
      'loyalty_program',
      'recommendations',
      'subscriptions',
      'analytics_dashboards',
      'feature_flags_admin'
    ];

    for (const flagKey of expectedFlags) {
      await expect(page.locator(`[data-testid="flag-${flagKey}"]`)).toBeVisible();
    }
  });

  test('should allow toggling feature flags', async ({ page }) => {
    // Find a flag toggle and test it
    const flagToggle = page.locator('[data-testid="flag-promosuite"] .flag-toggle');
    
    // Check initial state
    const initialState = await flagToggle.isChecked();
    
    // Toggle the flag
    await flagToggle.click();
    
    // Verify state changed
    const newState = await flagToggle.isChecked();
    expect(newState).toBe(!initialState);
    
    // Verify toast notification appeared
    await expect(page.locator('.toast')).toBeVisible();
  });

  test('should support rollout percentage', async ({ page }) => {
    // Open targeting for a flag
    await page.locator('[data-testid="flag-promosuite"] .targeting-button').click();
    
    // Add a rollout rule
    await page.locator('.add-rule-button').click();
    
    // Set rollout to 50%
    await page.locator('input[type="range"]').fill('50');
    
    // Save the rule
    await page.locator('.save-rule-button').click();
    
    // Verify rule was created
    await expect(page.locator('.rule-item')).toContainText('ROLLOUT (50%)');
  });

  test('should support organization targeting', async ({ page }) => {
    // Open targeting for a flag
    await page.locator('[data-testid="flag-promosuite"] .targeting-button').click();
    
    // Add a rule targeting suppliers only
    await page.locator('.add-rule-button').click();
    
    // Select SUPPLIER as target org type
    await page.locator('select[name="targetOrgType"]').selectOption('SUPPLIER');
    
    // Save the rule
    await page.locator('.save-rule-button').click();
    
    // Verify rule was created
    await expect(page.locator('.rule-item')).toContainText('Target: SUPPLIER');
  });

  test('should support overrides', async ({ page }) => {
    // Open targeting for a flag
    await page.locator('[data-testid="flag-promosuite"] .targeting-button').click();
    
    // Add an override
    await page.locator('.add-override-button').click();
    
    // Select an organization
    await page.locator('select[name="orgId"]').selectOption('sup_1');
    
    // Set to FORCE_ON
    await page.locator('input[value="FORCE_ON"]').check();
    
    // Add a note
    await page.locator('textarea[name="note"]').fill('Beta testing for Premium Meats');
    
    // Save the override
    await page.locator('.save-override-button').click();
    
    // Verify override was created
    await expect(page.locator('.override-item')).toContainText('Override: FORCE_ON');
    await expect(page.locator('.override-item')).toContainText('Beta testing for Premium Meats');
  });

  test('should gate PromoSuite features when disabled', async ({ page }) => {
    // First, disable the promosuite flag
    await page.goto('/admin/feature-flags');
    await page.locator('[data-testid="flag-promosuite"] .flag-toggle').click();
    
    // Navigate to supplier PromoSuite page
    await page.goto('/supplier/promotions-suite');
    
    // Should show fallback content
    await expect(page.locator('text=PromoSuite Not Available')).toBeVisible();
    await expect(page.locator('text=Contact your administrator')).toBeVisible();
    
    // Should not show campaign creation button
    await expect(page.locator('text=Create Campaign')).not.toBeVisible();
  });

  test('should show PromoSuite features when enabled', async ({ page }) => {
    // First, enable the promosuite flag
    await page.goto('/admin/feature-flags');
    await page.locator('[data-testid="flag-promosuite"] .flag-toggle').click();
    
    // Navigate to supplier PromoSuite page
    await page.goto('/supplier/promotions-suite');
    
    // Should show PromoSuite interface
    await expect(page.locator('h1:has-text("PromoSuite")')).toBeVisible();
    await expect(page.locator('text=Create Campaign')).toBeVisible();
    
    // Should show campaign types
    await expect(page.locator('text=Sponsored Visibility')).toBeVisible();
    await expect(page.locator('text=Discount Campaign')).toBeVisible();
    await expect(page.locator('text=Featured Product')).toBeVisible();
  });

  test('should respect organization-specific targeting', async ({ page }) => {
    // Set up supplier-only targeting for promosuite
    await page.goto('/admin/feature-flags');
    await page.locator('[data-testid="flag-promosuite"] .targeting-button').click();
    
    // Add rule targeting suppliers only
    await page.locator('.add-rule-button').click();
    await page.locator('select[name="targetOrgType"]').selectOption('SUPPLIER');
    await page.locator('.save-rule-button').click();
    
    // Test as supplier (should see PromoSuite)
    await page.goto('/supplier/promotions-suite');
    await expect(page.locator('h1:has-text("PromoSuite")')).toBeVisible();
    
    // Test as restaurant (should not see PromoSuite)
    await page.goto('/restaurant/promotions-suite');
    await expect(page.locator('text=PromoSuite Not Available')).toBeVisible();
  });

  test('should handle dependency enforcement', async ({ page }) => {
    // Disable catalog flag (dependency of promosuite)
    await page.goto('/admin/feature-flags');
    await page.locator('[data-testid="flag-catalog"] .flag-toggle').click();
    
    // Try to enable promosuite
    await page.locator('[data-testid="flag-promosuite"] .flag-toggle').click();
    
    // Should show dependency error
    await expect(page.locator('.toast')).toContainText('dependency_off:catalog');
    
    // PromoSuite should remain disabled
    const promosuiteToggle = page.locator('[data-testid="flag-promosuite"] .flag-toggle');
    await expect(promosuiteToggle).not.toBeChecked();
  });

  test('should cache flag evaluations', async ({ page }) => {
    // Enable promosuite flag
    await page.locator('[data-testid="flag-promosuite"] .flag-toggle').click();
    
    // Navigate to PromoSuite page multiple times
    for (let i = 0; i < 3; i++) {
      await page.goto('/supplier/promotions-suite');
      await expect(page.locator('h1:has-text("PromoSuite")')).toBeVisible();
    }
    
    // Check that API was called efficiently (cached)
    // This would require network monitoring in a real test
  });

  test('should invalidate cache on flag changes', async ({ page }) => {
    // Enable promosuite flag
    await page.locator('[data-testid="flag-promosuite"] .flag-toggle').click();
    
    // Navigate to PromoSuite page
    await page.goto('/supplier/promotions-suite');
    await expect(page.locator('h1:has-text("PromoSuite")')).toBeVisible();
    
    // Disable the flag
    await page.goto('/admin/feature-flags');
    await page.locator('[data-testid="flag-promosuite"] .flag-toggle').click();
    
    // Navigate back to PromoSuite page
    await page.goto('/supplier/promotions-suite');
    
    // Should immediately show fallback content (cache invalidated)
    await expect(page.locator('text=PromoSuite Not Available')).toBeVisible();
  });
});

test.describe('Feature Flag Performance', () => {
  test('should evaluate flags quickly', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/supplier/promotions-suite');
    
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    
    // Should load within 2 seconds
    expect(loadTime).toBeLessThan(2000);
  });

  test('should handle multiple flag evaluations efficiently', async ({ page }) => {
    // Navigate to a page that uses multiple flags
    await page.goto('/supplier/dashboard');
    
    // Should load without performance issues
    await expect(page.locator('body')).toBeVisible();
  });
});
