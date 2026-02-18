# Test Coverage Report

## Overview

This document outlines the comprehensive test suite created for the Supplify platform. The tests cover API routes, services, utilities, middlewares, and React components.

## Test Structure

### API Tests (`apps/api/src/`)

#### Routes Tests

- ✅ `auth.routes.test.js` - Authentication routes (login, logout, OAuth callback, refresh); callback tests use `Object.defineProperty(req, 'protocol')` for redirect URI
- ✅ `subscriptions.routes.test.js` - Subscription current, usage, features for restaurant and supplier
- ✅ `products.routes.test.js` - Product CRUD operations
- ✅ `orders.routes.test.js` - Order management
- ✅ `inventory.routes.test.js` - Inventory management
- ✅ `suppliers.routes.test.js` - Supplier operations
- ✅ `restaurants.routes.test.js` - Restaurant operations
- ✅ `invoices.routes.test.js` - Invoice management
- ✅ `chat.routes.test.js` - Chat/messaging
- ✅ `reservations.routes.test.js` - Existing tests
- ✅ `orders.calendar.routes.test.js` - Existing tests
- ✅ `public.routes.test.js` - Staff portal time-entries, check-in, check-out (token auth)

#### Services Tests

- ✅ `notification.service.test.js` - Notification service
- ✅ `scheduled-orders.service.test.js` - Scheduled orders processing

#### Library Tests

- ✅ `db.test.js` - Database utilities (query, transactions)
- ✅ `rbac.test.js` - Role-based access control
- ✅ `subscription.test.js` - Subscription (getTenantSubscription, lazy free plan, checkLimit)

#### Middleware Tests

- ✅ `errorHandler.test.js` - Error handling middleware

#### Test Utilities

- ✅ `test/helpers.js` - Shared test utilities and mocks

### Web Tests (`apps/web/src/`)

#### Component Tests

- ✅ `components/AuthGuard.test.tsx` - Authentication guard
- ✅ `components/Header.test.tsx` - Header component
- ✅ `components/ui/button.test.tsx` - Button UI component

#### Hook Tests

- ✅ `hooks/useSocket.test.ts` - Socket.IO hook

#### Service Tests

- ✅ `services/api.test.ts` - API service

## Test Coverage by Category

### API Routes (29 total routes)

- **Tested**: 9 routes
- **Remaining**: 20 routes (can be added incrementally)

### API Services (2 total)

- **Tested**: 2 services ✅
- **Coverage**: 100%

### API Libraries (10 total)

- **Tested**: 3 libraries (db, rbac, subscription)
- **Remaining**: 7 libraries (auth, cache, logger, migrator, plan-enforcement, socket, tenant)

### API Middlewares (3 total)

- **Tested**: 1 middleware (errorHandler)
- **Remaining**: 2 middlewares (csrf, requestContext)

### React Components (23+ total)

- **Tested**: 3 components
- **Remaining**: 20+ components

## Running Tests

### Run All Tests

```bash
pnpm test
```

### Run API Tests Only

```bash
pnpm --filter @supplify/api test
```

### Run Web Tests Only

```bash
pnpm --filter @supplify/web test
```

### Run Tests with Coverage

```bash
pnpm --filter @supplify/api test:coverage
pnpm --filter @supplify/web test:coverage
```

### Run Tests in CI Mode

```bash
pnpm test:ci
```

## Test Patterns

### API Route Testing Pattern

```javascript
import { setupMocks, createMockApp, clearAllMocks } from '../test/helpers.js';

describe('Route Name', () => {
  let app;
  let db;

  beforeEach(() => {
    clearAllMocks();
    db = setupMocks();
    app = createMockApp(routes);
  });

  it('should handle GET /endpoint', async () => {
    db.query.mockResolvedValueOnce({ rows: [...] });
    const response = await request(app).get('/endpoint').expect(200);
    expect(response.body.ok).toBe(true);
  });
});
```

### React Component Testing Pattern

```typescript
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('Component', () => {
  it('should render correctly', () => {
    render(<Component />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

## Next Steps

### High Priority

1. Add tests for remaining critical routes:
   - `admin.routes.test.js`
   - `admin-dashboard.routes.test.js`
   - `payments.routes.test.js`
   - `prices.routes.test.js`
   - `quick-lists.routes.test.js`

2. Add tests for remaining libraries:
   - `auth.test.js`
   - `subscription.test.js`
   - `tenant.test.js`

3. Add tests for remaining middlewares:
   - `csrf.test.js`
   - `requestContext.test.js`

### Medium Priority

4. Add tests for more React components
5. Add integration tests for critical flows
6. Add E2E tests for user journeys

### Low Priority

7. Add tests for utility functions
8. Add performance tests
9. Add accessibility tests

## Test Maintenance

- Run tests before committing: `pnpm test:ci`
- Keep test coverage above 70%
- Update tests when features change
- Add tests for bug fixes
- Review test failures in CI

## Notes

- Tests use Vitest for both API and Web
- API tests use supertest for HTTP testing
- Web tests use React Testing Library
- All tests are isolated and can run independently
- Mock data is centralized in test helpers
