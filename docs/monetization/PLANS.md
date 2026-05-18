# Supplify Subscription Plans

## Overview

Supplify offers tiered subscription plans designed for **restaurants and suppliers** at various stages of growth. Plans are structured to provide value at every level, with clear upgrade paths and feature alignment.

- **Same tiers for both:** Free, Bronze, Gold, and Platinum apply to restaurants and suppliers (plan type: `restaurant_and_supplier`).
- **Supplier limits:** Each tier defines limits for suppliers (e.g. products, warehouses, **chats_per_day**). Suppliers without an active subscription are auto-assigned the Free plan so chat and other features work (no "0/0" chat limit).
- **API:** Both roles can use `GET /api/subscriptions/current` and `GET /api/subscriptions/usage/:meterType` (e.g. `chats_per_day`). See [SUPPLIER_FEATURES.md](SUPPLIER_FEATURES.md#-subscription--plan-suppliers).

---

## Plan Tiers

### 🌟 Free Plan

**Best for:** Setup and testing only — try the platform before upgrading

**Pricing:** $0/month

- 1 branch account (your main location only — no extra branch accounts)
- 1 supplier connection per restaurant
- 15 products/SKUs in inventory
- 0 warehouses (suppliers)
- 1 user
- 50 MB storage
- 3 orders per day
- 3 chats per day (each message sent in chat)

**Features:**

- Basic quick lists (manual only)
- No smart reorder
- Basic inventory management
- No waste tracking
- Manual receiving quality only
- View-only finance invoices
- Limited chat (3/day)
- No reports
- In-app notifications only
- Community support

**Use Case:** Evaluate Supplify and place a few test orders. Upgrade to Gold for real daily usage.

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
- 2 branch accounts (main + 1 linked location)
- 20 orders per day
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
- 1,000 inventory SKUs
- 3 warehouses
- 10 users
- 5 GB storage
- 3 branch accounts (main + 2 linked locations)
- 50 orders per day
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
- Email + WhatsApp (wa.me) + in-app notifications
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

### Limits

| Limit                           | Free   | Bronze | Gold  | Platinum  |
| ------------------------------- | ------ | ------ | ----- | --------- |
| **Branches** (restaurants)      | 0      | 1      | 3     | Unlimited |
| **Warehouses** (suppliers)      | 0      | 1      | 3     | Unlimited |
| **Users**                       | 1      | 3      | 10    | Unlimited |
| **Orders / day**                | 5      | 50     | 200   | Unlimited |
| **Suppliers per restaurant**    | 1      | 5      | 20    | Unlimited |
| **Inventory SKUs** (restaurant) | 50     | 500    | 2,000 | Unlimited |
| **Products / SKUs** (supplier)  | 50     | 500    | 2,000 | Unlimited |
| **Chats / day**                 | 5      | 30     | 100   | Unlimited |
| **Storage**                     | 100 MB | 1 GB   | 5 GB  | 50 GB     |

### Features

| Feature                            | Free               | Bronze                 | Gold                           | Platinum                              |
| ---------------------------------- | ------------------ | ---------------------- | ------------------------------ | ------------------------------------- |
| **Chat**                           | Basic (1 supplier) | Multi-supplier         | Groups + files                 | Real-time + media + read receipts     |
| **Reports**                        | ❌                 | Basic KPIs             | Usage & cost dashboards        | Advanced forecasting + custom reports |
| **Smart Reorder**                  | ❌                 | ❌                     | Full (90-day trends)           | AI forecast + seasonality             |
| **Reservations** _(restaurant)_    | ❌                 | Basic (board + create) | Floor plan builder + analytics | Guest intelligence + VIP tracking     |
| **Multi-Branch** _(restaurant)_    | ❌                 | ❌                     | ✅                             | Central purchasing                    |
| **Inventory Management**           | Basic              | Real-time              | Multi-branch tracking          | Lot + expiry tracking                 |
| **Waste Tracking**                 | ❌                 | Manual entry           | Analytics dashboard            | Cost vs. sales analytics              |
| **Receiving Quality**              | Manual only        | Photos enabled         | Quality scoring                | Supplier performance reports          |
| **Finance & Invoices**             | View only          | Record payments        | Expense analytics              | Advanced finance dashboard            |
| **Approvals & Budgets**            | ❌                 | Single-level           | Approval + budget caps         | Multi-level approvals                 |
| **Quick Lists**                    | Manual only        | Automated weekly       | Full schedule                  | AI smart automation                   |
| **Fulfillment Tools** _(supplier)_ | Basic orders       | Manual + invoices      | Warehouse pick & pack          | Full routing suite                    |
| **Notifications**                  | In-app only        | + Email                | + SMS                          | + Webhooks                            |
| **API Integrations**               | ❌                 | ❌                     | API key access                 | Full API + webhooks                   |
| **Support SLA**                    | Community          | 72h standard           | 24h priority                   | Same-day dedicated                    |
| **Custom Branding**                | ❌                 | ❌                     | Logo + colors                  | White-label + custom domain           |

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

See [ADMIN.md](../admin/ADMIN.md) for details.

---

Last Updated: [Current Date]
