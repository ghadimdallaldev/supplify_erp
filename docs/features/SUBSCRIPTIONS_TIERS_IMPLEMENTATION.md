# Supplify Subscription Tiers - Implementation Guide

## Overview

Comprehensive 3-tier subscription system (Basic, Pro, Premium) with admin-managed tier assignments, server-side enforcement, client-side SDK, and upgrade nudges. Built for suppliers and restaurants with 30-day free trials.

## ✅ What's Been Delivered

### 1. **Subscriptions Service** (`/services/subscriptions`)

**Created**:
- ✅ Complete NestJS microservice structure
- ✅ Prisma schema with 3 models:
  - `SubscriptionPlan` - Tier definitions (BASIC, PRO, PREMIUM)
  - `OrgSubscription` - Org assignments with overrides
  - `SubscriptionEvent` - Complete audit trail
- ✅ Subscription service with Redis caching (6h TTL)
- ✅ Comprehensive seed file with 3 plans + 4 demo subscriptions

**Features**:
- Entitlements resolution with deep merge (plan + overrides)
- Redis caching: `entitlements:v1:${orgType}:${orgId}`
- Cache invalidation on mutations
- Admin-only assignment/updates
- Audit trail logging
- Subscription statistics for dashboards

### 2. **Shared Entitlements Package** (`/packages/entitlements`)

**Created**:
- ✅ TypeScript types for all entitlements
- ✅ Utility functions (merge, validation, comparison)
- ✅ Zod validators for runtime checks
- ✅ Error type definitions (FEATURE_LOCKED, LIMIT_EXCEEDED)
- ✅ Format helpers for UI display

**Exports**:
```typescript
// Types
Entitlements, FeatureFlags, LimitCaps, PlanCode, OrgType

// Utils
mergeEntitlements(), hasFeature(), withinLimit()
getRemainingCapacity(), getUsagePercentage()
getSuggestedTierForFeature(), getSuggestedTierForLimit()
createFeatureLockedError(), createLimitExceededError()

// Validators
validateEntitlements(), validateOverrides()
```

### 3. **Subscription Plans & Entitlements**

#### **BASIC Tier**
```json
{
  "features": {
    "analyticsAdvanced": false,
    "promotions": false,
    "recommendationsBoost": false,
    "loyaltyAdvanced": false,
    "apiAccess": false,
    "webhooks": false,
    "inventoryModule": false,
    "pinnedProducts": true,
    "prioritySupport": false
  },
  "limits": {
    "products": 500,
    "promotionsActive": 0,
    "pinnedPerSupplier": 20,
    "favoriteLists": 5,
    "users": 3,
    "apiRateRps": 2,
    "storageGB": 5
  }
}
```

#### **PRO Tier**
```json
{
  "features": {
    "analyticsAdvanced": true,
    "promotions": true,
    "recommendationsBoost": true,
    "loyaltyAdvanced": false,
    "apiAccess": false,
    "webhooks": false,
    "inventoryModule": true,
    "pinnedProducts": true,
    "prioritySupport": false
  },
  "limits": {
    "products": 5000,
    "promotionsActive": 5,
    "pinnedPerSupplier": 100,
    "favoriteLists": 50,
    "users": 10,
    "apiRateRps": 5,
    "storageGB": 50
  }
}
```

#### **PREMIUM Tier** (All Features Unlocked)
```json
{
  "features": {
    "analyticsAdvanced": true,
    "promotions": true,
    "recommendationsBoost": true,
    "loyaltyAdvanced": true,
    "apiAccess": true,
    "webhooks": true,
    "inventoryModule": true,
    "pinnedProducts": true,
    "prioritySupport": true
  },
  "limits": {
    "products": 50000,
    "promotionsActive": 50,
    "pinnedPerSupplier": 500,
    "favoriteLists": 200,
    "users": 100,
    "apiRateRps": 25,
    "storageGB": 500
  }
}
```

### 4. **Demo Data Seeded**

- ✅ 3 subscription plans (BASIC, PRO, PREMIUM)
- ✅ 4 org subscriptions:
  - `sup-sysco-001` → BASIC (no trial)
  - `sup-usfoods-001` → PRO (27 days trial remaining)
  - `rest-demo-001` → BASIC (no trial)
  - `rest-premium-001` → PREMIUM (no trial)
- ✅ 4 subscription events (audit trail)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Subscriptions service
cd services/subscriptions
pnpm install

# Entitlements package
cd packages/entitlements
pnpm install && pnpm build
```

### 2. Setup Database

```bash
cd services/subscriptions

# Create migration
pnpm prisma migrate dev --name add_subscriptions

# Seed plans and demo data
pnpm prisma:seed
```

### 3. Start Service

```bash
pnpm start:dev
```

The service runs on `http://localhost:3006` (configure PORT in `.env`)

### 4. Environment Variables

Add to `services/subscriptions/.env`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/subscriptions?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
RABBITMQ_URL=amqp://guest:guest@localhost:5672
PORT=3006
NODE_ENV=development
```

## 📊 Data Model

### SubscriptionPlan
```sql
CREATE TABLE subscription_plans (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- BASIC, PRO, PREMIUM
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  entitlements JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### OrgSubscription
```sql
CREATE TABLE org_subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  org_type TEXT NOT NULL, -- SUPPLIER or RESTAURANT
  plan_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  starts_at TIMESTAMP DEFAULT NOW(),
  ends_at TIMESTAMP,
  trial_ends_at TIMESTAMP,
  overrides JSONB,
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, org_type)
);

CREATE INDEX idx_org_subscriptions_org ON org_subscriptions(org_id, org_type);
CREATE INDEX idx_org_subscriptions_plan ON org_subscriptions(plan_code);
CREATE INDEX idx_org_subscriptions_status ON org_subscriptions(status);
```

### SubscriptionEvent (Audit Trail)
```sql
CREATE TABLE subscription_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  org_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_plan TEXT,
  new_plan TEXT,
  previous_status TEXT,
  new_status TEXT,
  changed_by TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscription_events_org ON subscription_events(org_id, org_type);
CREATE INDEX idx_subscription_events_type ON subscription_events(event_type);
CREATE INDEX idx_subscription_events_created ON subscription_events(created_at);
```

## 🔧 API Reference

### Service Methods (subscriptions.service.ts)

```typescript
// Get all active plans
await subscriptionsService.getPlans();

// Get plan by code
await subscriptionsService.getPlanByCode('PRO');

// Get org subscription
await subscriptionsService.getOrgSubscription('sup-001', 'SUPPLIER');

// Get resolved entitlements (with caching)
const entitlements = await subscriptionsService.getEntitlements('sup-001', 'SUPPLIER');

// Assign subscription (admin only)
await subscriptionsService.assignSubscription({
  orgId: 'sup-001',
  orgType: 'SUPPLIER',
  planCode: 'PRO',
  trialDays: 30,
  overrides: { limits: { products: 6000 } }, // Optional
  assignedBy: 'admin-user-id',
});

// Update subscription (admin only)
await subscriptionsService.updateSubscription({
  subscriptionId: 'sub-id',
  status: 'PAUSED',
  updatedBy: 'admin-user-id',
});

// Get audit trail
await subscriptionsService.getSubscriptionEvents('sup-001', 'SUPPLIER');

// Get all subscriptions (admin dashboard)
await subscriptionsService.getAllSubscriptions({
  orgType: 'SUPPLIER',
  planCode: 'PRO',
  status: 'ACTIVE',
});

// Get statistics
await subscriptionsService.getSubscriptionStats();
```

## 🛡️ Entitlements Package Usage

### Server-Side (NestJS)

```typescript
import {
  Entitlements,
  hasFeature,
  withinLimit,
  createFeatureLockedError,
  createLimitExceededError,
} from '@supplify/entitlements';

// Check feature access
const entitlements = await subscriptionsService.getEntitlements(orgId, orgType);

if (!hasFeature(entitlements, 'promotions')) {
  throw new ForbiddenException(
    createFeatureLockedError('promotions', entitlements.planCode)
  );
}

// Check limits
const currentProducts = await getProductCount(orgId);

if (!withinLimit(entitlements, 'products', currentProducts)) {
  throw new BadRequestException(
    createLimitExceededError('products', currentProducts, entitlements.limits.products, entitlements.planCode)
  );
}
```

### Client-Side (React)

```typescript
import {
  formatFeatureName,
  formatLimitName,
  getUsagePercentage,
  getSuggestedTierForFeature,
} from '@supplify/entitlements';

// Display feature name
<h3>{formatFeatureName('promotions')}</h3>

// Show limit with usage bar
const usage = getUsagePercentage(entitlements, 'products', currentCount);
<ProgressBar value={usage} label={`${currentCount} / ${entitlements.limits.products}`} />

// Upgrade prompt
if (!entitlements.features.promotions) {
  const suggestedTier = getSuggestedTierForFeature('promotions');
  <UpgradePrompt requiredTier={suggestedTier} />
}
```

## 📈 Usage Examples

### Example 1: Enforce Product Limit in Catalog Service

```typescript
// In catalog.service.ts
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { withinLimit, createLimitExceededError } from '@supplify/entitlements';

async createProduct(supplierId: string, productData: any) {
  // Get entitlements
  const entitlements = await this.subscriptionsService.getEntitlements(
    supplierId,
    'SUPPLIER'
  );

  // Check current product count
  const currentCount = await this.prisma.product.count({
    where: { supplierId, active: true },
  });

  // Enforce limit
  if (!withinLimit(entitlements, 'products', currentCount)) {
    throw new BadRequestException(
      createLimitExceededError(
        'products',
        currentCount,
        entitlements.limits.products,
        entitlements.planCode
      )
    );
  }

  // Create product...
}
```

### Example 2: Feature Gate for Promotions

```typescript
// In promotions.service.ts
async createPromotion(supplierId: string, promoData: any) {
  const entitlements = await this.subscriptionsService.getEntitlements(
    supplierId,
    'SUPPLIER'
  );

  // Check feature access
  if (!hasFeature(entitlements, 'promotions')) {
    throw new ForbiddenException(
      createFeatureLockedError('promotions', entitlements.planCode)
    );
  }

  // Check promotions limit
  const activePromos = await this.prisma.promotion.count({
    where: { supplierId, status: 'ACTIVE' },
  });

  if (!withinLimit(entitlements, 'promotionsActive', activePromos)) {
    throw new BadRequestException(
      createLimitExceededError(
        'promotionsActive',
        activePromos,
        entitlements.limits.promotionsActive,
        entitlements.planCode
      )
    );
  }

  // Create promotion...
}
```

### Example 3: Rate Limiting by Tier (API Gateway)

```typescript
import { Request, Response, NextFunction } from 'express';

async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const orgId = req.user.orgId;
  const orgType = req.user.orgType;

  // Get entitlements
  const entitlements = await subscriptionsService.getEntitlements(orgId, orgType);
  const rateLimit = entitlements.limits.apiRateRps;

  // Check Redis token bucket
  const key = `rate:${orgType}:${orgId}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, 1); // 1 second window
  }

  if (current > rateLimit) {
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      limit: rateLimit,
      suggestedTier: getSuggestedTierForLimit(entitlements.planCode),
    });
  }

  next();
}
```

## 🎨 Frontend Integration

### Next Steps for Frontend (To Be Implemented)

1. **Create hooks** in `/packages/entitlements-sdk/`:
```typescript
// useEntitlements.ts
export function useEntitlements(orgType: OrgType) {
  return useQuery({
    queryKey: ['entitlements', orgType],
    queryFn: async () => {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        body: JSON.stringify({
          query: `query { myEntitlements(orgType: "${orgType}") { ... } }`
        })
      });
      return res.json();
    }
  });
}

// useFeature.ts
export function useFeature(feature: keyof FeatureFlags) {
  const { data: entitlements } = useEntitlements('SUPPLIER');
  return {
    enabled: entitlements?.features[feature] || false,
    reason: !entitlements?.features[feature] ? 'locked' : undefined,
  };
}
```

2. **Create components** in `/apps/web/src/components/`:
   - `<UpgradeBanner />` - Shows when feature locked
   - `<LimitWarning />` - Shows when approaching/at limit
   - `<UsageBar />` - Progress bar for limits
   - `<FeatureGate />` - HOC to wrap locked features

3. **Create pages**:
   - `/admin/subscriptions` - Manage all org subscriptions
   - `/settings/billing` - Show current plan, limits, usage

## 🔐 Security

### Admin Guards

All subscription mutations require admin role:

```typescript
// In GraphQL resolver
@UseGuards(AdminGuard)
@Mutation('assignSubscription')
async assignSubscription(@Args('input') input, @Context() ctx) {
  // Validate admin from Cognito JWT
  if (!ctx.user.groups.includes('admin')) {
    throw new ForbiddenException('Admin access required');
  }
  
  return this.subscriptionsService.assignSubscription({
    ...input,
    assignedBy: ctx.user.id,
  });
}
```

### Tenant Isolation

All entitlements queries scoped to authenticated org:

```typescript
@Query('myEntitlements')
async myEntitlements(@Context() ctx) {
  const orgId = ctx.user.orgId; // From Cognito JWT
  const orgType = ctx.user.orgType;
  
  return this.subscriptionsService.getEntitlements(orgId, orgType);
}
```

## 📧 Email Templates (To Be Implemented)

Create in `/services/notifications/templates/`:

1. **tier-assigned.mjml** - Welcome to new tier
2. **tier-changed.mjml** - Tier upgraded/downgraded
3. **trial-ending.mjml** - 3 days before trial ends
4. **limit-exceeded-digest.mjml** - Weekly summary

## 📊 Analytics Events (To Be Implemented)

Track via RabbitMQ:

```typescript
// Publish events
await eventBus.publish('tier.assigned', { orgId, planCode, timestamp });
await eventBus.publish('tier.updated', { orgId, previousPlan, newPlan, timestamp });
await eventBus.publish('feature.locked.view', { orgId, feature, timestamp });
await eventBus.publish('limit.exceeded', { orgId, limit, current, cap, timestamp });
await eventBus.publish('upgrade.requested', { orgId, requestedTier, timestamp });
```

## 🧪 Testing

### Unit Tests (To Be Written)

```bash
cd services/subscriptions
pnpm test
```

**Test Coverage Needed**:
- ✅ Entitlements resolution (plan + overrides merge)
- ✅ Cache hit/miss scenarios
- ✅ Feature locked errors
- ✅ Limit exceeded errors
- ✅ Admin-only mutations
- ✅ Audit trail logging

### Integration Tests

**Scenarios**:
1. Assign BASIC → Create product at limit → LIMIT_EXCEEDED
2. Upgrade to PRO → Product limit increased
3. Create promotion on BASIC → FEATURE_LOCKED
4. Cache invalidation on tier change

### E2E Tests (Playwright)

**Scenarios**:
1. Admin assigns PRO to supplier
2. Supplier sees Promotions unlocked
3. Supplier creates 5 promotions (at limit)
4. 6th promotion shows limit modal
5. Billing page shows usage bars

## 📁 File Structure

```
services/subscriptions/
├── prisma/
│   ├── schema.prisma (3 models)
│   └── seed.ts (plans + demo data)
├── src/
│   ├── subscriptions/
│   │   └── subscriptions.service.ts (main logic + Redis)
│   ├── prisma/
│   │   └── prisma.service.ts
│   └── main.ts
└── package.json

packages/entitlements/
├── src/
│   ├── types.ts (all TypeScript types)
│   ├── utils.ts (merge, validation, helpers)
│   ├── validators.ts (Zod schemas)
│   └── index.ts (exports)
└── package.json
```

## 🚧 Remaining Work (To Be Implemented)

### High Priority
- [ ] GraphQL schema for subscriptions (at gateway)
- [ ] GraphQL resolvers (query/mutations)
- [ ] Enforce in catalog service (product limits)
- [ ] Enforce in promotions, inventory, pins
- [ ] Frontend hooks (`useEntitlements`, `useFeature`)
- [ ] Admin subscriptions page
- [ ] Org billing/settings page
- [ ] Upgrade nudge components

### Medium Priority
- [ ] Gateway rate limiting per tier
- [ ] SendGrid email templates
- [ ] Analytics event tracking
- [ ] Unit & integration tests
- [ ] Playwright E2E tests

### Future Enhancements
- [ ] Stripe integration (scaffolded behind flag)
- [ ] Self-serve upgrade flow
- [ ] Usage-based billing
- [ ] Add-on purchases

## 📖 Additional Resources

- **Entitlements Package**: `/packages/entitlements/src/`
- **Subscriptions Service**: `/services/subscriptions/src/`
- **Prisma Schema**: `/services/subscriptions/prisma/schema.prisma`
- **Seed Data**: `/services/subscriptions/prisma/seed.ts`

## 🎯 Success Criteria

✅ **Completed**:
- [x] 3 subscription tiers with clear entitlements matrix
- [x] Prisma models with indexes
- [x] Service with Redis caching (6h TTL)
- [x] Shared entitlements package
- [x] Seed data with 4 demo subscriptions
- [x] Admin assignment/update methods
- [x] Audit trail logging
- [x] Utility functions for enforcement

⏳ **In Progress**:
- [ ] GraphQL integration
- [ ] Server-side enforcement in all services
- [ ] Frontend SDK and components
- [ ] Email templates
- [ ] Tests and documentation

---

**Version**: 1.0.0  
**Status**: Core Backend Complete, Frontend & Integration Pending  
**Last Updated**: 2025-01-21

