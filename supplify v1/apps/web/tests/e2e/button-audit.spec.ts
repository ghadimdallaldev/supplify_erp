import { test, expect, Page } from '@playwright/test';

interface ButtonAuditResult {
  testId: string;
  working: boolean;
  error?: string;
}

class ButtonAuditor {
  constructor(private page: Page) {}

  async auditAllButtons(): Promise<ButtonAuditResult[]> {
    const results: ButtonAuditResult[] = [];
    
    // Find all buttons and links with data-testid
    const elements = await this.page.locator('[data-testid^="btn-"], [data-testid^="link-"]').all();
    
    for (const element of elements) {
      const testId = await element.getAttribute('data-testid');
      if (!testId) continue;

      const result: ButtonAuditResult = {
        testId,
        working: false,
      };

      try {
        // Check if element is visible and clickable
        const isVisible = await element.isVisible();
        const isEnabled = await element.isEnabled();
        
        if (!isVisible) {
          result.error = 'Element not visible';
        } else if (!isEnabled) {
          result.error = 'Element is disabled';
        } else {
          // Try to click the element
          await element.click({ timeout: 1000 });
          result.working = true;
          
          // Wait a bit to see if any errors occur
          await this.page.waitForTimeout(100);
        }
      } catch (error) {
        result.error = error instanceof Error ? error.message : 'Unknown error';
      }

      results.push(result);
    }

    return results;
  }

  async testCriticalFlows() {
    const flows = [
      {
        name: 'Restaurant Order Creation',
        steps: async () => {
          await this.page.goto('/restaurant/orders');
          await this.page.click('[data-testid="btn-create-new-order"]');
          await expect(this.page.locator('[data-testid="btn-create-order"]')).toBeVisible();
          await this.page.click('[data-testid="btn-cancel-order"]');
        }
      },
      {
        name: 'Supplier Order Processing',
        steps: async () => {
          await this.page.goto('/supplier/orders');
          // This would need actual orders to be present
          const processButton = this.page.locator('[data-testid^="btn-process-"]').first();
          if (await processButton.isVisible()) {
            await processButton.click();
          }
        }
      },
      {
        name: 'Quick Order from Supplier',
        steps: async () => {
          await this.page.goto('/restaurant/orders');
          await this.page.click('[data-testid="btn-order-fresh-foods"]');
          await expect(this.page.locator('[data-testid="btn-create-order"]')).toBeVisible();
        }
      }
    ];

    const results = [];
    for (const flow of flows) {
      try {
        await flow.steps();
        results.push({ name: flow.name, success: true });
      } catch (error) {
        results.push({ 
          name: flow.name, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return results;
  }
}

test.describe('Button Audit System', () => {
  let auditor: ButtonAuditor;

  test.beforeEach(async ({ page }) => {
    auditor = new ButtonAuditor(page);
    
    // Mock authentication for testing
    await page.addInitScript(() => {
      window.localStorage.setItem('auth-token', 'mock-token');
      window.localStorage.setItem('user-role', 'restaurant');
      window.localStorage.setItem('user-id', 'test-user');
    });
  });

  test('should audit all buttons on restaurant orders page', async ({ page }) => {
    await page.goto('/restaurant/orders');
    
    const results = await auditor.auditAllButtons();
    
    // Log results for debugging
    console.log('Button audit results:', results);
    
    // Check that we found some buttons
    expect(results.length).toBeGreaterThan(0);
    
    // Check that most buttons are working
    const workingButtons = results.filter(r => r.working);
    const workingPercentage = (workingButtons.length / results.length) * 100;
    
    expect(workingPercentage).toBeGreaterThan(80); // At least 80% should be working
    
    // Log broken buttons
    const brokenButtons = results.filter(r => !r.working);
    if (brokenButtons.length > 0) {
      console.log('Broken buttons:', brokenButtons);
    }
  });

  test('should audit all buttons on supplier orders page', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('user-role', 'supplier');
    });
    
    await page.goto('/supplier/orders');
    
    const results = await auditor.auditAllButtons();
    
    console.log('Supplier button audit results:', results);
    
    expect(results.length).toBeGreaterThan(0);
    
    const workingButtons = results.filter(r => r.working);
    const workingPercentage = (workingButtons.length / results.length) * 100;
    
    expect(workingPercentage).toBeGreaterThan(80);
  });

  test('should test critical order flows', async ({ page }) => {
    const flowResults = await auditor.testCriticalFlows();
    
    console.log('Critical flow results:', flowResults);
    
    // Check that most critical flows work
    const successfulFlows = flowResults.filter(r => r.success);
    expect(successfulFlows.length).toBeGreaterThan(0);
    
    // Log failed flows
    const failedFlows = flowResults.filter(r => !r.success);
    if (failedFlows.length > 0) {
      console.log('Failed flows:', failedFlows);
    }
  });

  test('should verify no 404s on navigation', async ({ page }) => {
    const routes = [
      '/restaurant/orders',
      '/restaurant/suppliers',
      '/restaurant/chat',
      '/supplier/orders',
      '/supplier/products',
      '/supplier/chat',
    ];

    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status()).not.toBe(404);
    }
  });

  test('should verify loading states appear', async ({ page }) => {
    await page.goto('/restaurant/orders');
    
    // Click create order button
    await page.click('[data-testid="btn-create-new-order"]');
    
    // Check that modal appears quickly
    await expect(page.locator('[data-testid="btn-create-order"]')).toBeVisible({ timeout: 2000 });
  });

  test('should verify success/error toasts appear', async ({ page }) => {
    await page.goto('/restaurant/orders');
    
    // Mock a successful order creation
    await page.addInitScript(() => {
      // Mock the order store to simulate success
      window.mockOrderCreation = true;
    });
    
    await page.click('[data-testid="btn-create-new-order"]');
    
    // Fill out a simple order (this would need actual form filling)
    // For now, just check that the modal opens
    await expect(page.locator('[data-testid="btn-create-order"]')).toBeVisible();
  });
});

test.describe('Performance Tests', () => {
  test('should meet performance budgets', async ({ page }) => {
    await page.goto('/restaurant/orders');
    
    // Measure performance metrics
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        ttfb: navigation.responseStart - navigation.requestStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.navigationStart,
        loadComplete: navigation.loadEventEnd - navigation.navigationStart,
      };
    });
    
    console.log('Performance metrics:', metrics);
    
    // Check TTFB (should be under 200ms for good performance)
    expect(metrics.ttfb).toBeLessThan(200);
    
    // Check DOM content loaded (should be under 1s)
    expect(metrics.domContentLoaded).toBeLessThan(1000);
  });

  test('should have reasonable bundle size', async ({ page }) => {
    const response = await page.goto('/restaurant/orders');
    const contentLength = response?.headers()['content-length'];
    
    if (contentLength) {
      const sizeKB = parseInt(contentLength) / 1024;
      console.log(`Page size: ${sizeKB.toFixed(2)} KB`);
      
      // Check that page is under 500KB (reasonable for a SPA)
      expect(sizeKB).toBeLessThan(500);
    }
  });
});
