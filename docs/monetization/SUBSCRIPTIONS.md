# Subscriptions and plan catalogs

Plans are split by **tenant type**: each of Free, Bronze, Gold, and Platinum exists as separate rows for **RESTAURANT** and **SUPPLIER**. Limit keys are normalized per tenant type (no mixing of product/SKU keys).

## Limit keys (normalized)

- **RESTAURANT:** `branches`, `users`, `orders_per_day`, `suppliers_per_restaurant`, `restaurant_inventory_skus`, `chats_per_day`, `storage_mb`
- **SUPPLIER:** `warehouses`, `users`, `supplier_products_skus`, `chats_per_day`, `storage_mb`

Legacy key `products` is no longer used; it was replaced by `restaurant_inventory_skus` (restaurant) and `supplier_products_skus` (supplier).

## Restaurant plan matrix

| Plan     | branches  | users     | orders_per_day | suppliers_per_restaurant | restaurant_inventory_skus | chats_per_day | reservations | receiving | finance   |
| -------- | --------- | --------- | -------------- | ------------------------ | ------------------------- | ------------- | ------------ | --------- | --------- |
| Free     | 1         | 1         | 3              | 1                        | 15                        | 3             | basic        | manual    | view      |
| Bronze   | 2         | 3         | 20             | 10                       | 1,000                     | 50            | ✓            | photos    | record    |
| Gold     | 3         | 10        | 50             | unlimited                | 1,000                     | 200           | ✓            | quality   | analytics |
| Platinum | unlimited | unlimited | unlimited      | unlimited                | unlimited                 | unlimited     | ✓            | full      | advanced  |

**Branches** counts total location accounts: your **primary restaurant + linked branch accounts** (not legacy `branch` rows).

**chats_per_day** counts **chat messages sent** per day (enforced on `POST .../messages` via `usage_meter`).

**Free plan:** Setup and testing only. Intentionally low limits (3 orders/day, 3 chats/day, 15 SKUs, 1 supplier, 1 location account) to demonstrate value and encourage upgrade. Gold is the default plan for serious usage.

- **reservations:** Plan feature / reservation capabilities (from plan `features`).
- **receiving:** Plan feature (e.g. `receiving_quality`: manual_only, photos_enabled, quality_scoring).
- **finance:** Plan feature (e.g. `finance_invoices`: view_only, record_payments, expense_analytics).

## Supplier plan matrix

| Plan     | warehouses | users     | supplier_products_skus | chats_per_day | storage_mb | fulfillment |
| -------- | ---------- | --------- | ---------------------- | ------------- | ---------- | ----------- |
| Free     | 0          | 1         | 15                     | 3             | 50         | basic       |
| Bronze   | 1          | 3         | 1,000                  | 50            | 1,000      | manual      |
| Gold     | 3          | 10        | 1,000                  | 200           | 5,000      | warehouse   |
| Platinum | unlimited  | unlimited | unlimited              | unlimited     | 20,000     | full        |

**Free plan:** Setup and testing only. Low limits (15 products, 3 chats/day, 50 MB storage, 0 warehouses) to encourage upgrade to Gold for real usage.

- **fulfillment:** Plan feature (e.g. `fulfillment_tools`: basic_orders, manual_orders_invoices, warehouse_pick_pack, routing_full_suite). Can be gated by plan.

## Enforcement

- **Feature entitlements:** `requireFeature(featureKey)` middleware (e.g. `reports`, `smart_reorder`, `multi_branch`) returns **403** with error name **FEATURE_NOT_AVAILABLE** when the plan does not include the feature.
- **Limits:** `requireWithinLimit(limitKey, usage)` and `checkLimit()` return **403** with error name **LIMIT_EXCEEDED** when usage exceeds the plan (or override) limit.
- **Permissions:** Routes also enforce RBAC (e.g. ORDERS_CREATE, CHAT_SEND, INVENTORY_EDIT, RECEIVING_VIEW, RECEIVING_MANAGE, PAYMENTS_MANAGE, INVOICES_VIEW). See FEATURE_CATALOG.md.

## Enterprise plan

- **Enterprise** is a separate plan (`code = 'enterprise'`) for both RESTAURANT and SUPPLIER with unlimited or very high limits and full features. It has `requires_admin_assignment = true`: only an admin can assign it (no self-serve). See **[ENTERPRISE.md](./ENTERPRISE.md)** for what enterprise gets, SLA options, custom contracts, and manual onboarding.

## Admin

- **Plans tab:** Filter by tenant type (Restaurant / Supplier). Create plan requires **code** and **tenant_type**; only limits/features relevant to that type are shown when editing. Enterprise plan is visible and assignable when changing a tenant’s subscription.
- **Subscriptions:** When changing a tenant’s plan, the new plan’s `tenant_type` must match the subscription’s tenant (Restaurant vs Supplier). Enterprise can only be assigned by admin.

## Entitlements endpoint

**GET /api/subscriptions/entitlements** (auth + SUBSCRIPTIONS_VIEW): returns canonical object with tenantType, tenantId, plan, features, limits (with overrides), baseLimits, overrides (non-expired only), usage, usageWindowMeta.

## Plan change preview

**POST /api/admin-dashboard/subscriptions/:id/preview-change** body `{ targetPlanId }` returns willExceed, featureDiff, recommendedActions. **PATCH .../subscriptions/:id** with `planId` (and optional `allowExceedance`) applies change; tenant_type must match; 400 LIMIT_EXCEEDED if usage exceeds target unless allowExceedance.

## Migration notes

- Migration **0044** adds `subscription_plan.tenant_type`, normalizes limit keys, duplicates plans into RESTAURANT and SUPPLIER catalogs, and points existing subscriptions to the correct plan by tenant type.
- Migration **0063** rebalances restaurant Free/Bronze/Gold limits (branches include primary account; Bronze 20 orders/day; Gold 50 orders/day).
- Migration **0064** sets full Bronze/Gold limit objects (inventory SKUs 1,000 on Gold, not 10,000).
- **usage_meter:** Rows with `meter_type = 'products'` and `tenant_type = 'SUPPLIER'` were updated to `meter_type = 'supplier_products_skus'`.
- **tenant_limit_override:** `limit_type = 'products'` was updated to `supplier_products_skus` or `restaurant_inventory_skus` by tenant type.
