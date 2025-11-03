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

---

## Managing Plans

### Viewing Plans

**Admin → Plans**

Shows all 4 Supplify plans:
- Free (Free)
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

### Grant Trial

To give a tenant a trial:

1. Find tenant in **Subscriptions**
2. Click "Grant Trial"
3. Select trial plan and duration
4. Confirm

**During Trial:**
- Full plan features enabled
- Usage tracked normally
- Auto-converts to paid on expiry (or cancels)
- Notifications sent before expiry

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

