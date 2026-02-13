# Supplify Subscription Plans

## Overview

Supplify offers tiered subscription plans designed for **restaurants and suppliers** at various stages of growth. Plans are structured to provide value at every level, with clear upgrade paths and feature alignment.

- **Same tiers for both:** Free, Bronze, Gold, and Platinum apply to restaurants and suppliers (plan type: `restaurant_and_supplier`).
- **Supplier limits:** Each tier defines limits for suppliers (e.g. products, warehouses, **chats_per_day**). Suppliers without an active subscription are auto-assigned the Free plan so chat and other features work (no "0/0" chat limit).
- **API:** Both roles can use `GET /api/subscriptions/current` and `GET /api/subscriptions/usage/:meterType` (e.g. `chats_per_day`). See [SUPPLIER_FEATURES.md](SUPPLIER_FEATURES.md#-subscription--plan-suppliers).

---

## Plan Tiers

### 🌟 Free Plan

**Best for:** Small businesses getting started

**Pricing:** $0/month

- 1 restaurant
- Up to 2 supplier connections per restaurant
- 50 products
- 0 warehouses
- 1 user
- 100 MB storage
- 10 orders per day
- 10 chats per day

**Features:**

- Basic quick lists (manual only)
- No smart reorder
- Basic inventory management
- No waste tracking
- Manual receiving quality only
- View-only finance invoices
- Chat with 1 supplier only
- No reports
- In-app notifications only
- Community support

**Use Case:** Solo restaurant exploring Supplify, testing core ordering workflows

---

### 🥉 Bronze Plan

**Best for:** Growing single-location restaurants

**Pricing:** $49/month or $490/year (save 2 months)

**Limits:**

- 3 restaurants
- Up to 10 suppliers per restaurant
- 1,000 products
- 1 warehouse
- 3 users
- 1 GB storage
- 100 orders per day
- 50 chats per day

**Features:**

- Automated quick lists (weekly scheduling)
- Smart reorder with 7-day history
- Real-time inventory management
- Manual waste tracking
- Photos-enabled receiving quality
- Invoice payment recording
- Multi-supplier chat
- Basic KPI reports
- Single-level approval/budgets
- No multi-branch
- Manual orders & invoices
- Default plan features only
- In-app + email notifications
- Exports-only API integrations
- 72-hour support SLA
- No custom branding

**Use Case:** Single location with 1-3 suppliers, basic inventory needs

---

### 🥇 Gold Plan

**Best for:** Multi-location restaurants

**Pricing:** $149/month or $1,490/year (save 2 months)

**Limits:**

- 10 restaurants
- Unlimited suppliers
- 10,000 products
- 3 warehouses
- 10 users
- 5 GB storage
- 500 orders per day
- 200 chats per day

**Features:**

- Full quick list scheduling
- AI-powered reorder with 90-day trends
- Multi-branch inventory tracking
- Analytics waste tracking dashboard
- Quality scoring system
- Expense analytics
- Group chat with file sharing
- Usage & cost dashboards
- Approval & budget caps
- **Multi-branch support**
- Warehouse pick & pack
- Add-on toggles
- Email + SMS notifications
- API key access
- 24-hour priority support
- Logo & color customization

**Use Case:** Restaurant group with 3-10 locations, advanced inventory needs

---

### 💎 Platinum Plan

**Best for:** Enterprise restaurant chains

**Pricing:** $349/month or $3,490/year (save 2 months)

**Limits:**

- **Unlimited** restaurants
- Unlimited suppliers
- Unlimited products
- Unlimited warehouses
- Unlimited users
- 20 GB storage
- Unlimited orders/day
- Unlimited chats/day

**Features:**

- **Everything in Gold PLUS:**
- AI smart automation for quick lists
- AI forecast with seasonality
- Lot expiry tracking
- Cost vs sales waste analytics
- Supplier performance reports
- Advanced finance dashboard
- All experimental features
- Real-time media, read receipts in chat
- Advanced forecasting & custom reports
- Multi-level approvals
- Central purchasing
- Full fulfillment routing suite
- Email + SMS + webhook notifications
- Full API + webhooks
- Dedicated same-day support
- White-label domain branding

**Use Case:** Large chain with multiple brands, complex supply chains

---

## Upgrade Paths

### Free → Bronze

**When:** You need more suppliers, products, or basic automation
**Cost Impact:** +$49/month
**Benefits:** Real-time inventory, smart reorder, basic reports

### Bronze → Gold

**When:** You open a second location or need multi-branch capabilities
**Cost Impact:** +$100/month
**Benefits:** Multi-branch support, advanced analytics, warehouse management

### Gold → Platinum

**When:** You have 10+ locations or need unlimited scalability
**Cost Impact:** +$200/month
**Benefits:** Everything unlimited, AI features, white-label branding

---

## Plan Limits Explained

### Branches (Restaurants Only)

- **Free/Bronze:** 1 location (no multi-branch)
- **Gold:** Up to 3 locations
- **Platinum:** Unlimited locations

**Enforcement:** Cannot create additional branches beyond limit. Existing branches remain accessible.

### Warehouses (Suppliers Only)

- **Free/Bronze:** 0 warehouses
- **Gold:** Up to 3 warehouses
- **Platinum:** Unlimited warehouses

**Enforcement:** Cannot create warehouses on Free/Bronze plans. Inventory defaults to "Unassigned."

### Orders Per Day

- Limits reset daily at midnight UTC
- Orders placed via API count toward daily limit
- Over-limit attempts are blocked with clear messaging

### Storage

- Includes product images, documents, chat media
- 80% warning at plan capacity
- Not enforced (grace period for upgrades)

---

## Feature Matrix

| Feature           | Free         | Bronze           | Gold          | Platinum             |
| ----------------- | ------------ | ---------------- | ------------- | -------------------- |
| Quick Lists       | Basic Manual | Automated Weekly | Full Schedule | AI Automation        |
| Smart Reorder     | ❌           | Limited (7-day)  | Full (90-day) | AI Forecast          |
| Inventory         | Basic        | Real-Time        | Multi-Branch  | Lot Tracking         |
| Waste Tracking    | ❌           | Manual           | Analytics     | Cost vs Sales        |
| Receiving Quality | Manual       | Photos           | Scoring       | Performance Reports  |
| Finance           | View Only    | Record Payments  | Analytics     | Advanced Dashboard   |
| Chat              | 1 Supplier   | Multi-Supplier   | Group + Files | Real-Time + Media    |
| Reports           | ❌           | Basic KPIs       | Usage/Cost    | Custom + Forecasting |
| Approvals         | ❌           | Single-Level     | Caps          | Multi-Level          |
| Multi-Branch      | ❌           | ❌               | ✅            | ✅                   |
| Fulfillment       | Basic Orders | Manual           | Pick/Pack     | Full Suite           |
| Notifications     | In-App       | + Email          | + SMS         | + Webhooks           |
| API               | ❌           | Exports Only     | API Keys      | Full + Webhooks      |
| Support           | Community    | 72h              | 24h Priority  | Dedicated            |
| Branding          | None         | None             | Logo/Colors   | White-Label          |

---

## Downgrade Protection

When downgrading to a plan with fewer resources:

1. **Excess resources are locked (not deleted)**
2. Cannot create new items exceeding new limits
3. Existing items remain accessible in read-only mode
4. Clear dashboard showing what to resolve
5. Upgrade prompt shown on locked features

**Example:** Downgrading from Gold (3 branches) to Bronze (1 branch):

- All 3 branches remain visible
- Cannot create 4th branch
- Existing branches read-only until resolved
- Upgrade to Gold shown prominently

---

## Frequently Asked Questions

**Q: Can I switch plans anytime?**
A: Yes! Upgrades take effect immediately. Downgrades show impact preview before confirming.

**Q: What happens if I exceed my daily order limit?**
A: Orders are blocked with an upgrade prompt. Existing orders remain untouched.

**Q: Can I get a custom plan for my business?**
A: Contact admin for custom enterprise plans with tailored limits and features.

**Q: Are there trials?**
A: Free plan is forever. Bronze offers 14-day trials for new users. Gold/Platinum available on request.

**Q: How do I upgrade?**
A: In your restaurant settings → Subscription, click Upgrade and follow the flow.

**Q: What about supplier features?**
A: Suppliers follow the same tier structure with warehouse-based limits.

---

## Admin Controls

Admins can:

- Change tenant plans instantly
- Override limits temporarily
- Apply credits and trials
- View usage analytics
- Configure plan features directly in plan JSONB field

See [ADMIN.md](./ADMIN.md) for details.

---

Last Updated: [Current Date]
