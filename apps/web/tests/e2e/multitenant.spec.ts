import { test, expect } from '@playwright/test';

// Multi-Tenant Test Suite
test.describe('Multi-Tenant Architecture', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
  });

  test.describe('Tenant Isolation', () => {
    test('should isolate data between different tenants', async ({ page }) => {
      // Login as Restaurant A
      await page.click('button:has-text("Restaurant")');
      await page.waitForURL('/restaurant/dashboard');
      
      // Create a product (this should be scoped to Restaurant A's tenant)
      await page.goto('/restaurant/products');
      await page.click('button:has-text("Add Product")');
      await page.fill('input[name="name"]', 'Restaurant A Product');
      await page.fill('input[name="price"]', '10.99');
      await page.click('button:has-text("Save")');
      
      // Verify product exists for Restaurant A
      await expect(page.locator('text=Restaurant A Product')).toBeVisible();
      
      // Logout and login as Restaurant B
      await page.click('button:has-text("Logout")');
      await page.waitForURL('/login');
      
      // Create a different restaurant account (simulated)
      await page.fill('input[name="email"]', 'restaurant2@supplify.com');
      await page.fill('input[name="password"]', 'restaurant123');
      await page.click('button:has-text("Sign In")');
      
      // Navigate to products
      await page.goto('/restaurant/products');
      
      // Verify Restaurant A's product is NOT visible to Restaurant B
      await expect(page.locator('text=Restaurant A Product')).not.toBeVisible();
      
      // Create a product for Restaurant B
      await page.click('button:has-text("Add Product")');
      await page.fill('input[name="name"]', 'Restaurant B Product');
      await page.fill('input[name="price"]', '15.99');
      await page.click('button:has-text("Save")');
      
      // Verify Restaurant B's product exists
      await expect(page.locator('text=Restaurant B Product')).toBeVisible();
    });

    test('should prevent cross-tenant access via direct URL manipulation', async ({ page }) => {
      // Login as Restaurant A
      await page.click('button:has-text("Restaurant")');
      await page.waitForURL('/restaurant/dashboard');
      
      // Create a product and get its ID
      await page.goto('/restaurant/products');
      await page.click('button:has-text("Add Product")');
      await page.fill('input[name="name"]', 'Secret Product A');
      await page.fill('input[name="price"]', '99.99');
      await page.click('button:has-text("Save")');
      
      // Get the product ID from the URL or DOM
      const productUrl = page.url();
      const productId = productUrl.split('/').pop();
      
      // Logout and login as Restaurant B
      await page.click('button:has-text("Logout")');
      await page.waitForURL('/login');
      await page.fill('input[name="email"]', 'restaurant2@supplify.com');
      await page.fill('input[name="password"]', 'restaurant123');
      await page.click('button:has-text("Sign In")');
      
      // Try to access Restaurant A's product directly
      await page.goto(`/restaurant/products/${productId}`);
      
      // Should either redirect or show 403/404 error
      await expect(page.locator('text=Secret Product A')).not.toBeVisible();
    });
  });

  test.describe('Admin Tenant Switching', () => {
    test('should allow admin to switch between tenants', async ({ page }) => {
      // Login as admin
      await page.click('button:has-text("Admin")');
      await page.waitForURL('/admin/dashboard');
      
      // Navigate to tenant switcher
      await page.goto('/admin/tenant-switcher');
      
      // Verify tenant switcher is visible
      await expect(page.locator('text=Organizations')).toBeVisible();
      
      // Search for a specific organization
      await page.fill('input[placeholder*="Search organizations"]', 'Golden Fork');
      
      // Click on an organization to switch to it
      await page.click('button:has-text("Switch To")');
      
      // Verify we're now in the tenant context
      await expect(page.locator('text=Switched to tenant')).toBeVisible();
    });

    test('should audit admin tenant switching', async ({ page }) => {
      // Login as admin
      await page.click('button:has-text("Admin")');
      await page.waitForURL('/admin/dashboard');
      
      // Navigate to audit logs
      await page.goto('/admin/audit-logs');
      
      // Switch to a tenant
      await page.goto('/admin/tenant-switcher');
      await page.click('button:has-text("Switch To")');
      
      // Go back to audit logs
      await page.goto('/admin/audit-logs');
      
      // Verify audit log entry exists
      await expect(page.locator('text=IMPERSONATE')).toBeVisible();
      await expect(page.locator('text=tenant')).toBeVisible();
    });
  });

  test.describe('Feature Flags per Tenant', () => {
    test('should apply feature flags per tenant', async ({ page }) => {
      // Login as admin
      await page.click('button:has-text("Admin")');
      await page.waitForURL('/admin/dashboard');
      
      // Navigate to feature flags
      await page.goto('/admin/feature-flags');
      
      // Find a feature flag and toggle it for a specific tenant
      const flagCard = page.locator('[data-testid="flag-card"]').first();
      await flagCard.click();
      
      // Set flag to ON for a specific tenant
      await page.click('button:has-text("Add Rule")');
      await page.selectOption('select[name="targetOrgType"]', 'RESTAURANT');
      await page.fill('input[name="targetOrgIds"]', 'org_restaurant_1');
      await page.click('button:has-text("Save Rule")');
      
      // Login as the specific restaurant
      await page.click('button:has-text("Logout")');
      await page.waitForURL('/login');
      await page.fill('input[name="email"]', 'restaurant@supplify.com');
      await page.fill('input[name="password"]', 'restaurant123');
      await page.click('button:has-text("Sign In")');
      
      // Verify the feature is enabled for this tenant
      await page.goto('/restaurant/dashboard');
      await expect(page.locator('[data-testid="feature-enabled"]')).toBeVisible();
      
      // Login as a different restaurant
      await page.click('button:has-text("Logout")');
      await page.waitForURL('/login');
      await page.fill('input[name="email"]', 'restaurant2@supplify.com');
      await page.fill('input[name="password"]', 'restaurant123');
      await page.click('button:has-text("Sign In")');
      
      // Verify the feature is NOT enabled for this tenant
      await page.goto('/restaurant/dashboard');
      await expect(page.locator('[data-testid="feature-enabled"]')).not.toBeVisible();
    });
  });

  test.describe('Subscription Limits per Tenant', () => {
    test('should enforce subscription limits per tenant', async ({ page }) => {
      // Login as a FREE tier restaurant
      await page.fill('input[name="email"]', 'restaurant@supplify.com');
      await page.fill('input[name="password"]', 'restaurant123');
      await page.click('button:has-text("Sign In")');
      
      // Try to create more products than FREE tier allows
      await page.goto('/restaurant/products');
      
      // Create products up to the limit
      for (let i = 0; i < 5; i++) {
        await page.click('button:has-text("Add Product")');
        await page.fill('input[name="name"]', `Product ${i + 1}`);
        await page.fill('input[name="price"]', '10.99');
        await page.click('button:has-text("Save")');
      }
      
      // Try to create one more product (should be blocked)
      await page.click('button:has-text("Add Product")');
      await page.fill('input[name="name"]', 'Excess Product');
      await page.fill('input[name="price"]', '10.99');
      await page.click('button:has-text("Save")');
      
      // Should show subscription limit error
      await expect(page.locator('text=Subscription limit reached')).toBeVisible();
    });
  });

  test.describe('Cache Isolation', () => {
    test('should isolate cache between tenants', async ({ page }) => {
      // Login as Restaurant A
      await page.click('button:has-text("Restaurant")');
      await page.waitForURL('/restaurant/dashboard');
      
      // Navigate to products and verify cache
      await page.goto('/restaurant/products');
      await page.waitForLoadState('networkidle');
      
      // Login as Restaurant B
      await page.click('button:has-text("Logout")');
      await page.waitForURL('/login');
      await page.fill('input[name="email"]', 'restaurant2@supplify.com');
      await page.fill('input[name="password"]', 'restaurant123');
      await page.click('button:has-text("Sign In")');
      
      // Navigate to products - should not see Restaurant A's cached data
      await page.goto('/restaurant/products');
      await page.waitForLoadState('networkidle');
      
      // Verify different data is loaded
      await expect(page.locator('text=Restaurant A Product')).not.toBeVisible();
    });
  });

  test.describe('Event Isolation', () => {
    test('should isolate events between tenants', async ({ page }) => {
      // Login as Restaurant A
      await page.click('button:has-text("Restaurant")');
      await page.waitForURL('/restaurant/dashboard');
      
      // Create an order
      await page.goto('/restaurant/orders');
      await page.click('button:has-text("Create Order")');
      await page.fill('input[name="supplier"]', 'Fresh Foods Supply');
      await page.click('button:has-text("Place Order")');
      
      // Verify order created event
      await expect(page.locator('text=Order created successfully')).toBeVisible();
      
      // Login as Restaurant B
      await page.click('button:has-text("Logout")');
      await page.waitForURL('/login');
      await page.fill('input[name="email"]', 'restaurant2@supplify.com');
      await page.fill('input[name="password"]', 'restaurant123');
      await page.click('button:has-text("Sign In")');
      
      // Navigate to orders - should not see Restaurant A's order
      await page.goto('/restaurant/orders');
      await expect(page.locator('text=Order created successfully')).not.toBeVisible();
    });
  });

  test.describe('Security Hardening', () => {
    test('should prevent SQL injection across tenants', async ({ page }) => {
      // Login as Restaurant A
      await page.click('button:has-text("Restaurant")');
      await page.waitForURL('/restaurant/dashboard');
      
      // Try to inject SQL in search
      await page.goto('/restaurant/products');
      await page.fill('input[placeholder*="Search"]', "'; DROP TABLE products; --");
      await page.press('input[placeholder*="Search"]', 'Enter');
      
      // Should not crash or affect other tenants
      await expect(page.locator('text=Error')).not.toBeVisible();
      
      // Login as Restaurant B and verify their data is intact
      await page.click('button:has-text("Logout")');
      await page.waitForURL('/login');
      await page.fill('input[name="email"]', 'restaurant2@supplify.com');
      await page.fill('input[name="password"]', 'restaurant123');
      await page.click('button:has-text("Sign In")');
      
      await page.goto('/restaurant/products');
      await expect(page.locator('text=Product')).toBeVisible();
    });

    test('should prevent unauthorized tenant access', async ({ page }) => {
      // Try to access admin routes without being admin
      await page.goto('/admin/dashboard');
      
      // Should redirect to login or show access denied
      await expect(page.locator('text=Access Denied')).toBeVisible();
      
      // Try to access with invalid tenant ID
      await page.goto('/admin/tenant-switcher');
      await page.fill('input[name="clientId"]', 'invalid_tenant_id');
      await page.click('button:has-text("Switch")');
      
      // Should show error
      await expect(page.locator('text=Invalid tenant')).toBeVisible();
    });
  });

  test.describe('Performance per Tenant', () => {
    test('should maintain performance isolation', async ({ page }) => {
      // Login as Restaurant A
      await page.click('button:has-text("Restaurant")');
      await page.waitForURL('/restaurant/dashboard');
      
      // Measure page load time
      const startTime = Date.now();
      await page.goto('/restaurant/products');
      await page.waitForLoadState('networkidle');
      const loadTimeA = Date.now() - startTime;
      
      // Login as Restaurant B
      await page.click('button:has-text("Logout")');
      await page.waitForURL('/login');
      await page.fill('input[name="email"]', 'restaurant2@supplify.com');
      await page.fill('input[name="password"]', 'restaurant123');
      await page.click('button:has-text("Sign In")');
      
      // Measure page load time for different tenant
      const startTimeB = Date.now();
      await page.goto('/restaurant/products');
      await page.waitForLoadState('networkidle');
      const loadTimeB = Date.now() - startTimeB;
      
      // Both should load reasonably fast (under 3 seconds)
      expect(loadTimeA).toBeLessThan(3000);
      expect(loadTimeB).toBeLessThan(3000);
    });
  });
});
