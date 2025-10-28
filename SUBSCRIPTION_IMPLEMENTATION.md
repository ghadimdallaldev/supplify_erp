# Subscription System Implementation Status

## ✅ What Has Been Done

### 1. Database Schema (0022_subscription_system.sql)
- ✅ **subscription_plan** table with limits and features (JSONB)
- ✅ **subscription** table linking tenants to plans
- ✅ **feature_flag** table for global feature flags
- ✅ **feature_flag_override** table for tenant-specific overrides
- ✅ **usage_meter** table for tracking usage against limits
- ✅ **admin_audit_log** table for auditing admin actions
- ✅ Seeded 4 plans: Free, Bronze, Gold, Platinum
- ✅ All plans have complete limits and features JSON

### 2. Backend Implementation

#### Subscription Library (`apps/api/src/lib/subscription.js`)
- ✅ `getTenantSubscription()` - Fetch tenant's active subscription
- ✅ `isFeatureEnabled()` - Check feature access with resolution order:
  ```
  tenant.override > plan.features > global.flag.default
  ```
- ✅ `checkLimit()` - Check if tenant has reached limit
- ✅ `incrementUsage()` - Track usage when resources are created
- ✅ `decrementUsage()` - Track usage when resources are deleted
- ✅ `requireWithinLimit()` - Middleware factory for limit checks
- ✅ `requireFeature()` - Middleware factory for feature checks

#### Subscription Routes (`apps/api/src/routes/subscriptions.routes.js`)
- ✅ `GET /api/subscriptions/current` - Get current subscription
- ✅ `GET /api/subscriptions/usage/:meterType` - Get usage for a meter
- ✅ `GET /api/subscriptions/features/:featureKey` - Check if feature is enabled

#### Plan Enforcement in Products Route
- ✅ Added limit checks when creating products
- ✅ Tracks usage automatically
- ✅ Returns 403 LIMIT_EXCEEDED when limit is reached

### 3. Frontend Implementation

#### Types (`apps/web/src/types/index.ts`)
- ✅ SubscriptionPlan interface
- ✅ Subscription interface
- ✅ FeatureFlag interface
- ✅ FeatureFlagOverride interface
- ✅ UsageMeter interface

#### API Service (`apps/web/src/services/api.ts`)
- ✅ `useGetCurrentSubscriptionQuery` - Hook to fetch subscription
- ✅ `useGetSubscriptionUsageQuery` - Hook to check usage
- ✅ `useCheckFeatureQuery` - Hook to check feature availability

### 4. Admin Dashboard Routes
- ✅ `GET /api/admin-dashboard/plans` - List all plans
- ✅ `POST /api/admin-dashboard/plans` - Create plan
- ✅ `PATCH /api/admin-dashboard/plans/:id` - Update plan
- ✅ `GET /api/admin-dashboard/subscriptions` - List subscriptions
- ✅ `PATCH /api/admin-dashboard/subscriptions/:id` - Update subscription
- ✅ `GET /api/admin-dashboard/feature-flags` - List feature flags
- ✅ `PATCH /api/admin-dashboard/feature-flags/:key` - Toggle feature
- ✅ `GET /api/admin-dashboard/usage/:tenantId` - Get tenant usage

## 📋 Usage Examples

### Backend: Check Plan Limits Before Creating Resource

```javascript
import { checkLimit, incrementUsage } from '../lib/subscription.js';

// In your route handler
const limitCheck = await checkLimit(supplierId, 'SUPPLIER', 'products');
if (limitCheck.isOverLimit && !limitCheck.isUnlimited) {
  return res.status(403).json({
    ok: false,
    error: {
      name: 'LIMIT_EXCEEDED',
      message: `You have reached your plan limit for products (${limitCheck.limit})`,
    }
  });
}

// After successful creation
await incrementUsage(supplierId, 'SUPPLIER', 'products', 1);
```

### Backend: Check Feature Access

```javascript
import { isFeatureEnabled } from '../lib/subscription.js';

const hasFeature = await isFeatureEnabled(tenantId, 'RESTAURANT', 'smart_reorder');
if (!hasFeature) {
  return res.status(403).json({
    ok: false,
    error: { name: 'FEATURE_NOT_AVAILABLE' }
  });
}
```

### Frontend: Check Subscription

```typescript
import { useGetCurrentSubscriptionQuery } from '../services/api';

function MyComponent() {
  const { data: subscriptionData, isLoading } = useGetCurrentSubscriptionQuery();
  
  if (!subscriptionData?.subscription) {
    return <div>No active subscription</div>;
  }
  
  const { subscription } = subscriptionData;
  const planLimits = subscription.limits;
  const planFeatures = subscription.features;
  
  return (
    <div>
      <h2>Plan: {subscription.plan_name}</h2>
      <p>Products: {planLimits.products}</p>
      <p>Chat: {planFeatures.chat ? 'Enabled' : 'Disabled'}</p>
    </div>
  );
}
```

### Frontend: Check Usage

```typescript
import { useGetSubscriptionUsageQuery } from '../services/api';

function UsageDisplay() {
  const { data: usage } = useGetSubscriptionUsageQuery('products');
  
  if (!usage) return null;
  
  return (
    <div>
      <p>Products: {usage.current} / {usage.limit || '∞'}</p>
      {usage.isOverLimit && <p className="text-red-500">Limit exceeded!</p>}
    </div>
  );
}
```

## 🎯 How It Works

### 1. Resolution Order for Features
When checking if a feature is enabled:
1. **Tenant Override** - Check `feature_flag_override` table
2. **Plan Features** - Check `subscription.features[featureKey]`
3. **Global Default** - Check `feature_flag.is_enabled_globally`
4. **Default** - Returns `false` if not found

### 2. Limit Enforcement
- Limits are stored as JSONB in `subscription_plan.limits`
- `-1` means unlimited
- Usage is tracked in `usage_meter` table
- Check happens BEFORE creating resource
- Usage is incremented AFTER successful creation

### 3. Meter Tracking
- One meter per tenant/type/period
- Period is typically daily (CURRENT_DATE)
- `is_over_limit` flag is updated automatically
- Usage persists across sessions

## ✅ What Was Completed

### 1. Applied Limit Checks to More Routes
- ✅ Orders creation (`apps/api/src/routes/orders.routes.js`)
  - Checks `orders_per_day` limit before creating placed orders
  - Tracks usage when order is successfully created
  - Returns 403 LIMIT_EXCEEDED when over limit

### 2. Usage Tracking on Deletion
- ✅ Built into the `subscription.js` library
- The `decrementUsage()` function exists for tracking deletions
- Can be called manually when deleting resources

### 3. Frontend UI Components
- ✅ Subscription settings component (`SubscriptionInfo.tsx`)
  - Shows current plan and status
  - Displays usage with progress bars
  - Shows key features enabled in plan
  - Upgrade call-to-action
- ✅ Progress bar component (`ui/progress.tsx`)
- ✅ Integrated into Restaurant Onboarding page

### 4. Initialize Usage Meters
- ✅ Created `initialize-subscriptions.js` script
  - Assigns Free plan to all suppliers/restaurants without subscriptions
  - Initializes usage meters with current counts
  - Sets up proper limits based on plan

### 5. Order Tracking Implementation
- ✅ Orders are tracked when status is 'PLACED'
- ✅ Decrements inventory automatically
- ✅ Sends notifications to suppliers
- ✅ Tracks usage for restaurants

## 📝 Additional Files Created

1. **apps/api/src/lib/subscription.js** - Core subscription logic
2. **apps/api/src/routes/subscriptions.routes.js** - Subscription API endpoints
3. **apps/api/scripts/initialize-subscriptions.js** - Tenant initialization script
4. **apps/web/src/components/SubscriptionInfo.tsx** - Subscription UI component
5. **apps/web/src/components/ui/progress.tsx** - Progress bar component

## 🚀 Quick Start Guide

### Step 1: Run Migration
```bash
cd apps/api
npm run migrate
```

### Step 2: Initialize Existing Tenants
```bash
npm run script initialize-subscriptions.js
```

This will:
- Assign Free plan to all suppliers/restaurants
- Initialize usage meters with current resource counts
- Set up proper limits based on their plan

### Step 3: Test the System

**Test Product Creation:**
```bash
# As a supplier, try creating products
# After hitting the limit (50 for Free plan), should get 403 error
```

**Test Order Creation:**
```bash
# As a restaurant, try creating orders
# After hitting daily limit (10 for Free plan), should get 403 error
```

**View Subscription:**
- Navigate to Restaurant Dashboard → Settings → Subscription tab
- See current plan, usage, and features

## 📊 Current Plan Limits

All plans are defined in `0022_subscription_system.sql`:

| Feature | Free | Bronze | Gold | Platinum |
|---------|------|--------|------|----------|
| Products | 50 | 1,000 | 10,000 | ∞ |
| Warehouses | 0 | 1 | 3 | ∞ |
| Branches | 0 | 1 | 3 | ∞ |
| Users | 1 | 3 | 10 | ∞ |
| Orders/Day | 10 | 100 | 500 | ∞ |
| Chats/Day | 10 | 50 | 200 | ∞ |
| Storage | 100 MB | 1 GB | 5 GB | 20 GB |

