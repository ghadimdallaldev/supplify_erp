import { test, expect } from '@playwright/test';

test.describe('PromoSuite E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000');
    
    // Mock authentication - replace with actual login flow
    await page.evaluate(() => {
      localStorage.setItem('auth-token', 'mock-token');
      localStorage.setItem('user-role', 'supplier');
      localStorage.setItem('user-tier', 'PRO');
    });
  });

  test.describe('Feature Flag ON/OFF Scenarios', () => {
    test('should hide PromoSuite when promotions_extended flag is OFF', async ({ page }) => {
      // Mock feature flag disabled
      await page.evaluate(() => {
        localStorage.setItem('feature-flags', JSON.stringify({
          promotions_extended: { enabled: false }
        }));
      });

      await page.goto('http://localhost:3000/supplier/promotions-suite');
      
      // Should show disabled message
      await expect(page.locator('text=PromoSuite is currently disabled')).toBeVisible();
      
      // Should not show campaign management UI
      await expect(page.locator('[data-testid="create-campaign-button"]')).not.toBeVisible();
    });

    test('should show PromoSuite when promotions_extended flag is ON', async ({ page }) => {
      // Mock feature flag enabled
      await page.evaluate(() => {
        localStorage.setItem('feature-flags', JSON.stringify({
          promotions_extended: { enabled: true }
        }));
      });

      await page.goto('http://localhost:3000/supplier/promotions-suite');
      
      // Should show PromoSuite dashboard
      await expect(page.locator('h1:has-text("PromoSuite Dashboard")')).toBeVisible();
      await expect(page.locator('[data-testid="create-campaign-button"]')).toBeVisible();
    });
  });

  test.describe('Campaign Creation Flow', () => {
    test('should create Sponsored Visibility campaign', async ({ page }) => {
      await page.goto('http://localhost:3000/supplier/promotions-suite');
      
      // Click create campaign button
      await page.click('[data-testid="create-campaign-button"]');
      
      // Select Sponsored Visibility type
      await page.selectOption('[data-testid="campaign-type-select"]', 'SPONSORED_VISIBILITY');
      
      // Fill campaign details
      await page.fill('[data-testid="campaign-name-input"]', 'Holiday Boost Campaign');
      await page.fill('[data-testid="campaign-description-input"]', 'Boost supplier visibility during holidays');
      
      // Select placement
      await page.selectOption('[data-testid="placement-select"]', 'SUPPLIER_CARD');
      
      // Set budget
      await page.fill('[data-testid="total-budget-input"]', '1000');
      await page.fill('[data-testid="daily-budget-input"]', '50');
      await page.fill('[data-testid="cpm-input"]', '2.5');
      
      // Set dates
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      await page.fill('[data-testid="start-date-input"]', startDate.toISOString().split('T')[0]);
      await page.fill('[data-testid="end-date-input"]', endDate.toISOString().split('T')[0]);
      
      // Submit campaign
      await page.click('[data-testid="submit-campaign-button"]');
      
      // Should show success message
      await expect(page.locator('text=Campaign created successfully')).toBeVisible();
      
      // Should redirect to campaign list
      await expect(page.locator('text=Holiday Boost Campaign')).toBeVisible();
    });

    test('should create Discount Campaign', async ({ page }) => {
      await page.goto('http://localhost:3000/supplier/promotions-suite');
      
      await page.click('[data-testid="create-campaign-button"]');
      
      // Select Discount type
      await page.selectOption('[data-testid="campaign-type-select"]', 'DISCOUNT');
      
      // Fill campaign details
      await page.fill('[data-testid="campaign-name-input"]', 'Winter Sale');
      await page.selectOption('[data-testid="discount-type-select"]', 'PERCENT');
      await page.fill('[data-testid="discount-value-input"]', '20');
      await page.fill('[data-testid="min-qty-input"]', '5');
      
      // Set dates
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      
      await page.fill('[data-testid="start-date-input"]', startDate.toISOString().split('T')[0]);
      await page.fill('[data-testid="end-date-input"]', endDate.toISOString().split('T')[0]);
      
      await page.click('[data-testid="submit-campaign-button"]');
      
      await expect(page.locator('text=Campaign created successfully')).toBeVisible();
    });

    test('should create Featured Product campaign', async ({ page }) => {
      await page.goto('http://localhost:3000/supplier/promotions-suite');
      
      await page.click('[data-testid="create-campaign-button"]');
      
      // Select Featured Product type
      await page.selectOption('[data-testid="campaign-type-select"]', 'FEATURED_PRODUCT');
      
      // Fill campaign details
      await page.fill('[data-testid="campaign-name-input"]', 'Featured Vegetables');
      await page.fill('[data-testid="feature-slots-input"]', '3');
      
      // Set dates
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
      
      await page.fill('[data-testid="start-date-input"]', startDate.toISOString().split('T')[0]);
      await page.fill('[data-testid="end-date-input"]', endDate.toISOString().split('T')[0]);
      
      await page.click('[data-testid="submit-campaign-button"]');
      
      await expect(page.locator('text=Campaign created successfully')).toBeVisible();
    });
  });

  test.describe('Restaurant-Facing Features', () => {
    test('should show sponsored badges on supplier list', async ({ page }) => {
      // Mock restaurant user
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'restaurant');
        localStorage.setItem('feature-flags', JSON.stringify({
          promotions_extended: { enabled: true }
        }));
      });

      await page.goto('http://localhost:3000/restaurant/suppliers');
      
      // Should show PromoSuite active indicator
      await expect(page.locator('text=PromoSuite Active')).toBeVisible();
      
      // Should show sponsored badges
      await expect(page.locator('[data-testid="sponsored-badge"]')).toBeVisible();
      
      // Should show sponsored suppliers with blue background
      await expect(page.locator('tr.bg-blue-50')).toBeVisible();
    });

    test('should track impressions and clicks', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'restaurant');
        localStorage.setItem('feature-flags', JSON.stringify({
          promotions_extended: { enabled: true }
        }));
      });

      await page.goto('http://localhost:3000/restaurant/suppliers');
      
      // Hover over sponsored supplier (triggers impression)
      await page.hover('tr.bg-blue-50');
      
      // Click on sponsored supplier link (triggers click)
      await page.click('tr.bg-blue-50 a[href*="suppliers/"]');
      
      // Should navigate to supplier page
      await expect(page).toHaveURL(/\/restaurant\/suppliers\/fresh-foods/);
    });

    test('should show discount pricing on product pages', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'restaurant');
        localStorage.setItem('feature-flags', JSON.stringify({
          promotions_extended: { enabled: true }
        }));
      });

      await page.goto('http://localhost:3000/restaurant/suppliers/fresh-foods');
      
      // Should show discount badges
      await expect(page.locator('[data-testid="discount-badge"]')).toBeVisible();
      
      // Should show promotional pricing
      await expect(page.locator('[data-testid="promo-price"]')).toBeVisible();
      
      // Should show strike-through original price
      await expect(page.locator('[data-testid="compare-at-price"]')).toBeVisible();
    });

    test('should show featured products prominently', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'restaurant');
        localStorage.setItem('feature-flags', JSON.stringify({
          promotions_extended: { enabled: true }
        }));
      });

      await page.goto('http://localhost:3000/restaurant/suppliers/fresh-foods');
      
      // Should show featured badge
      await expect(page.locator('[data-testid="featured-badge"]')).toBeVisible();
      
      // Featured products should be at the top
      const featuredProducts = page.locator('[data-testid="featured-badge"]');
      const firstProduct = page.locator('.product-card').first();
      
      await expect(firstProduct.locator('[data-testid="featured-badge"]')).toBeVisible();
    });
  });

  test.describe('Admin Console', () => {
    test('should show admin PromoSuite console', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'admin');
        localStorage.setItem('feature-flags', JSON.stringify({
          promotions_extended: { enabled: true }
        }));
      });

      await page.goto('http://localhost:3000/admin/promotions-suite');
      
      // Should show admin console
      await expect(page.locator('h1:has-text("PromoSuite Admin Console")')).toBeVisible();
      
      // Should show KPIs
      await expect(page.locator('[data-testid="kpi-active-campaigns"]')).toBeVisible();
      await expect(page.locator('[data-testid="kpi-total-budget"]')).toBeVisible();
      await expect(page.locator('[data-testid="kpi-total-spent"]')).toBeVisible();
      await expect(page.locator('[data-testid="kpi-total-impressions"]')).toBeVisible();
    });

    test('should approve pending campaigns', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'admin');
        localStorage.setItem('feature-flags', JSON.stringify({
          promotions_extended: { enabled: true }
        }));
      });

      await page.goto('http://localhost:3000/admin/promotions-suite');
      
      // Should show pending campaigns
      await expect(page.locator('text=PENDING')).toBeVisible();
      
      // Click approve button
      await page.click('[data-testid="approve-campaign-button"]');
      
      // Should show success message
      await expect(page.locator('text=Campaign approved successfully')).toBeVisible();
      
      // Campaign status should change to ACTIVE
      await expect(page.locator('text=ACTIVE')).toBeVisible();
    });

    test('should reject campaigns with reason', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'admin');
        localStorage.setItem('feature-flags', JSON.stringify({
          promotions_extended: { enabled: true }
        }));
      });

      await page.goto('http://localhost:3000/admin/promotions-suite');
      
      // Click reject button
      await page.click('[data-testid="reject-campaign-button"]');
      
      // Fill rejection reason
      await page.fill('[data-testid="rejection-reason-input"]', 'Policy violation');
      
      // Submit rejection
      await page.click('[data-testid="submit-rejection-button"]');
      
      // Should show success message
      await expect(page.locator('text=Campaign rejected')).toBeVisible();
      
      // Campaign status should change to REJECTED
      await expect(page.locator('text=REJECTED')).toBeVisible();
    });
  });

  test.describe('Feature Flag Management', () => {
    test('should show feature flag admin interface', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'admin');
      });

      await page.goto('http://localhost:3000/admin/feature-flags');
      
      // Should show feature flag management interface
      await expect(page.locator('h1:has-text("Feature Flag Management")')).toBeVisible();
      
      // Should show promotions_extended flag
      await expect(page.locator('text=PromoSuite Extended')).toBeVisible();
      
      // Should show flag controls
      await expect(page.locator('[data-testid="flag-toggle"]')).toBeVisible();
      await expect(page.locator('[data-testid="rollout-slider"]')).toBeVisible();
    });

    test('should toggle feature flags', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'admin');
      });

      await page.goto('http://localhost:3000/admin/feature-flags');
      
      // Toggle promotions_extended flag
      await page.click('[data-testid="flag-toggle"]');
      
      // Should show success message
      await expect(page.locator('text=Feature flag updated')).toBeVisible();
    });

    test('should adjust rollout percentage', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'admin');
      });

      await page.goto('http://localhost:3000/admin/feature-flags');
      
      // Adjust rollout slider
      await page.locator('[data-testid="rollout-slider"]').fill('75');
      
      // Should show updated percentage
      await expect(page.locator('text=75%')).toBeVisible();
    });

    test('should add targeting rules', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'admin');
      });

      await page.goto('http://localhost:3000/admin/feature-flags');
      
      // Click add rule button
      await page.click('[data-testid="add-targeting-rule-button"]');
      
      // Select rule type
      await page.selectOption('[data-testid="rule-type-select"]', 'ORGANIZATION');
      
      // Select organizations
      await page.check('[data-testid="org-checkbox-org_1"]');
      await page.check('[data-testid="org-checkbox-org_2"]');
      
      // Set rule value
      await page.selectOption('[data-testid="rule-value-select"]', 'true');
      
      // Submit rule
      await page.click('[data-testid="submit-rule-button"]');
      
      // Should show success message
      await expect(page.locator('text=Targeting rule added')).toBeVisible();
    });
  });

  test.describe('V1 Promotions System', () => {
    test('should show V1 promotions dashboard', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'supplier');
        localStorage.setItem('user-tier', 'PRO');
      });

      await page.goto('http://localhost:3000/supplier/promotions-v1');
      
      // Should show V1 promotions dashboard
      await expect(page.locator('h1:has-text("Promotions & Boosted Visibility")')).toBeVisible();
      
      // Should show KPIs
      await expect(page.locator('[data-testid="kpi-active-campaigns"]')).toBeVisible();
      await expect(page.locator('[data-testid="kpi-total-budget"]')).toBeVisible();
      await expect(page.locator('[data-testid="kpi-total-spent"]')).toBeVisible();
      await expect(page.locator('[data-testid="kpi-total-impressions"]')).toBeVisible();
    });

    test('should create V1 sponsored campaign', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('user-role', 'supplier');
        localStorage.setItem('user-tier', 'PRO');
      });

      await page.goto('http://localhost:3000/supplier/promotions-v1');
      
      // Click create campaign
      await page.click('[data-testid="create-campaign-button"]');
      
      // Fill campaign details
      await page.fill('[data-testid="campaign-name-input"]', 'V1 Sponsored Campaign');
      await page.selectOption('[data-testid="placement-select"]', 'SUPPLIER_CARD');
      await page.selectOption('[data-testid="objective-select"]', 'VISIBILITY');
      
      // Set budget
      await page.fill('[data-testid="total-budget-input"]', '500');
      await page.fill('[data-testid="daily-budget-input"]', '25');
      await page.fill('[data-testid="cpm-input"]', '2.0');
      
      // Set dates
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      
      await page.fill('[data-testid="start-date-input"]', startDate.toISOString().split('T')[0]);
      await page.fill('[data-testid="end-date-input"]', endDate.toISOString().split('T')[0]);
      
      // Submit campaign
      await page.click('[data-testid="submit-campaign-button"]');
      
      // Should show success message
      await expect(page.locator('text=Campaign created successfully')).toBeVisible();
    });
  });

  test.describe('Performance Tests', () => {
    test('should load PromoSuite dashboard quickly', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('http://localhost:3000/supplier/promotions-suite');
      
      // Wait for main content to load
      await page.waitForSelector('h1:has-text("PromoSuite Dashboard")');
      
      const loadTime = Date.now() - startTime;
      
      // Should load within 2 seconds
      expect(loadTime).toBeLessThan(2000);
    });

    test('should handle large campaign lists efficiently', async ({ page }) => {
      // Mock large number of campaigns
      await page.evaluate(() => {
        window.mockCampaigns = Array.from({ length: 100 }, (_, i) => ({
          id: `campaign_${i}`,
          name: `Campaign ${i}`,
          status: 'ACTIVE',
          type: 'SPONSORED_VISIBILITY',
        }));
      });

      await page.goto('http://localhost:3000/supplier/promotions-suite');
      
      // Should show campaigns without performance issues
      await expect(page.locator('[data-testid="campaign-card"]')).toHaveCount(100);
    });
  });
});
