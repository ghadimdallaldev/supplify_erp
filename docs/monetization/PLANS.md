# Supplify Subscription Plans

## Overview

Supplify offers tiered subscription plans designed for **restaurants and suppliers** at various stages of growth. Plans are structured to provide value at every level, with clear upgrade paths and feature alignment.

- **Same tiers for both:** Free, Silver, Gold, and Platinum apply to restaurants and suppliers (plan type: `restaurant_and_supplier`).
- **Supplier limits:** Each tier defines limits for suppliers (e.g. products, warehouses, **chats_per_day**). Suppliers without an active subscription are auto-assigned the Free plan so chat and other features work (no "0/0" chat limit).
- **API:** Both roles can use `GET /api/subscriptions/current` and `GET /api/subscriptions/usage/:meterType` (e.g. `chats_per_day`). See [SUPPLIER_FEATURES.md](SUPPLIER_FEATURES.md#-subscription--plan-suppliers).

---

## Plan Tiers

### 🌟 Free Trial (plan code: `free`)

**Best for:** Time-limited evaluation — try the platform before upgrading (not a forever-free production tier)

**Pricing:** $0 during trial  
**Duration:** **3–7 days** (platform default **7**), set in Admin → Platform settings. After expiry, account locks to **read-only** until upgrade or admin extends trial.

See [free-trial-expiry.md](../features/free-trial-expiry.md) and [FREE_TRIAL_BEHAVIOR_AUDIT.md](../qa/FREE_TRIAL_BEHAVIOR_AUDIT.md).

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

### 🥉 Silver Plan

**Best for:** Single-location restaurants and small suppliers (first paid tier after Free Trial)

**Pricing:** $49/month or $490/year (save 2 months)

**Restaurant limits:**

- 1 branch account (main location)
- Up to 5 suppliers per restaurant
- 250 inventory SKUs
- 3 users
- 500 MB storage
- 20 orders per day
- 30 chats per day, 5 open conversations
- 10 quick lists, 100 items per list, 3 scheduled quick lists
- 10 deal redemptions per day (restaurant deal meter; not the supplier `promotions` limit)

**Supplier limits:**

- 1 branch, 1 warehouse
- 250 product SKUs
- 3 users, 500 MB storage
- 30 chats per day, 5 open conversations
- Up to 3 active promotions

**Features (restaurant & supplier):**

- Automated quick lists (weekly scheduling, capped)
- Real-time inventory management
- Manual waste entry (restaurant; no analytics dashboard)
- Photos-enabled receiving quality (restaurant)
- Invoice payment recording (restaurant)
- Multi-supplier chat, order calendar
- Basic KPI reports (route gating unchanged)
- Supplier deals & reviews (restaurant)
- Basic fulfillment (supplier; no driver management)
- In-app + email notifications
- 72-hour support SLA
- No smart reorder, waitlist auto-promotion, advanced roles, activity log, API integrations, or custom branding
- No multi-branch (restaurant) or multi-warehouse (supplier)

**Use Case:** One location, small team, daily ordering without Gold-scale automation or analytics

---

### 🥇 Gold Plan

**Best for:** Multi-location restaurants

**Pricing:** $149/month or $1,490/year (save 2 months)

**Restaurant limits:**

- 2 branch accounts (main + 1 linked location); extra branches via add-on on Gold+
- 15 users
- 100 orders per day
- Up to 30 suppliers
- 3,000 inventory SKUs
- 500 chats per day, 30 open conversations
- 10 GB storage
- 50 quick lists, 500 items per list, 15 scheduled quick lists
- 50 deal redemptions per day

**Supplier limits:**

- 2 branch accounts, 3 warehouses (extra via add-ons on Gold+)
- 15 users, 3,000 product SKUs
- 500 chats per day, 30 open conversations
- 10 GB storage
- 25 active promotions

**Features:**

- Full quick list scheduling
- AI-powered reorder with 90-day trends
- Multi-branch inventory tracking
- Analytics waste tracking dashboard
- Quality scoring system
- Expense analytics
- Group chat with file sharing
- Usage & cost dashboards
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

**Restaurant limits:**

- 3 included branch accounts (+ add-ons / Enterprise for more); unlimited users, orders/day, suppliers, inventory SKUs
- Unlimited chats/day, open conversations, quick lists, deal redemptions
- **30 GB** storage

**Supplier limits:**

- 3 included branches, 5 included warehouses (+ add-ons); unlimited users, product SKUs, chats, open conversations
- Unlimited active promotions
- **30 GB** storage

**Features (catalog; some require future implementation — see [PLATINUM_CATALOG_ONLY_FEATURES.md](./PLATINUM_CATALOG_ONLY_FEATURES.md)):**

- **Everything in Gold PLUS (marketing):**
- AI smart automation for quick lists
- AI forecast with seasonality
- Lot expiry tracking
- Cost vs sales waste analytics
- Supplier performance reports
- Advanced finance dashboard
- All experimental features
- Real-time media, read receipts in chat
- Advanced forecasting & custom reports
- Central purchasing
- Full fulfillment routing suite
- Email + SMS + webhook notifications
- Full API + webhooks
- Dedicated same-day support
- White-label domain branding

**Use Case:** Large chain with multiple brands, complex supply chains

---

## Upgrade Paths

### Free → Silver

**When:** You need more suppliers, products, or basic automation
**Cost Impact:** +$49/month
**Benefits:** Higher limits, real-time inventory, quick list automation, basic reports

### Silver → Gold

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

- **Free:** 1 location (main account only — no linked branch accounts)
- **Silver:** 1 location (main account only)
- **Gold:** 2 locations (main + 1 linked); extra branches via paid add-on
- **Platinum:** 3 included locations; extra via add-on; **6+ locations** → Enterprise / contact sales

**Enforcement:** Effective limit = included + add-ons + admin overrides. Existing branches are never deleted when over limit.

### Warehouses (Suppliers Only)

- **Free:** 0 warehouses
- **Silver:** 1 warehouse
- **Gold:** Up to 3 warehouses
- **Platinum:** 5 warehouses included; extra via add-on ($25/mo each on Platinum)

**Enforcement:** Cannot create warehouses beyond plan limit. Free plan inventory defaults to "Unassigned."

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

| Limit                            | Free  | Silver | Gold  | Platinum  |
| -------------------------------- | ----- | ------ | ----- | --------- |
| **Branches** (restaurants)       | 1     | 1      | 3     | Unlimited |
| **Warehouses** (suppliers)       | 0     | 1      | 3     | Unlimited |
| **Users**                        | 1     | 3      | 15    | Unlimited |
| **Orders / day**                 | 3     | 20     | 100   | Unlimited |
| **Suppliers per restaurant**     | 1     | 5      | 30    | Unlimited |
| **Inventory SKUs** (restaurant)  | 10    | 250    | 3,000 | Unlimited |
| **Products / SKUs** (supplier)   | 10    | 250    | 3,000 | Unlimited |
| **Chats / day**                  | 3     | 30     | 500   | Unlimited |
| **Open conversations**           | 1     | 5      | 30    | Unlimited |
| **Storage**                      | 50 MB | 500 MB | 10 GB | 30 GB     |
| **Quick lists** (restaurant)     | 1     | 10     | 50    | Unlimited |
| **Deal redemptions / day**       | 1     | 10     | 50    | Unlimited |
| **Active promotions** (supplier) | 1     | 3      | 25    | Unlimited |

### Features

| Feature                             | Free               | Silver                 | Gold                           | Platinum                              |
| ----------------------------------- | ------------------ | ---------------------- | ------------------------------ | ------------------------------------- |
| **Chat**                            | Basic (1 supplier) | Multi-supplier         | Groups + files                 | Real-time + media + read receipts     |
| **Reports**                         | ❌                 | Basic KPIs             | Usage & cost dashboards        | Advanced forecasting + custom reports |
| **Smart Reorder**                   | ❌                 | ❌ (off on Silver)     | Full (90-day trends)           | AI forecast + seasonality             |
| **Waitlist auto-promotion**         | ❌                 | ❌ (off on Silver)     | ✅                             | ✅                                    |
| **Advanced roles**                  | ❌                 | ❌ (off on Silver)     | ✅                             | ✅                                    |
| **Activity log**                    | ❌                 | ❌ (off on Silver)     | ✅                             | ✅                                    |
| **Driver management** _(supplier)_  | ❌                 | ❌ (off on Silver)     | ✅                             | ✅                                    |
| **Reservations** _(restaurant)_     | ❌                 | Basic (board + create) | Floor plan builder + analytics | Guest intelligence + VIP tracking     |
| **Multi-Branch** _(restaurant)_     | ❌                 | ❌                     | ✅                             | Central purchasing                    |
| **Inventory Management**            | Basic              | Real-time              | Multi-branch tracking          | Lot + expiry tracking                 |
| **Waste Tracking**                  | ❌                 | Manual entry           | Analytics dashboard            | Cost vs. sales analytics              |
| **Receiving Quality**               | Manual only        | Photos enabled         | Quality scoring                | Supplier performance reports          |
| **Finance & Invoices**              | View only          | Record payments        | Expense analytics              | Advanced finance dashboard            |
| **Quick Lists**                     | Manual only        | Automated weekly       | Full schedule                  | AI smart automation                   |
| **Fulfillment Tools** _(supplier)_  | Basic orders       | Manual + invoices      | Warehouse pick & pack          | Full routing suite                    |
| **Disputes & Returns**              | ❌                 | ✅                     | ✅                             | ✅                                    |
| **Order Amendments**                | ✅                 | ✅                     | ✅                             | ✅                                    |
| **Push Notifications**              | ✅                 | ✅                     | ✅                             | ✅                                    |
| **Supplier Reviews** _(restaurant)_ | ❌                 | ✅                     | ✅                             | ✅                                    |
| **Order Calendar**                  | ❌                 | ✅                     | ✅                             | ✅                                    |
| **Advanced Roles**                  | ❌                 | ❌                     | ✅                             | ✅                                    |
| **Activity Log**                    | ❌                 | ❌                     | ✅                             | ✅                                    |
| **Promotions & Deals** _(supplier)_ | ❌                 | ✅ (max 3 active)      | ✅ (max 25 active)             | ✅ (unlimited active)                 |
| **Deal redemptions** _(restaurant)_ | 1/day (Free)       | 10/day                 | 50/day                         | Unlimited                             |
| **Notifications**                   | In-app only        | + Email                | + SMS                          | + Webhooks                            |
| **API Integrations**                | ❌                 | ❌                     | API key access                 | Full API + webhooks                   |
| **Support SLA**                     | Community          | 72h standard           | 24h priority                   | Same-day dedicated                    |
| **Custom Branding**                 | ❌                 | ❌                     | Logo + colors                  | White-label + custom domain           |

---

## Downgrade Protection

When downgrading to a plan with fewer resources:

1. **Excess resources are locked (not deleted)**
2. Cannot create new items exceeding new limits
3. Existing items remain accessible in read-only mode
4. Clear dashboard showing what to resolve
5. Upgrade prompt shown on locked features

**Example:** Downgrading from Gold (3 branches) to Silver (1 branch):

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
A: **Free Trial** (`free` plan) is time-limited (**3–7 days**, default 7). After expiry you can still log in and view data, but must upgrade to create or change operational records. Silver may offer promotional trials separately. Gold/Platinum available on request.

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
