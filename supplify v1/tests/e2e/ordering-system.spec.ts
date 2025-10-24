import { test, expect } from '@playwright/test';

test.describe('Multi-Tenant Ordering System E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000');
    
    // Login as restaurant user
    await page.fill('[data-testid="email-input"]', 'restaurant1@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Wait for dashboard to load
    await expect(page.locator('[data-testid="dashboard-title"]')).toBeVisible();
  });

  test('should create order with items from multiple suppliers and split correctly', async ({ page }) => {
    // Navigate to orders page
    await page.click('[data-testid="orders-nav"]');
    await expect(page.locator('[data-testid="orders-page-title"]')).toBeVisible();

    // Click create new order
    await page.click('[data-testid="create-order-button"]');
    await expect(page.locator('[data-testid="create-order-modal"]')).toBeVisible();

    // Add items from different suppliers
    await page.selectOption('[data-testid="supplier-select"]', 'fresh-foods');
    await page.fill('[data-testid="product-search"]', 'Fresh Chicken Breast');
    await page.click('[data-testid="add-product-button"]');
    await page.fill('[data-testid="quantity-input"]', '10');
    await page.click('[data-testid="add-to-cart-button"]');

    await page.selectOption('[data-testid="supplier-select"]', 'premium-meats');
    await page.fill('[data-testid="product-search"]', 'Premium Beef');
    await page.click('[data-testid="add-product-button"]');
    await page.fill('[data-testid="quantity-input"]', '5');
    await page.click('[data-testid="add-to-cart-button"]');

    // Fill delivery details
    await page.fill('[data-testid="delivery-address"]', '123 Test Street, Test City');
    await page.fill('[data-testid="delivery-notes"]', 'Please deliver during business hours');
    await page.selectOption('[data-testid="delivery-date"]', '2024-01-25');

    // Place order
    await page.click('[data-testid="place-order-button"]');

    // Wait for success message
    await expect(page.locator('[data-testid="order-success-message"]')).toBeVisible();

    // Verify orders are created and split by supplier
    await page.click('[data-testid="orders-nav"]');
    
    // Check that multiple orders are created
    const orderRows = page.locator('[data-testid="order-row"]');
    await expect(orderRows).toHaveCount(2);

    // Verify order details
    const firstOrder = orderRows.first();
    const secondOrder = orderRows.nth(1);

    await expect(firstOrder.locator('[data-testid="supplier-name"]')).toContainText('Fresh Foods');
    await expect(secondOrder.locator('[data-testid="supplier-name"]')).toContainText('Premium Meats');

    // Verify order statuses
    await expect(firstOrder.locator('[data-testid="order-status"]')).toContainText('PLACED');
    await expect(secondOrder.locator('[data-testid="order-status"]')).toContainText('PLACED');
  });

  test('should handle order status transitions correctly', async ({ page }) => {
    // Create an order first
    await page.click('[data-testid="orders-nav"]');
    await page.click('[data-testid="create-order-button"]');
    
    await page.selectOption('[data-testid="supplier-select"]', 'fresh-foods');
    await page.fill('[data-testid="product-search"]', 'Fresh Chicken Breast');
    await page.click('[data-testid="add-product-button"]');
    await page.fill('[data-testid="quantity-input"]', '5');
    await page.click('[data-testid="add-to-cart-button"]');
    
    await page.fill('[data-testid="delivery-address"]', '123 Test Street');
    await page.selectOption('[data-testid="delivery-date"]', '2024-01-25');
    await page.click('[data-testid="place-order-button"]');
    
    await expect(page.locator('[data-testid="order-success-message"]')).toBeVisible();

    // Switch to supplier view
    await page.click('[data-testid="logout-button"]');
    await page.fill('[data-testid="email-input"]', 'supplier1@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Navigate to supplier orders
    await page.click('[data-testid="supplier-orders-nav"]');
    await expect(page.locator('[data-testid="supplier-orders-title"]')).toBeVisible();

    // Find the order and acknowledge it
    const orderRow = page.locator('[data-testid="supplier-order-row"]').first();
    await expect(orderRow.locator('[data-testid="order-status"]')).toContainText('PLACED');
    
    await orderRow.locator('[data-testid="acknowledge-button"]').click();
    await expect(page.locator('[data-testid="acknowledge-success"]')).toBeVisible();
    
    // Verify status changed to ACKNOWLEDGED
    await expect(orderRow.locator('[data-testid="order-status"]')).toContainText('ACKNOWLEDGED');

    // Set preparing
    await orderRow.locator('[data-testid="set-preparing-button"]').click();
    await page.fill('[data-testid="preparation-note"]', 'Starting preparation');
    await page.click('[data-testid="confirm-preparing-button"]');
    await expect(page.locator('[data-testid="preparing-success"]')).toBeVisible();
    
    // Verify status changed to PREPARING
    await expect(orderRow.locator('[data-testid="order-status"]')).toContainText('PREPARING');

    // Dispatch order
    await orderRow.locator('[data-testid="dispatch-button"]').click();
    await page.fill('[data-testid="carrier-name"]', 'Test Courier');
    await page.fill('[data-testid="driver-name"]', 'John Doe');
    await page.fill('[data-testid="driver-phone"]', '+1234567890');
    await page.fill('[data-testid="eta-input"]', '2024-01-25T15:00');
    await page.click('[data-testid="confirm-dispatch-button"]');
    await expect(page.locator('[data-testid="dispatch-success"]')).toBeVisible();
    
    // Verify status changed to DISPATCHED
    await expect(orderRow.locator('[data-testid="order-status"]')).toContainText('DISPATCHED');

    // Mark delivered
    await orderRow.locator('[data-testid="mark-delivered-button"]').click();
    await page.fill('[data-testid="proof-url"]', 'https://example.com/proof.jpg');
    await page.click('[data-testid="confirm-delivered-button"]');
    await expect(page.locator('[data-testid="delivered-success"]')).toBeVisible();
    
    // Verify status changed to DELIVERED
    await expect(orderRow.locator('[data-testid="order-status"]')).toContainText('DELIVERED');
  });

  test('should update restaurant dashboard in real-time', async ({ page }) => {
    // Check initial dashboard state
    await expect(page.locator('[data-testid="active-orders-count"]')).toContainText('0');
    await expect(page.locator('[data-testid="monthly-spend"]')).toContainText('$0');

    // Create an order
    await page.click('[data-testid="orders-nav"]');
    await page.click('[data-testid="create-order-button"]');
    
    await page.selectOption('[data-testid="supplier-select"]', 'fresh-foods');
    await page.fill('[data-testid="product-search"]', 'Fresh Chicken Breast');
    await page.click('[data-testid="add-product-button"]');
    await page.fill('[data-testid="quantity-input"]', '5');
    await page.click('[data-testid="add-to-cart-button"]');
    
    await page.fill('[data-testid="delivery-address"]', '123 Test Street');
    await page.selectOption('[data-testid="delivery-date"]', '2024-01-25');
    await page.click('[data-testid="place-order-button"]');
    
    await expect(page.locator('[data-testid="order-success-message"]')).toBeVisible();

    // Navigate back to dashboard
    await page.click('[data-testid="dashboard-nav"]');
    
    // Verify dashboard updated
    await expect(page.locator('[data-testid="active-orders-count"]')).toContainText('1');
    
    // Check recent orders section
    await expect(page.locator('[data-testid="recent-orders-list"]')).toBeVisible();
    const recentOrder = page.locator('[data-testid="recent-order-item"]').first();
    await expect(recentOrder.locator('[data-testid="order-id"]')).toBeVisible();
    await expect(recentOrder.locator('[data-testid="order-status"]')).toContainText('PLACED');
  });

  test('should handle inventory auto-receive on delivery', async ({ page }) => {
    // Create and deliver an order
    await page.click('[data-testid="orders-nav"]');
    await page.click('[data-testid="create-order-button"]');
    
    await page.selectOption('[data-testid="supplier-select"]', 'fresh-foods');
    await page.fill('[data-testid="product-search"]', 'Fresh Chicken Breast');
    await page.click('[data-testid="add-product-button"]');
    await page.fill('[data-testid="quantity-input"]', '10');
    await page.click('[data-testid="add-to-cart-button"]');
    
    await page.fill('[data-testid="delivery-address"]', '123 Test Street');
    await page.selectOption('[data-testid="delivery-date"]', '2024-01-25');
    await page.click('[data-testid="place-order-button"]');
    
    // Switch to supplier and deliver
    await page.click('[data-testid="logout-button"]');
    await page.fill('[data-testid="email-input"]', 'supplier1@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    await page.click('[data-testid="supplier-orders-nav"]');
    const orderRow = page.locator('[data-testid="supplier-order-row"]').first();
    
    // Acknowledge and deliver
    await orderRow.locator('[data-testid="acknowledge-button"]').click();
    await orderRow.locator('[data-testid="set-preparing-button"]').click();
    await page.click('[data-testid="confirm-preparing-button"]');
    await orderRow.locator('[data-testid="dispatch-button"]').click();
    await page.click('[data-testid="confirm-dispatch-button"]');
    await orderRow.locator('[data-testid="mark-delivered-button"]').click();
    await page.click('[data-testid="confirm-delivered-button"]');

    // Switch back to restaurant and check inventory
    await page.click('[data-testid="logout-button"]');
    await page.fill('[data-testid="email-input"]', 'restaurant1@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    await page.click('[data-testid="inventory-nav"]');
    await expect(page.locator('[data-testid="inventory-page-title"]')).toBeVisible();

    // Check that inventory was updated
    const inventoryItem = page.locator('[data-testid="inventory-item"]').filter({ hasText: 'Fresh Chicken Breast' });
    await expect(inventoryItem.locator('[data-testid="stock-quantity"]')).toContainText('10');

    // Check recent activity
    await expect(page.locator('[data-testid="recent-activity-title"]')).toBeVisible();
    const recentActivity = page.locator('[data-testid="recent-activity-item"]').first();
    await expect(recentActivity.locator('[data-testid="activity-type"]')).toContainText('RECEIVE');
    await expect(recentActivity.locator('[data-testid="activity-quantity"]')).toContainText('+10');
  });

  test('should handle loyalty points earning and redemption', async ({ page }) => {
    // Create and deliver an order to earn points
    await page.click('[data-testid="orders-nav"]');
    await page.click('[data-testid="create-order-button"]');
    
    await page.selectOption('[data-testid="supplier-select"]', 'fresh-foods');
    await page.fill('[data-testid="product-search"]', 'Fresh Chicken Breast');
    await page.click('[data-testid="add-product-button"]');
    await page.fill('[data-testid="quantity-input"]', '5');
    await page.click('[data-testid="add-to-cart-button"]');
    
    await page.fill('[data-testid="delivery-address"]', '123 Test Street');
    await page.selectOption('[data-testid="delivery-date"]', '2024-01-25');
    await page.click('[data-testid="place-order-button"]');
    
    // Deliver the order
    await page.click('[data-testid="logout-button"]');
    await page.fill('[data-testid="email-input"]', 'supplier1@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    await page.click('[data-testid="supplier-orders-nav"]');
    const orderRow = page.locator('[data-testid="supplier-order-row"]').first();
    
    await orderRow.locator('[data-testid="acknowledge-button"]').click();
    await orderRow.locator('[data-testid="set-preparing-button"]').click();
    await page.click('[data-testid="confirm-preparing-button"]');
    await orderRow.locator('[data-testid="dispatch-button"]').click();
    await page.click('[data-testid="confirm-dispatch-button"]');
    await orderRow.locator('[data-testid="mark-delivered-button"]').click();
    await page.click('[data-testid="confirm-delivered-button"]');

    // Switch back to restaurant and check loyalty points
    await page.click('[data-testid="logout-button"]');
    await page.fill('[data-testid="email-input"]', 'restaurant1@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Check dashboard for loyalty points
    await expect(page.locator('[data-testid="loyalty-points-count"]')).not.toContainText('0');

    // Create another order and redeem points
    await page.click('[data-testid="orders-nav"]');
    await page.click('[data-testid="create-order-button"]');
    
    await page.selectOption('[data-testid="supplier-select"]', 'fresh-foods');
    await page.fill('[data-testid="product-search"]', 'Fresh Tomatoes');
    await page.click('[data-testid="add-product-button"]');
    await page.fill('[data-testid="quantity-input"]', '3');
    await page.click('[data-testid="add-to-cart-button"]');
    
    // Redeem loyalty points
    await page.click('[data-testid="redeem-loyalty-toggle"]');
    await page.fill('[data-testid="redeem-points-input"]', '50');
    await page.click('[data-testid="apply-loyalty-discount"]');
    
    await page.fill('[data-testid="delivery-address"]', '123 Test Street');
    await page.selectOption('[data-testid="delivery-date"]', '2024-01-25');
    await page.click('[data-testid="place-order-button"]');
    
    await expect(page.locator('[data-testid="order-success-message"]')).toBeVisible();
  });

  test('should generate invoice on delivery', async ({ page }) => {
    // Create and deliver an order
    await page.click('[data-testid="orders-nav"]');
    await page.click('[data-testid="create-order-button"]');
    
    await page.selectOption('[data-testid="supplier-select"]', 'fresh-foods');
    await page.fill('[data-testid="product-search"]', 'Fresh Chicken Breast');
    await page.click('[data-testid="add-product-button"]');
    await page.fill('[data-testid="quantity-input"]', '5');
    await page.click('[data-testid="add-to-cart-button"]');
    
    await page.fill('[data-testid="delivery-address"]', '123 Test Street');
    await page.selectOption('[data-testid="delivery-date"]', '2024-01-25');
    await page.click('[data-testid="place-order-button"]');
    
    // Deliver the order
    await page.click('[data-testid="logout-button"]');
    await page.fill('[data-testid="email-input"]', 'supplier1@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    await page.click('[data-testid="supplier-orders-nav"]');
    const orderRow = page.locator('[data-testid="supplier-order-row"]').first();
    
    await orderRow.locator('[data-testid="acknowledge-button"]').click();
    await orderRow.locator('[data-testid="set-preparing-button"]').click();
    await page.click('[data-testid="confirm-preparing-button"]');
    await orderRow.locator('[data-testid="dispatch-button"]').click();
    await page.click('[data-testid="confirm-dispatch-button"]');
    await orderRow.locator('[data-testid="mark-delivered-button"]').click();
    await page.click('[data-testid="confirm-delivered-button"]');

    // Switch back to restaurant and check invoices
    await page.click('[data-testid="logout-button"]');
    await page.fill('[data-testid="email-input"]', 'restaurant1@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    await page.click('[data-testid="invoices-nav"]');
    await expect(page.locator('[data-testid="invoices-page-title"]')).toBeVisible();

    // Check that invoice was generated
    const invoiceRow = page.locator('[data-testid="invoice-row"]').first();
    await expect(invoiceRow.locator('[data-testid="invoice-status"]')).toContainText('PENDING');
    await expect(invoiceRow.locator('[data-testid="invoice-amount"]')).toBeVisible();

    // Click on invoice to view details
    await invoiceRow.click();
    await expect(page.locator('[data-testid="invoice-details-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="invoice-items-list"]')).toBeVisible();
  });

  test('should enforce feature flags correctly', async ({ page }) => {
    // Test with orders_realtime feature flag disabled
    await page.goto('http://localhost:3000?feature_flags=orders_realtime:false');
    
    // Login
    await page.fill('[data-testid="email-input"]', 'restaurant1@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Check that real-time features are hidden
    await expect(page.locator('[data-testid="realtime-timeline"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="order-status-updates"]')).not.toBeVisible();

    // Test with orders_realtime feature flag enabled
    await page.goto('http://localhost:3000?feature_flags=orders_realtime:true');
    
    // Check that real-time features are visible
    await expect(page.locator('[data-testid="realtime-timeline"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-status-updates"]')).toBeVisible();
  });
});
