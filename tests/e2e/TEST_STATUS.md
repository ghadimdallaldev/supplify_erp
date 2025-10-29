# E2E Test Suite Status

## Test Execution

To run the E2E tests, you need:

1. **Running API Server**: `npm start` in `apps/api`
2. **Test Database**: Configured with proper connection
3. **Test Data**: Seed data for test users (restaurant@test.com, supplier@test.com, admin@test.com)

## Current Status

Tests are configured and ready, but many require:
- Running API server on port 4000
- Proper database setup
- Test user accounts
- Some tests are marked with `it.skip()` or have TODO comments for full implementation

## Running Tests

```bash
# From root directory
npm test

# Or from apps/api directory
cd apps/api
npm test

# Run specific test file
npm test -- tests/e2e/auth.test.js

# Run all E2E tests
npm test -- tests/e2e

# Run with coverage
npm test -- --coverage
```

## Test Files Summary

- ✅ **auth.test.js** - Authentication tests
- ✅ **products.test.js** - Product CRUD and limits
- ✅ **orders-comprehensive.test.js** - Order lifecycle
- ✅ **inventory.test.js** - Inventory tracking
- ✅ **receiving.test.js** - Receiving workflow
- ✅ **invoices-payments.test.js** - Finance operations
- ✅ **quick-lists.test.js** - Quick lists feature
- ✅ **notifications.test.js** - Notification system
- ✅ **admin-dashboard.test.js** - Admin features
- ✅ **branches-warehouses.test.js** - Branch/warehouse limits
- ✅ **subscription-system-comprehensive.test.js** - Subscription enforcement
- ✅ **files.test.js** - File uploads (requires form-data setup)
- ✅ **finance.test.js** - Finance dashboards
- ✅ **pricing.test.js** - Product pricing
- ✅ **onboarding.test.js** - Onboarding flows
- ✅ **restaurant-inventory.test.js** - Restaurant inventory
- ✅ **suppliers-restaurants.test.js** - Tenant management

## Notes

- Tests use Vitest (not Jest)
- Tests require HTTP calls to running API server
- Some tests skip actual API calls and have TODO placeholders
- Full implementation requires:
  - Test user setup
  - Database seeding
  - Mock data generation
  - Proper error handling for network failures

