# Supplify E2E Test Suite

Comprehensive end-to-end tests for all Supplify features.

## Test Files

1. **auth.test.js** - Authentication (login, logout, tokens)
2. **products.test.js** - Product CRUD, limits, search
3. **orders-comprehensive.test.js** - Order lifecycle, status updates, filters
4. **inventory.test.js** - Supplier and restaurant inventory tracking
5. **receiving.test.js** - Receiving workflow, quality tracking
6. **invoices-payments.test.js** - Invoice generation, payment recording
7. **quick-lists.test.js** - Quick lists, scheduled orders
8. **notifications.test.js** - Notification delivery, preferences
9. **admin-dashboard.test.js** - All admin features
10. **branches-warehouses.test.js** - Branch/warehouse limits and enforcement
11. **subscription-system-comprehensive.test.js** - Subscription-first system tests
12. **files.test.js** - File uploads, storage limits
13. **finance.test.js** - Finance dashboards, analytics
14. **pricing.test.js** - Product pricing, contracts
15. **onboarding.test.js** - Supplier and restaurant onboarding
16. **restaurant-inventory.test.js** - Restaurant inventory, multi-branch
17. **suppliers-restaurants.test.js** - Supplier/restaurant management

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/e2e/products.test.js

# Run with coverage
npm test -- --coverage
```

## Test Environment

- API URL: `http://localhost:4000` (configurable via `API_URL`)
- Requires running API server
- Requires test database with seeded data

## Test Data

Tests assume:
- Test users exist (restaurant@test.com, supplier@test.com, admin@test.com)
- Test products, orders, etc. can be created
- Database is reset or isolated per test run

## Coverage

Tests cover:
- ✅ All CRUD operations
- ✅ Plan limit enforcement
- ✅ 80% warnings and 100% blocks
- ✅ Feature flag resolution
- ✅ Admin overrides
- ✅ Multi-branch/warehouse scoping
- ✅ Audit logging
- ✅ Error handling

