# Supplier vs Restaurant Feature Comparison

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [four-plan-pricing-model.md](./four-plan-pricing-model.md) and [plans-and-limits.md](./plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

## ✅ NOTIFICATIONS - STATUS

### Current Implementation:

**Notifications work for BOTH suppliers and restaurants:**

| Feature                | Supplier         | Restaurant       | Status     |
| ---------------------- | ---------------- | ---------------- | ---------- |
| **New Order**          | ✅ Gets notified | -                | ✅ Working |
| **Order Cancelled**    | ✅ Gets notified | -                | ✅ Working |
| **Order Acknowledged** | -                | ✅ Gets notified | ✅ Working |
| **Order Processing**   | -                | ✅ Gets notified | ✅ Working |
| **Order Shipped**      | -                | ✅ Gets notified | ✅ Working |
| **Order Delivered**    | -                | ✅ Gets notified | ✅ Working |
| **Payment Received**   | ✅ Gets notified | -                | ✅ Working |
| **Invoice Issued**     | -                | ✅ Gets notified | ✅ Working |
| **Chat Messages**      | ✅ Gets notified | ✅ Gets notified | ✅ Working |
| **Low Stock**          | ❌ Missing       | ✅ Gets notified | ⚠️ Missing |
| **Out of Stock**       | ❌ Missing       | ✅ Gets notified | ⚠️ Missing |

---

## 📋 FEATURE COMPARISON

### Products Management

| Feature           | Supplier                                        | Restaurant       | Notes    |
| ----------------- | ----------------------------------------------- | ---------------- | -------- |
| Create Products   | ✅ Full CRUD                                    | ❌ Read-only     | Expected |
| Edit Products     | ✅ Full CRUD                                    | ❌ Read-only     | Expected |
| View All Products | ✅ Can see own                                  | ✅ Can see all   | Expected |
| Manage Prices     | ✅ Can set prices                               | ❌ Read-only     | Expected |
| Product Images    | ✅ Single upload + bulk ZIP import              | ❌ View only     | Expected |
| Bulk Upload       | ✅ Products CSV + **Import Product Images** ZIP | ❌ Not available | Expected |

### Order Management

| Feature            | Supplier      | Restaurant    | Notes      |
| ------------------ | ------------- | ------------- | ---------- |
| View Orders        | ✅ Own orders | ✅ Own orders | ✅ Aligned |
| Acknowledge Orders | ✅ Can do     | ❌ Read-only  | Expected   |
| Fulfill Orders     | ✅ Can do     | ❌ Read-only  | Expected   |
| Cancel Orders      | ✅ Can do     | ✅ Can do     | ✅ Aligned |
| Track Orders       | ✅ Can track  | ✅ Can track  | ✅ Aligned |
| Delivery Status    | ✅ Can update | ✅ Can view   | Expected   |

### Inventory & Warehouses

| Feature              | Supplier            | Restaurant          | Notes      |
| -------------------- | ------------------- | ------------------- | ---------- |
| Warehouse Management | ✅ Full CRUD        | ❌ Not relevant     | Expected   |
| Inventory Tracking   | ✅ Full system      | ✅ Full system      | ✅ Aligned |
| Inventory Alerts     | ✅ Low stock alerts | ✅ Low stock alerts | ✅ Aligned |
| Multi-Warehouse      | ✅ Supported        | ❌ Not relevant     | Expected   |
| Inventory Reports    | ✅ Available        | ✅ Available        | ✅ Aligned |

### Finance & Payments

| Feature               | Supplier         | Restaurant                      | Notes                              |
| --------------------- | ---------------- | ------------------------------- | ---------------------------------- |
| Create Invoices       | ✅ Can create    | ❌ Can only view                | Expected                           |
| Send Invoices         | ✅ Automatic     | ✅ Receives them                | Expected                           |
| Track Payments        | ✅ Can track     | ✅ Can track                    | ✅ Aligned                         |
| Payment History       | ✅ Full history  | ✅ Payment records              | ✅ Aligned                         |
| Revenue Reports       | ✅ Available     | ✅ Available                    | ✅ Aligned                         |
| Expense Tracking      | ❌ Missing       | ✅ Available                    | ⚠️ Missing                         |
| Payment Notifications | ✅ Gets notified | ✅ Notified on payment received | ✅ Wired (`notifyPaymentReceived`) |

### Relationships

| Feature            | Supplier   | Restaurant              | Notes      |
| ------------------ | ---------- | ----------------------- | ---------- |
| Follow/Restaurants | ❌ Missing | ✅ Can follow suppliers | ⚠️ Missing |
| Block/Restaurants  | ❌ Missing | ✅ Can block suppliers  | ⚠️ Missing |
| View Followers     | ❌ Missing | ❌ N/A                  | ⚠️ Missing |
| View Blocked       | ❌ Missing | ❌ N/A                  | ⚠️ Missing |

### Subscription & plan

| Feature                         | Supplier                                   | Restaurant                                 | Notes                                                                                    |
| ------------------------------- | ------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Subscription plans              | Growth and Scale plans by supplier type    | Growth and Scale plans by restaurant type  | Restaurants scale by branches; suppliers scale by active ordering customer locations.    |
| View current plan               | ✅ GET /api/subscriptions/current          | ✅ GET /api/subscriptions/current          | Suppliers and restaurants both supported.                                                |
| View usage (e.g. chats_per_day) | ✅ GET /api/subscriptions/usage/:meterType | ✅ GET /api/subscriptions/usage/:meterType | Daily chat limit enforced for both.                                                      |
| Plan & usage in Settings        | ✅ Settings → Plan & usage tab             | ✅ Onboarding / subscription UI            | Suppliers see plan, limits, and upgrade prompt.                                          |
| Internal trial row              | Used when no subscription exists           | Used when no subscription exists           | Internal compatibility row prevents 0/0 limits; public users choose a paid trial target. |

### Restaurant-Specific Features

| Feature               | Status                  | Purpose                                                                                                                                 |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Quick Lists           | ✅                      | Save commonly ordered items                                                                                                             |
| Smart Reorder         | ✅ (Restaurant Growth+) | Forecasts + LLM assist (`explain` / `ask` / `ai-recommend`; Scale adds NL ask) — [ai-smart-reorder.md](../features/ai-smart-reorder.md) |
| Waste Tracking        | ✅                      | Track food waste and spoilage                                                                                                           |
| Receiving System      | ✅                      | Quality control on delivery                                                                                                             |
| Inventory Forecasting | ✅                      | Predict inventory needs                                                                                                                 |

---

## ⚠️ MISSING FEATURES FOR SUPPLIERS

### 1. **Supplier-Restaurant Relationships**

- ❌ **Follow/Restaurants**: Suppliers cannot follow their customer restaurants
- ❌ **View Restaurant Details**: Limited restaurant info
- ❌ **Track Restaurant Order History**: Can't see full order history per restaurant
- ❌ **Restaurant Analytics**: No insights into which restaurants order most

### 2. **Inventory Alerts for Suppliers**

- ❌ **Low Stock Notifications**: Suppliers don't get notified when their warehouse stock is low
- ❌ **Out of Stock Notifications**: No alerts when products run out
- ❌ **Replenishment Alerts**: Missing proactive alerts

### 3. **Advanced Supplier Features**

- ❌ **Sales Analytics**: No detailed sales reports per restaurant
- ❌ **Product Performance**: Can't see which products sell best
- ❌ **Customer (Restaurant) Insights**: Limited restaurant analytics
- ❌ **Contract Pricing Management**: No way to manage per-restaurant pricing
- ❌ **Volume Discounts**: No automated discount system
- ❌ **Seasonal Trends**: No inventory trend analysis

### 4. **Marketing Tools**

- ❌ **Bulk Updates**: Can't send messages to multiple restaurants
- ✅ **Deals & promotions**: Supplier-created deals with product/category targeting; paid boost campaigns; restaurant discovery feed (`/app/deals`)
- ❌ **Announcements**: Can't broadcast to followers

### 5. **Notifications**

- ❌ **Low Stock Alerts**: Missing notifications when warehouse inventory is low
- ❌ **High Demand Alerts**: No alerts for products with sudden high demand
- ❌ **Payment Reminders**: No automatic reminders for overdue invoices

---

## ✅ ALIGNED FEATURES

These features work equally well for both suppliers and restaurants:

1. **Order Management** - Both can view and manage orders
2. **Inventory Tracking** - Both have full inventory systems
3. **Chat/Messaging** - Both can communicate
4. **Dashboard** - Both see relevant stats
5. **Basic Notifications** - Both receive order/invoice notifications
6. **Invoice/Payment Tracking** - Both can track financials

---

## 📊 RECOMMENDATIONS

### High Priority for Suppliers:

1. **Inventory Low Stock Alerts** - Critical for suppliers
2. **Restaurant Follower Tracking** - Help suppliers understand customer base
3. **Sales Analytics Dashboard** - Help suppliers optimize inventory
4. **Contract Pricing UI** - Allow suppliers to set per-restaurant prices

### Medium Priority:

1. **Product Performance Reports** - Show which products sell best
2. **Restaurant Order History** - Track which restaurants order what
3. **Payment Reminders** - Automate overdue invoice notifications

### Low Priority:

1. **Marketing Tools** - Bulk messaging, promotions
2. **Seasonal Trend Analysis** - Inventory forecasting for suppliers
3. **Volume Discount Configuration** - Automated pricing tiers

---

## 🔧 QUICK FIXES NEEDED

1. **Add Low Stock Notifications for Suppliers** - Currently missing
2. **Add Restaurant Followers List for Suppliers** - Show who follows you
3. **Add Sales Analytics Dashboard** - Show revenue trends
4. **Add Contract Pricing UI** - Let suppliers set custom prices per restaurant

---

**Status**: Suppliers are **mostly aligned** with restaurants but missing some analytics and relationship management features.

**Priority**: Add inventory alerts and sales analytics for suppliers to match restaurant feature parity.

---

## 🌱 Development & data (prodlike)

| Capability               | Description                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prodlike seed**        | Full dataset: suppliers, warehouses, products, restaurants, branches, staff, subscriptions, inventory, reservations, orders, invoices, shifts. Run: `npm run seed:prodlike` (see [SEED_PRODLIKE.md](SEED_PRODLIKE.md)). |
| **Seed accounts**        | Keycloak users for all seeded restaurants/suppliers (matching emails, default password). Run after prodlike: `npm run seed:accounts`.                                                                                   |
| **Quick Lists seed**     | Pre-filled quick lists per restaurant. Run: `npm run seed:quick-lists`.                                                                                                                                                 |
| **Schema-adaptive APIs** | Products and warehouses routes work with or without optional columns (`tags`, `tenant_id`/`supplier_id`) for backward compatibility.                                                                                    |
