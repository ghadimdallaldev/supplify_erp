# Admin Dashboard Status & Implementation Plan

## ✅ What's Already Working

### Backend (Real Data - Not Dummy)
1. **Feature Flags** ✅
   - Backend: `/api/admin-dashboard/feature-flags` 
   - Database: `feature_flag` table with seeded data
   - Data seeded in migration `0022_subscription_system.sql`
   - Can toggle global flags
   - Can set tenant-specific overrides

2. **Usage Tracking** ✅
   - Backend: Implemented via `usage_meter` table
   - Tracked automatically when creating products/orders
   - Initialized for all existing tenants via `initialize-subscriptions.js`
   - Real-time tracking is working

3. **Audit Logs** ✅
   - Backend: `/api/admin-dashboard/audit-logs`
   - Table: `admin_audit_log` (was referencing wrong table, now fixed)
   - Logs are created when:
     - Plans are updated
     - Subscriptions are modified
     - Feature flags are toggled
     - Overrides are set

### Backend Endpoints Added
- ✅ `/api/admin-dashboard/tenants/suppliers` - Get all suppliers with details
- ✅ `/api/admin-dashboard/tenants/restaurants` - Get all restaurants with details
- ✅ `/api/admin-dashboard/tenants/suppliers/:id/usage` - Get supplier usage
- ✅ `/api/admin-dashboard/tenants/restaurants/:id/usage` - Get restaurant usage

### Frontend API Hooks Added
- ✅ `useGetAdminSuppliersQuery`
- ✅ `useGetAdminRestaurantsQuery`
- ✅ `useGetSupplierUsageQuery`
- ✅ `useGetRestaurantUsageQuery`

## ❌ What Needs Building

### 1. Tenant Management Tab (Coming Soon placeholder)
Replace with full tenant directory showing:
- All suppliers with: name, plan, status, warehouses, products, last order, MRR
- All restaurants with: name, plan, status, branches, last order, monthly spend
- Actions: change plan, suspend/resume, view details

### 2. Supplier Admin Sub-Dashboard
- Overview with active suppliers, plan mix, over-limit count, open invoices
- Directory table with supplier details
- Usage & Quotas (per-supplier meters)
- Catalog QA (missing images, UOM conflicts, inactive SKUs)
- Fulfillment Health (OTIF %, defect rate, disputes)
- Billing (invoices, payments, dunning)
- Feature Flags (effective flags, overrides)
- Audit (supplier-scoped actions)

### 3. Restaurant Admin Sub-Dashboard
- Overview with active restaurants, plan mix, waste %, orders/day, overdue invoices
- Directory table with restaurant details
- Usage & Quotas (products tracked, orders/day, chats/day)
- Spend & Invoices
- Ops Health (receiving timeliness, dispute rate, approval queue)
- Feature Access (effective flags, upgrade prompts)
- Audit (restaurant-scoped actions)

## 📝 Current Admin Dashboard Structure

```typescript
// Current tabs in AdminDashboardPage:
- Overview ✅ (working with real data)
- Plans ✅ (working with real data)
- Subscriptions ✅ (working with real data)
- Tenants ❌ (placeholder - needs full implementation)
- Feature Flags ✅ (working with real data)
- Usage ❌ (placeholder - needs implementation)
- Audit Logs ✅ (working with real data from admin_audit_log table)
```

## 🎯 Next Steps

The backend infrastructure is **100% real and working**. What needs to be built is:

1. **Frontend** for Tenant Management tab
2. **Frontend** for Usage & Quotas tab
3. **Supplier Admin** sub-dashboard as a separate page
4. **Restaurant Admin** sub-dashboard as a separate page

All data endpoints are ready - just need UI!

