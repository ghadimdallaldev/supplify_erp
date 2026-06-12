# Supplify Usage Tracking & Quotas

## Overview

Supplify tracks resource usage in real-time to enforce plan limits, provide analytics, and drive upgrades. Usage counters update automatically and respect both plan limits and manual overrides.

---

## What We Track

### Restaurant Usage

| Metric                  | Description                                                                                      | Enforcement                 |
| ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------------- |
| **Branches**            | Number of active branches/locations                                                              | Hard cap                    |
| **Orders Per Day**      | Orders placed today (resets daily)                                                               | Hard cap                    |
| **Products Tracked**    | Products in restaurant inventory                                                                 | Hard cap                    |
| **Chats Per Day**       | Messages sent today (resets daily)                                                               | Hard cap                    |
| **Storage Used**        | Files uploaded via presign (logos, product images, chat attachments) + staff documents with size | Hard cap at plan limit (MB) |
| **Exports Per Day**     | CSV/API exports today                                                                            | Hard cap (Gold+)            |
| **Webhooks**            | Active webhook subscriptions                                                                     | Hard cap (Platinum)         |
| **AI Requests Per Day** | LLM calls on Smart Reorder `explain` / `ask` (Gold 20, Platinum 100)                             | Soft at 80%; see below      |

### Supplier Usage

| Metric                | Description                                                          | Enforcement                 |
| --------------------- | -------------------------------------------------------------------- | --------------------------- |
| **Warehouses**        | Number of active warehouses                                          | Hard cap                    |
| **Products**          | Products in catalog                                                  | Hard cap                    |
| **Orders Today**      | Orders received today                                                | Hard cap                    |
| **Picklists Per Day** | Fulfillment picklists generated                                      | Hard cap (Gold+)            |
| **Storage Used**      | Files uploaded via presign (logos, product images, chat attachments) | Hard cap at plan limit (MB) |

---

## How Usage Updates

### Automatic Updates

Usage counters update automatically when:

- Creating a branch or warehouse
- Placing or receiving an order
- Sending a chat message
- Uploading a file (via `POST /api/files/presign` — bytes counted in MB, rounded up; storage layout in [STORAGE_UPLOADS.md](../operations/STORAGE_UPLOADS.md))
- Creating a product
- Exporting data
- Setting up a webhook

### Reset Schedule

- **Daily counters** (orders, chats, `ai_requests_per_day`): reset at midnight UTC
- **Daily limits**: reset at midnight UTC
- **Period counters** (branches, warehouses, products): never reset (cumulative)

### Manual Adjustments

Admins can manually adjust usage:

1. Navigate to tenant
2. Click "Usage & Quotas"
3. Edit any counter (e.g., grant bonus branches)
4. Changes are audited

---

## Warning vs Block Behavior

### 🟡 80% Warning (Soft Cap)

When usage reaches **80% of limit**:

- Dashboard shows **yellow warning badge**
- In-app notification: "You're approaching your limit"
- **No functionality is blocked**
- Clear upgrade CTA shown

**Example:** Restaurant on Silver plan (20 orders/day limit per migration `0117`)

- 80+ orders today → Warning badge appears
- Orders still work normally
- Upgrade to Gold ($149/mo) for 500/day shown

### 🔴 100% Block (Hard Cap)

When usage reaches **100% of limit**:

- Dashboard shows **red error state**
- Specific feature is **disabled** (not whole app)
- Clear error message: "You've reached your limit"
- Upgrade CTA prominently displayed
- Existing data untouched (never deleted)

**Example:** Same restaurant at 100 orders today

- Attempt to place 101st order → **Blocked**
- Error: "Daily order limit reached (100/100). Upgrade to Gold for 500 orders/day."
- Can still view past orders, products, chat, etc.
- Only new order creation is blocked

### AI assist (`ai_requests_per_day`)

Restaurant-only meter (migration `0167`). Counts successful LLM attempts on `POST /reorder-assistance/explain` and `ask`; heuristic fallbacks when `ai_platform` is off or env has no provider do **not** increment.

- **80%:** Entitlements / usage UI shows warning badge (same pattern as other daily meters).
- **100%:** `explain` returns heuristic summary with `usageLimited: true` (200). `ask` returns **400** `VALIDATION_ERROR` (“Daily AI assist limit reached for your plan”). Core reorder assistance and forecasts remain available.

---

## Unlimited Values (-1)

Some plans have unlimited resources:

- Branch limit = **-1** → Unlimited branches
- Product limit = **-1** → Unlimited products
- Orders = **-1** → No daily cap

**UI Behavior:**

- Shows "Unlimited" badge
- No progress bar
- No warnings
- Still tracked for analytics

---

## Usage Dashboard

### Tenant View (Restaurant/Supplier Settings)

Shows:

- Current usage vs limits
- Progress bars for each resource
- Upgrade prompts for near-limit items
- Last 30 days usage chart
- What's using most resources

**Location:** Settings → Subscription → Usage

### Admin View (Admin Dashboard → Usage)

Shows:

- **Platform-wide totals**
- **Top users by usage**
- **Over-limit tenants** (red list)
- **Near-limit warnings** (yellow list)
- **Usage trends** (last 7/30 days)

---

## Handling Over-Limit Tenants

### Automated Actions

When a tenant hits a limit:

1. **Immediate:** Feature is blocked with clear message
2. **Email:** Sent to tenant (not in Free plan)
3. **Dashboard:** Red badge on tenant row for admins
4. **No deletion:** Existing data is never touched

### Admin Response Options

Admins can:

1. **Upgrade tenant** to higher plan
   - Limits increase immediately
   - No service interruption
   - Usage carries over

2. **Grant manual override**
   - Temporarily increase limit
   - Set expiration date
   - Reason required (audit trail)

3. **Suspend account** (non-payment)
   - Usage frozen (no increment)
   - Tenant locked out
   - Can't create new items

4. **Take no action**
   - Limit stays enforced
   - Tenant sees upgrade prompts
   - Normal support process

---

## Downgrade Impact

When a tenant is downgraded:

### Step 1: Impact Preview

Before confirming downgrade, admin sees:

- How many branches exceed new limit
- How many products exceed new limit
- Which features will be disabled
- Estimated revenue impact

### Step 2: Lock Creation (Never Delete)

After downgrade:

- Excess resources **locked** (read-only)
- Cannot create new items exceeding limit
- Existing items remain accessible
- Upgrade prompt shown prominently

### Example: Gold → Silver (Restaurant)

**Before:** 3 branches (Gold allows 3)
**After:** Downgrade to Silver (allows 1 branch)

**Result:**

- All 3 branches still visible
- Branch 1 active (within limit)
- Branches 2-3 **locked** (exceed limit)
- Cannot create 4th branch
- Dashboard shows: "2 branches exceed Silver limit. Upgrade to Gold to unlock."

---

## Usage Reconciliation

### Daily Reconcile Job

Runs nightly to:

- Verify counters match actual counts
- Fix any drift (audit log entry)
- Generate usage reports
- Check for discrepancies

### Manual Correction

If counters get out of sync:

1. Admin can trigger manual reconciliation
2. System recounts and updates
3. Audit log records the correction

---

## Analytics & Billing

### Analytics Usage

Usage data powers:

- **Tier recommendations:** "You'd save money on Gold"
- **Capacity planning:** "Most restaurants use 50% of limits"
- **Churn prediction:** "Usage trending down for this tenant"
- **Feature adoption:** "Gold → Platinum upgrade rate"

### Billing Integration (Future)

Usage may affect billing:

- **Overage fees** for exceeding limits
- **Tiered pricing** based on actual usage
- **Usage-based plans** (pay for what you use)

Currently: Fixed monthly/yearly pricing.

---

## API Access to Usage

Tenants can check usage via API:

```bash
GET /api/subscriptions/usage

Response:
{
  "ok": true,
  "data": {
    "branches_count": 2,
    "branches_limit": 3,
    "branches_remaining": 1,
    "orders_today": 45,
    "orders_daily_limit": 100,
    "orders_remaining": 55,
    // ... other metrics
  }
}
```

---

## Best Practices for Tenants

1. **Monitor usage** regularly in settings
2. **Upgrade proactively** when near limits
3. **Contact admin** for temporary overrides if needed
4. **Optimize storage** by deleting old files
5. **Use archiving** for historical data (future feature)

---

## Troubleshooting

**Issue:** Counter says 0 but I know I have items

- **Check:** Deletion may not have decremented counter
- **Fix:** Run reconciliation or contact admin

**Issue:** Can't create item but under limit

- **Check:** May be at 100% of another limit
- **Fix:** Check all limits, not just one

**Issue:** Downgrade didn't lock items

- **Check:** Sync delay (usually instant)
- **Fix:** Refresh page or wait 60 seconds

---

Last Updated: [Current Date]
