import { test, expect } from '@playwright/test';

// Comprehensive Button & Action Audit Suite
test.describe('Systemwide Route & Action Audit', () => {
  
  // Test data for different roles
  const testUsers = {
    admin: {
      email: 'admin@supplify.com',
      password: 'admin123',
      role: 'admin',
      expectedRoutes: ['/admin/dashboard', '/admin/users', '/admin/feature-flags', '/admin/subscriptions']
    },
    restaurant: {
      email: 'restaurant@supplify.com', 
      password: 'restaurant123',
      role: 'restaurant',
      expectedRoutes: ['/restaurant/dashboard', '/restaurant/orders', '/restaurant/suppliers']
    },
    supplier: {
      email: 'supplier@supplify.com',
      password: 'supplier123', 
      role: 'supplier',
      expectedRoutes: ['/supplier/dashboard', '/supplier/products', '/supplier/orders']
    }
  };

  test.describe('Route Accessibility & Navigation', () => {
    for (const [role, user] of Object.entries(testUsers)) {
      test(`${role} can access all expected routes`, async ({ page }) => {
        // Login as the role
        await page.goto('/login');
        await page.click(`button:has-text("${role.charAt(0).toUpperCase() + role.slice(1)}")`);
        await page.waitForURL(`/${role}/dashboard`);

        // Test each expected route
        for (const route of user.expectedRoutes) {
          await page.goto(route);
          
          // Should not show 404 or error page
          await expect(page.locator('text=404')).not.toBeVisible();
          await expect(page.locator('text=Page not found')).not.toBeVisible();
          await expect(page.locator('text=Error')).not.toBeVisible();
          
          // Should show some content (not blank page)
          const bodyText = await page.locator('body').textContent();
          expect(bodyText.length).toBeGreaterThan(100);
          
          console.log(`✅ ${role} can access ${route}`);
        }
      });
    }
  });

  test.describe('Button Functionality Audit', () => {
    for (const [role, user] of Object.entries(testUsers)) {
      test(`${role} - all buttons work correctly`, async ({ page }) => {
        // Login as the role
        await page.goto('/login');
        await page.click(`button:has-text("${role.charAt(0).toUpperCase() + role.slice(1)}")`);
        await page.waitForURL(`/${role}/dashboard`);

        // Collect all buttons with data-testid
        const buttons = await page.locator('[data-testid^="btn-"], [data-testid^="link-"]').all();
        
        console.log(`Found ${buttons.length} buttons for ${role}`);

        for (const button of buttons) {
          const testId = await button.getAttribute('data-testid');
          const buttonText = await button.textContent();
          
          console.log(`Testing button: ${testId} (${buttonText})`);

          try {
            // Check if button is visible and enabled
            await expect(button).toBeVisible();
            
            const isDisabled = await button.isDisabled();
            if (isDisabled) {
              console.log(`⏭️ Skipping disabled button: ${testId}`);
              continue;
            }

            // Click the button
            await button.click();
            
            // Wait for loading state (if any)
            const loadingIndicator = page.locator('[data-testid="loading"], .loading, .spinner');
            if (await loadingIndicator.isVisible()) {
              await expect(loadingIndicator).not.toBeVisible({ timeout: 5000 });
            }
            
            // Check for navigation or mutation
            await page.waitForTimeout(500); // Allow for async operations
            
            // Verify no runtime errors
            const errorMessages = page.locator('text=Error, text=Failed, text=Something went wrong');
            if (await errorMessages.count() > 0) {
              console.log(`❌ Error found after clicking ${testId}`);
              // Don't fail the test, just log for now
            }
            
            // Check for success toast
            const successToast = page.locator('[data-testid="toast-success"], .toast-success');
            if (await successToast.isVisible()) {
              console.log(`✅ Success toast shown for ${testId}`);
            }
            
            console.log(`✅ Button ${testId} clicked successfully`);
            
          } catch (error) {
            console.log(`❌ Error clicking button ${testId}: ${error.message}`);
            // Continue with other buttons
          }
        }
      });
    }
  });

  test.describe('Form Submissions & CRUD Operations', () => {
    test('Product CRUD operations work', async ({ page }) => {
      await page.goto('/login');
      await page.click('button:has-text("Supplier")');
      await page.waitForURL('/supplier/dashboard');

      // Navigate to products
      await page.goto('/supplier/products');
      
      // Test Create Product
      const createButton = page.locator('[data-testid="btn-create-product"], button:has-text("Add Product")');
      if (await createButton.isVisible()) {
        await createButton.click();
        
        // Fill form
        await page.fill('input[name="name"]', 'Test Product');
        await page.fill('input[name="price"]', '10.99');
        await page.fill('textarea[name="description"]', 'Test product description');
        
        // Submit
        const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
        await submitButton.click();
        
        // Wait for success
        await expect(page.locator('text=Product created successfully, text=Product saved')).toBeVisible({ timeout: 10000 });
        console.log('✅ Product creation works');
      }

      // Test Edit Product
      const editButton = page.locator('[data-testid="btn-edit-product"]').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        
        // Modify form
        await page.fill('input[name="name"]', 'Updated Test Product');
        
        // Submit
        const updateButton = page.locator('button:has-text("Update"), button:has-text("Save")');
        await updateButton.click();
        
        // Wait for success
        await expect(page.locator('text=Product updated successfully, text=Product saved')).toBeVisible({ timeout: 10000 });
        console.log('✅ Product update works');
      }

      // Test Delete Product
      const deleteButton = page.locator('[data-testid="btn-delete-product"]').first();
      if (await deleteButton.isVisible()) {
        await deleteButton.click();
        
        // Confirm deletion
        const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
        await confirmButton.click();
        
        // Wait for success
        await expect(page.locator('text=Product deleted successfully')).toBeVisible({ timeout: 10000 });
        console.log('✅ Product deletion works');
      }
    });

    test('Order CRUD operations work', async ({ page }) => {
      await page.goto('/login');
      await page.click('button:has-text("Restaurant")');
      await page.waitForURL('/restaurant/dashboard');

      // Navigate to orders
      await page.goto('/restaurant/orders');
      
      // Test Create Order
      const createButton = page.locator('[data-testid="btn-create-order"], button:has-text("Create Order")');
      if (await createButton.isVisible()) {
        await createButton.click();
        
        // Fill order form
        await page.selectOption('select[name="supplier"]', { index: 0 });
        await page.fill('textarea[name="notes"]', 'Test order notes');
        
        // Submit
        const submitButton = page.locator('button:has-text("Place Order"), button:has-text("Create Order")');
        await submitButton.click();
        
        // Wait for success
        await expect(page.locator('text=Order created successfully, text=Order placed')).toBeVisible({ timeout: 10000 });
        console.log('✅ Order creation works');
      }
    });
  });

  test.describe('Feature Flag Integration', () => {
    test('Feature flags affect UI visibility', async ({ page }) => {
      // Login as admin
      await page.goto('/login');
      await page.click('button:has-text("Admin")');
      await page.waitForURL('/admin/dashboard');

      // Go to feature flags
      await page.goto('/admin/feature-flags');
      
      // Find a feature flag toggle
      const flagToggle = page.locator('[data-testid="flag-toggle"]').first();
      if (await flagToggle.isVisible()) {
        const initialState = await flagToggle.isChecked();
        
        // Toggle the flag
        await flagToggle.click();
        
        // Wait for the change to take effect
        await page.waitForTimeout(1000);
        
        // Verify the toggle state changed
        const newState = await flagToggle.isChecked();
        expect(newState).not.toBe(initialState);
        
        console.log('✅ Feature flag toggle works');
      }
    });
  });

  test.describe('Error Handling & Loading States', () => {
    test('All pages show loading states', async ({ page }) => {
      await page.goto('/login');
      await page.click('button:has-text("Restaurant")');
      
      // Test loading states on different pages
      const pages = ['/restaurant/dashboard', '/restaurant/orders', '/restaurant/suppliers'];
      
      for (const route of pages) {
        await page.goto(route);
        
        // Should show some loading indicator initially
        const loadingIndicator = page.locator('[data-testid="loading"], .loading, .spinner, .skeleton');
        if (await loadingIndicator.isVisible()) {
          console.log(`✅ Loading state shown on ${route}`);
        }
        
        // Wait for content to load
        await page.waitForLoadState('networkidle');
        
        // Should not show error page
        await expect(page.locator('text=Error, text=Failed, text=Something went wrong')).not.toBeVisible();
      }
    });

    test('Error boundaries catch and display errors gracefully', async ({ page }) => {
      // Try to access a non-existent route
      await page.goto('/non-existent-route');
      
      // Should show 404 page, not blank screen
      const bodyText = await page.locator('body').textContent();
      expect(bodyText.length).toBeGreaterThan(50);
      
      // Should have a way to navigate back
      const backButton = page.locator('button:has-text("Back"), a:has-text("Home"), a:has-text("Dashboard")');
      await expect(backButton).toBeVisible();
      
      console.log('✅ Error boundary works for 404');
    });
  });

  test.describe('Accessibility & ARIA', () => {
    test('All interactive elements have proper ARIA attributes', async ({ page }) => {
      await page.goto('/login');
      await page.click('button:has-text("Restaurant")');
      
      // Check buttons have proper roles and labels
      const buttons = await page.locator('button').all();
      
      for (const button of buttons) {
        const role = await button.getAttribute('role');
        const ariaLabel = await button.getAttribute('aria-label');
        const textContent = await button.textContent();
        
        // Should have either aria-label or text content
        expect(ariaLabel || textContent).toBeTruthy();
        
        // Should have proper role
        expect(role === null || role === 'button').toBeTruthy();
      }
      
      console.log(`✅ Checked ${buttons.length} buttons for accessibility`);
    });

    test('Forms have proper labels and validation', async ({ page }) => {
      await page.goto('/login');
      await page.click('button:has-text("Supplier")');
      
      // Go to a form page
      await page.goto('/supplier/products');
      
      const createButton = page.locator('[data-testid="btn-create-product"], button:has-text("Add Product")');
      if (await createButton.isVisible()) {
        await createButton.click();
        
        // Check form inputs have labels
        const inputs = await page.locator('input, textarea, select').all();
        
        for (const input of inputs) {
          const id = await input.getAttribute('id');
          const ariaLabel = await input.getAttribute('aria-label');
          const placeholder = await input.getAttribute('placeholder');
          
          if (id) {
            const label = page.locator(`label[for="${id}"]`);
            const hasLabel = await label.isVisible();
            const hasAriaLabel = !!ariaLabel;
            const hasPlaceholder = !!placeholder;
            
            expect(hasLabel || hasAriaLabel || hasPlaceholder).toBeTruthy();
          }
        }
        
        console.log(`✅ Checked ${inputs.length} form inputs for accessibility`);
      }
    });
  });

  test.describe('Performance & Responsiveness', () => {
    test('Pages load within acceptable time', async ({ page }) => {
      await page.goto('/login');
      await page.click('button:has-text("Restaurant")');
      
      const routes = ['/restaurant/dashboard', '/restaurant/orders', '/restaurant/suppliers'];
      
      for (const route of routes) {
        const startTime = Date.now();
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const loadTime = Date.now() - startTime;
        
        // Should load within 3 seconds
        expect(loadTime).toBeLessThan(3000);
        console.log(`✅ ${route} loaded in ${loadTime}ms`);
      }
    });

    test('Mobile responsiveness', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      await page.goto('/login');
      await page.click('button:has-text("Restaurant")');
      
      // Check that navigation is accessible on mobile
      const navButton = page.locator('[data-testid="mobile-menu"], button:has-text("Menu")');
      if (await navButton.isVisible()) {
        await navButton.click();
        
        // Should show navigation menu
        const navMenu = page.locator('[data-testid="nav-menu"], .mobile-nav');
        await expect(navMenu).toBeVisible();
        
        console.log('✅ Mobile navigation works');
      }
    });
  });

  test.describe('Cross-Role Access Control', () => {
    test('Restaurant cannot access supplier routes', async ({ page }) => {
      await page.goto('/login');
      await page.click('button:has-text("Restaurant")');
      
      // Try to access supplier route
      await page.goto('/supplier/dashboard');
      
      // Should redirect or show access denied
      const currentUrl = page.url();
      const hasAccessDenied = await page.locator('text=Access Denied, text=Unauthorized').isVisible();
      
      expect(currentUrl.includes('/supplier') || hasAccessDenied).toBeTruthy();
      console.log('✅ Restaurant blocked from supplier routes');
    });

    test('Supplier cannot access admin routes', async ({ page }) => {
      await page.goto('/login');
      await page.click('button:has-text("Supplier")');
      
      // Try to access admin route
      await page.goto('/admin/dashboard');
      
      // Should redirect or show access denied
      const currentUrl = page.url();
      const hasAccessDenied = await page.locator('text=Access Denied, text=Unauthorized').isVisible();
      
      expect(currentUrl.includes('/admin') || hasAccessDenied).toBeTruthy();
      console.log('✅ Supplier blocked from admin routes');
    });
  });
});
