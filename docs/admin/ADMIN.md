# Supplify Admin Guide

## Overview

This guide covers everything admins need to manage Supplify effectively, including plan changes, tenant management, chat involvement, and usage monitoring.

---

## Admin Dashboard Overview

### Access

Navigate to `/app/admin` (visible only to users with ADMIN role).

### Available Tabs

1. **Overview** - Platform metrics, MRR, ARR, tenant counts
2. **Plans** - Manage subscription plans and features
3. **Subscriptions** - View all tenant subscriptions
4. **Tenants** - Supplier and Restaurant directories
5. **Usage** - Usage tracking and quotas
6. **Audit Logs** - All admin actions and changes
7. **Portals** - Monitor public reservation and staff self-service performance

---

## Managing Portals

### Public Reservation Booking Portal

- View per-tenant adoption, daily traffic, and conversion rates
- Toggle availability of the public `/reserve` experience per plan or tenant
- Inspect recent guest bookings and revoke management tokens if necessary
- Configure default opening hours, slot intervals, and notification templates
- Export guest reservation ledger for compliance requests

### Staff Self-Service Portal

- Monitor active staff sessions and revoke compromised tokens
- Review PTO/swaps submitted via the portal alongside manager approvals
- Force session expiry or generate hyperlinks for frontline training
- Gate access by subscription tier or role-based overrides
- Audit staff document acknowledgements from the self-service dashboard

---

## Managing Plans

### Viewing Plans

**Admin → Plans**

Shows all 4 Supplify plans:

- Free Trial (`free` — time-limited, not forever-free)
- Bronze ($49/mo)
- Gold ($149/mo)
- Platinum ($349/mo)

Each shows:

- Pricing (monthly/yearly)
- Included limits
- Enabled features
- Active subscription count

### Editing Plan Limits

To change what a plan includes:

1. Navigate to **Plans** tab
2. Click "Edit" on any plan
3. Modify limits (e.g., change Bronze branch limit from 1 to 2)
4. Modify features (e.g., enable multi-branch on Bronze)
5. Click "Save"

**Impact:** All existing tenants on that plan inherit changes immediately.

**Example:** Changing Bronze to include 2 branches

- Before: Bronze tenants limited to 1 branch
- After: Bronze tenants can create 2 branches
- Existing tenants get access instantly

### Editing Plan Pricing

To update pricing:

1. Navigate to **Plans** tab
2. Click "Edit" on plan
3. Update price_per_month and/or price_per_year
4. Click "Save"

**Impact:** New subscriptions use new pricing. Existing subscriptions remain on contracted rate until renewal.

---

## Managing Tenant Subscriptions

### View All Subscriptions

**Admin → Subscriptions**

Shows:

- All active/trial/cancelled subscriptions
- Tenant name and email
- Plan and status
- Start/end dates
- MRR/ARR contribution

**Filters:** Status, Plan, Tenant Type, Date Range

### Change Tenant's Plan

To upgrade or downgrade a tenant:

1. Find tenant in **Subscriptions** or **Tenants** tab
2. Click "Change Plan"
3. Select new plan
4. **Preview impact** (shows what will be locked/unlocked)
5. Confirm change

**Upgrades:**

- Take effect immediately
- No data loss
- Prorated billing (future feature)

**Downgrades:**

- Show impact preview first
- Excess resources locked (not deleted)
- Upgrade prompts shown to tenant
- Existing data remains accessible

### Free Trial (plan code `free`)

**Platform default length:** Admin → **Platform settings** → Free Trial length (**3–7** days, default **7**). Applies to new Free activations.

**Extend an expired trial:**

1. Find tenant in **Subscriptions** with `lock_reason = free_sandbox_expired`
2. Click **Extend trial** (or call `POST /api/admin-dashboard/subscriptions/:id/extend-free-trial` with optional `{ "days": 5 }`)
3. Lock clears; `free_sandbox_expires_at` is set from now + days (clamped 3–7)

**Unlock** on an expired Free Trial also extends expiry so the hourly expiry job does not immediately re-lock.

See [free-trial-expiry.md](../features/free-trial-expiry.md) and QA **BIL-FT-\*** in [MANUAL_TEST_CHECKLIST.md](../qa/MANUAL_TEST_CHECKLIST.md).

### Apply Override

To temporarily increase limits:

1. Find tenant in **Tenants** tab
2. Click "Override Limits"
3. Set custom limit (e.g., 5 branches instead of 1)
4. Set expiration date (optional)
5. Add reason (required for audit)

**Use Cases:**

- Temporary expansion needs
- Testing new features
- Special partnership deals
- Event-driven capacity needs

### Suspend/Resume Account

To suspend (non-payment, abuse):

1. Find tenant in **Subscriptions**
2. Click "Suspend Account"
3. Choose reason from dropdown
4. Add details
5. Confirm

**While Suspended:**

- Tenant locked out (cannot log in)
- Usage frozen (no increment)
- Data preserved
- Email sent to tenant

**To Resume:**

1. Find suspended tenant
2. Click "Resume Account"
3. Confirm

Account fully reactivated.

---

## Admin Chat Participation

### View All Chat Rooms

**Admin Dashboard → Coming Soon**

Admins will be able to:

- See all active conversations
- Filter by restaurant, supplier, or both
- See escalated conversations
- Join conversations

### Join a Conversation

To help resolve an issue:

1. Navigate to chat room
2. Click "Admin Join"
3. You're added to conversation
4. All participants see "Admin joined" notification
5. You can see full chat history

**While in Chat:**

- Mark issues as "Resolved"
- Escalate to management
- Take notes
- End conversation when done

### Start Admin Conversation

To proactively reach out to a tenant:

1. Find tenant in **Tenants** tab
2. Click "Start Conversation"
3. Compose message
4. Send

Conversation appears in tenant's chat with "From Supplify Admin" label.

### Conversation Indicators

- **Admin present:** Green badge on conversation
- **Resolved:** Checkmark badge
- **Escalated:** Warning badge
- **Unread:** Blue dot

---

## Impersonation (View as Tenant)

Admins can **impersonate** a Restaurant or Supplier to see the app as that tenant would, without logging in as them.

### How to use

1. Go to **Admin Dashboard** → **Tenants** (or Supplier Admin / Restaurant Admin).
2. Find the tenant and click **Impersonate**.
3. A banner appears at the top: **"You are impersonating [name]"** with a **Stop impersonating** button.
4. Click **Stop impersonating** to end the session.

### Design and security

- **Signed short-lived token:** Impersonation is stored in a signed JWT cookie (`impersonation_token`). Token includes admin user id, tenant id/type/name, and expiry.
- **Duration:** Configurable via `IMPERSONATION_MAX_DURATION_MINUTES` (default 60). Token expires after that time.
- **Cannot impersonate admins:** If the tenant’s contact email is an ADMIN user, the API returns 403. Only Restaurant or Supplier tenants can be impersonated.
- **Audit:** Every start and stop is logged in `admin_audit_log` (`IMPERSONATION_START`, `IMPERSONATION_END`) with admin user, target tenant, and timestamp.
- **Session isolation:** The effective tenant is only applied when the cookie is valid and the logged-in user is the same admin who started impersonation (`getEffectiveTenant(req)`). Other users cannot use a copied cookie to act as that tenant.

### API

- `POST /api/admin-dashboard/impersonate` — body: `{ tenantId, tenantType: "RESTAURANT" | "SUPPLIER" }`. Sets cookie and returns `expiresAt`.
- `POST /api/admin-dashboard/impersonate/stop` — clears cookie and logs end.
- `GET /api/admin-dashboard/impersonate` — returns `{ active: true, tenantId, tenantType, tenantName, expiresAt }` or `{ active: false }` for the UI banner.

---

## Managing Plan Features

Features are controlled directly through subscription plans. Each plan has a `features` JSONB field that defines which features are available.

**To Enable/Disable Features:**

1. Admin → Plans
2. Select plan (Free, Bronze, Gold, Platinum)
3. Edit plan features
4. Update the features JSONB field
5. Save changes

All tenants on that plan will immediately have access to the updated features.

---

## Usage Monitoring

### View Platform-Wide Usage

**Admin → Usage**

Shows:

- Total branches across all restaurants
- Total warehouses across all suppliers
- Daily orders across platform
- Storage usage totals
- Over-limit tenants (red list)

### Identify At-Risk Tenants

Look for:

- **80% of limits** → Yellow warnings
- **100% of limits** → Red blocked
- **Declining usage** → Churn risk
- **Overwhelming usage** → Upgrade opportunity

### Manually Adjust Usage

If counters drift:

1. Admin → Usage
2. Find tenant
3. Click "Adjust Counters"
4. Set new values
5. Add reason
6. Confirm

Audit log records who changed what.

---

## Search, Filters, and Pagination

### Available Filters

**Tenants:**

- Type (Restaurant/Supplier)
- Plan
- Status (Active/Suspended/Trial)
- Over-limit
- Date created
- Search by name or email

**Subscriptions:**

- Plan
- Status
- Date range
- MRR threshold

**Audit Logs:**

- Action type
- Admin user
- Date range
- Tenant

### Export Data

1. Apply filters to desired data
2. Click "Export to CSV"
3. Download file
4. Use in reports or analytics

---

## Important Actions Require Confirmation

These actions require explicit confirmation:

- Plan downgrade (shows impact preview)
- Account suspension
- Usage counter manual adjustment

**Why?** Prevents accidental changes with significant business impact.

---

## Audit Trail

### What's Logged

Every admin action creates an audit entry:

- Who (admin email)
- When (timestamp)
- What (action description)
- Why (optional comment)
- Impact (tenant affected, changes made)

### Viewing Audit Logs

**Admin → Audit Logs**

Shows:

- All admin actions in chronological order
- Filterable by action type, admin, date
- Searchable by tenant name or description
- Exportable for compliance

### Audit Log Examples

```
[2025-01-15 14:23] Admin upgraded Restaurant "Joe's Diner" from Bronze to Gold
- Changed by: admin@supplify.com
- Impact: Limits increased (branches: 1→3, orders/day: 100→500)
- Reason: Customer requested multi-location support
```

---

## Best Practices

### 1. Preview Before Changing Plans

Always preview downgrades to confirm impact before confirming.

### 2. Document Overrides

Always add reason when granting overrides. Helps with:

- Billing reconciliation
- Support context
- Compliance audits

### 3. Monitor Usage Trends

Check usage tab weekly to spot:

- Tenants approaching limits (upgrade opportunity)
- Declining usage (churn risk)
- Unexpected spikes (data quality issues)

### 4. Use Chat Sparingly

Only join conversations when:

- Tenant explicitly requests admin help
- Issue is escalated
- Policy clarification needed
- Payment/account issue

### 5. Stay in Audit Trail

Don't make changes via database directly. Always use admin UI for:

- Audit trail
- Validation
- User notifications
- Email triggers

---

## Troubleshooting

**Issue:** Tenant can't access feature but it's enabled in their plan

- **Check:** Tenant may have an override disabling it
- **Fix:** Remove override or check if global flag is off

**Issue:** Upgrade didn't unlock features

- **Check:** Plan defaults may not include the feature
- **Fix:** Update plan features in Plans tab

**Issue:** Usage counter seems wrong

- **Check:** Run reconciliation job
- **Fix:** If still wrong, manually adjust with reason

---

## Support Escalation

When tenant issues require backend help:

1. Gather information:
   - Tenant name and email
   - Subscription details
   - Issue description
   - Screenshots/logs

2. Create support ticket internally

3. Update tenant with reference number

4. Mark as "Escalated" in audit trail

---

Last Updated: [Current Date]
