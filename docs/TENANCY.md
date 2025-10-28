# Supplify Tenancy Model

## Overview

Supplify uses a multi-tenant architecture where each restaurant and supplier is a separate tenant with isolated data, subscription plans, and usage quotas.

---

## Tenant Types

### Restaurants

Restaurants are the primary buyers in the Supplify marketplace. They:
- Browse and order from suppliers
- Track inventory across multiple branches
- Receive goods and manage receiving
- Generate reports and analytics

**Subscription Model:**
- Choose a plan (Free, Bronze, Gold, Platinum)
- Plans differ in limits (branches, orders, products)
- Features vary by tier

### Suppliers

Suppliers are the sellers providing products to restaurants. They:
- List products with pricing
- Receive orders from restaurants
- Manage warehouses and fulfillment
- Track sales and inventory

**Subscription Model:**
- Same 4-tier plan structure
- Plans differ in warehouses, products, and fulfillment features
- Higher tiers unlock warehouse management and advanced fulfillment

---

## Branches (Restaurant Multi-Location)

### What is a Branch?

A **branch** is a physical location or unit within a restaurant chain or group.

**Examples:**
- "Joe's Pizza Downtown" (main branch)
- "Joe's Pizza Uptown" (second branch)
- "Joe's Pizza Express Airport" (third branch)

### Plan-Based Branch Limits

Branch limits are enforced by subscription plan:

| Plan | Branches Allowed |
|------|-----------------|
| Free | 1 (single location only) |
| Bronze | 1 (single location only) |
| Gold | 3 branches |
| Platinum | Unlimited branches |

### Creating a Branch

Restaurants on Gold+ plans can create branches:

1. Navigate to **Settings → Branches**
2. Click "Add Branch"
3. Fill in:
   - Branch name
   - Address
   - Contact info
   - Branch code (optional)
4. Submit

**Plan Check:** System verifies branch count vs. plan limit before allowing creation.

### Branch Functionality

Each branch maintains:
- **Separate inventory** - products tracked per branch
- **Separate receiving** - deliveries logged per branch
- **Separate analytics** - reports filtered by branch
- **Shared suppliers** - order from same suppliers
- **Shared settings** - basic restaurant settings

**Orders:**
- Each order is placed for a specific branch
- Branch ID is required on Gold/Platinum orders
- Can filter orders by branch

**Inventory:**
- Branches track their own stock levels
- Central view available (Gold+)
- Cross-branch transfers (Platinum only)

### Branch Scoping

When a restaurant has multiple branches:
- **Orders** must specify `branch_id`
- **Inventory** movements track by branch
- **Receiving** logs require branch
- **Analytics** can filter by branch or show consolidated

When a restaurant has only 1 branch (Free/Bronze):
- Branch ID is optional (auto-assigned to main branch)
- No branch selector in UI
- All data scoped to default branch

---

## Warehouses (Supplier Fulfillment)

### What is a Warehouse?

A **warehouse** is a fulfillment location for suppliers.

**Examples:**
- "Main Distribution Center" (primary warehouse)
- "West Coast Warehouse" (regional)
- "Fresh Produce Cold Storage" (specialized)

### Plan-Based Warehouse Limits

Warehouse limits are enforced by subscription plan:

| Plan | Warehouses Allowed |
|------|-------------------|
| Free | 0 (no warehouses) |
| Bronze | 1 warehouse |
| Gold | 3 warehouses |
| Platinum | Unlimited warehouses |

### Creating a Warehouse

Suppliers on Bronze+ plans can create warehouses:

1. Navigate to **Settings → Warehouses**
2. Click "Add Warehouse"
3. Fill in:
   - Warehouse name
   - Address
   - Capacity info (optional)
   - Contact info
   - Warehouse code (optional)
4. Submit

**Plan Check:** System verifies warehouse count vs. plan limit before allowing creation.

### Warehouse Functionality

Each warehouse maintains:
- **Separate inventory** - stock levels per warehouse
- **Separate fulfillment** - orders picked/packed per warehouse
- **Capacity tracking** - available space (JSONB)
- **Routing** - order fulfillment routes (Platinum)

**Fulfillment:**
- Orders assigned to nearest warehouse
- Picking lists generated per warehouse
- Packing optimized by warehouse

**Inventory:**
- Stock tracked per warehouse
- Central view shows aggregated stock
- Transfers between warehouses (Gold+)

### Warehouse Scoping

When a supplier has multiple warehouses:
- **Fulfillment** routes to specific warehouse
- **Inventory** movements require `warehouse_id`
- **Picklists** scoped to warehouse
- **Analytics** filter by warehouse

When a supplier has no warehouses (Free plan):
- Default "Unassigned" warehouse
- No warehouse selector in UI
- Inventory tracked without warehouse granularity

---

## Data Isolation

### Tenant Isolation

Each tenant's data is completely isolated:
- Cannot see other tenants' data
- Cannot access other restaurants or suppliers
- API calls scoped to authenticated tenant

**Security:** Database rows include `tenant_id` foreign key, enforced at ORM level.

### Cross-Tenant Operations

Allowed operations:
- Restaurant ordering from Supplier (public catalog)
- Chat messages between restaurant and supplier
- Public reviews/ratings (future)

Blocked operations:
- Viewing supplier's internal inventory data (not in catalog)
- Accessing other restaurant's orders
- Seeing administrative settings

---

## Subscription Context

### How Plans Affect Tenancy

Plans determine:
- **Limits** - How many branches/warehouses/products you can have
- **Features** - Which capabilities are enabled
- **Scoping** - Whether multi-branch/warehouse functionality is available

**Example:** Free vs Gold Restaurant

**Free Plan (1 branch):**
- UI hides branch selector
- All data scoped to "Main" branch
- No branch-specific analytics
- Orders don't require branch_id

**Gold Plan (3 branches):**
- UI shows branch selector
- Inventory/orders/receiving all require branch_id
- Branch-specific analytics tabs
- "By Branch" filters in reports

---

## API Scoping

### Tenant ID in API Calls

All API endpoints automatically scope to authenticated tenant:

```javascript
// Restaurant creates a product order
POST /api/orders
{
  "supplier_id": "...",
  "branch_id": "...",  // Required for Gold+ plans
  "items": [...]
}

// Response automatically scoped to restaurant tenant_id
// Cannot create orders for other restaurants
```

### Branch/Warehouse ID in Queries

Queries accept optional `branch_id` or `warehouse_id` filters:

```javascript
// Get inventory for specific branch
GET /api/restaurant-inventory?branch_id=abc-123

// Get warehouse stock
GET /api/inventory?warehouse_id=xyz-789
```

**Validation:** System verifies branch/warehouse belongs to authenticated tenant before returning data.

---

## Using the System

### For Restaurants

**Single Location (Free/Bronze):**
- Sign up and start ordering
- No branch management needed
- All data automatically scoped to your location

**Multiple Locations (Gold/Platinum):**
- Create branches after upgrading
- Each branch manages its own inventory and receiving
- View consolidated or branch-specific reports
- Place orders on behalf of specific branches

**Best Practice:** Use branch names that match physical locations (e.g., "Downtown Location").

### For Suppliers

**No Warehouses (Free):**
- List products and fulfill from single location
- No warehouse management
- Streamlined for small suppliers

**Single Warehouse (Bronze):**
- Create warehouse
- Assign products to warehouse
- Orders fulfilled from warehouse

**Multiple Warehouses (Gold/Platinum):**
- Create multiple warehouses
- Products assigned to warehouses
- Fulfillment routes automatically
- Optimize by location/capacity

---

## Troubleshooting

**Issue:** Can't create branch/warehouse
- **Check:** Current plan allows additional units?
- **Check:** Usage counter says you're at limit?
- **Fix:** Upgrade plan or contact admin for override

**Issue:** Orders don't have branch_id on multi-branch tenant
- **Fix:** Always specify branch_id in order API calls
- **Note:** UI enforces this automatically

**Issue:** Warehouse inventory shows 0 but products are assigned
- **Check:** Products are assigned to correct warehouse?
- **Check:** Capacity limits not exceeded?
- **Fix:** Verify product-to-warehouse assignments

---

## Future Enhancements

- **Branch-to-branch transfers** (Platinum)
- **Warehouse capacity alerts**
- **Multi-brand restaurant support** (unlimited levels)
- **Virtual warehouses** for drop-shippers

---

Last Updated: [Current Date]

