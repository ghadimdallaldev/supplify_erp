# Supplify Feature Flags

## Overview

Feature flags allow fine-grained control over platform capabilities at three levels:
1. **Global Defaults** - Platform-wide on/off switches
2. **Plan Defaults** - What each subscription plan includes by default
3. **Per-Tenant Overrides** - Exceptions for specific tenants

This system ensures consistent behavior while allowing flexibility for testing, special cases, and gradual rollouts.

---

## Resolution Order

When checking if a feature is enabled for a tenant:

```
Effective Value = Tenant Override → Plan Default → Global Default
```

**Example:** Chat with Files
- **Global Default:** `false`
- **Gold Plan Default:** `true`
- **Restaurant A Override:** `false` (disabled for this tenant)

**Result for Restaurant A:** `false` (override takes precedence)

---

## Feature Flag Categories

### 1. Quick Lists & Reordering
- `quick_lists` - Type: string
  - Values: `basic_manual_only`, `automated_weekly`, `full_schedule`, `ai_smart_automation`
- `smart_reorder` - Type: boolean | string
  - Values: `false`, `limited_7day_history`, `full_90day_trends`, `ai_forecast_seasonality`

### 2. Inventory Management
- `inventory_management` - Type: string
  - Values: `basic`, `real_time`, `multi_branch_tracking`, `lot_expiry_tracking`
- `multi_branch` - Type: boolean | string
  - Values: `false`, `true`, `central_purchasing` (Platinum only)

### 3. Waste Tracking
- `waste_tracking` - Type: boolean | string
  - Values: `false`, `manual_entry`, `analytics_dashboard`, `cost_percentage_vs_sales`

### 4. Receiving Quality
- `receiving_quality` - Type: string
  - Values: `manual_only`, `photos_enabled`, `quality_scoring`, `supplier_performance_reports`

### 5. Finance & Invoices
- `finance_invoices` - Type: string
  - Values: `view_only`, `record_payments`, `expense_analytics`, `advanced_finance_dashboard`

### 6. Communication
- `chat` - Type: string
  - Values: `1_supplier_only`, `multi_supplier`, `group_chat_files`, `real_time_media_read_receipts`

### 7. Reporting & Analytics
- `reports` - Type: boolean | string
  - Values: `false`, `basic_kpis`, `usage_cost_dashboards`, `advanced_forecasting_custom_reports`

### 8. Approvals & Budgets
- `approvals_budgets` - Type: boolean | string
  - Values: `false`, `single_level`, `approval_budget_caps`, `multi_level_approvals`

### 9. Fulfillment Tools
- `fulfillment_tools` - Type: string
  - Values: `basic_orders`, `manual_orders_invoices`, `warehouse_pick_pack`, `routing_full_suite`

### 10. Developer Features
- `feature_flags_access` - Type: boolean | string
  - Values: `false`, `default_plan_features`, `addon_toggles`, `all_experimental`
- `api_integrations` - Type: boolean | string
  - Values: `false`, `exports_only`, `api_key_access`, `full_api_webhooks`

### 11. Notifications
- `notifications` - Type: string
  - Values: `in_app_only`, `in_app_and_email`, `email_and_sms`, `email_sms_webhook`

### 12. Support
- `support_sla` - Type: string
  - Values: `community`, `standard_72h`, `priority_24h`, `dedicated_same_day`

### 13. Branding
- `custom_branding` - Type: boolean | string
  - Values: `false`, `logo_colors`, `white_label_domain`

---

## Admin Management

### Viewing Feature Flags

**Admin Dashboard → Feature Flags**

Shows:
- All flags with current global, plan, and override states
- Last modified by and when
- Which flags are experimental

### Changing Global Defaults

1. Navigate to **Feature Flags** tab
2. Toggle the switch (e.g., enabling a feature globally)
3. Confirm the change
4. Change is **immediately effective** for all tenants without overrides
5. Audit log records who changed what and when

### Setting Plan Defaults

1. Navigate to **Plans** tab
2. Select a plan (e.g., Gold)
3. Edit plan features
4. Set feature flag values for that plan
5. All tenants on that plan inherit these values (unless overridden)

### Creating Tenant Overrides

1. Navigate to **Tenants** tab
2. Select a restaurant or supplier
3. Click "Feature Overrides"
4. Toggle or set feature values
5. These values **override** both global and plan defaults
6. Useful for:
   - Testing new features with specific tenants
   - Temporarily disabling features for troubleshooting
   - Granting exceptions

### Removing Overrides

1. Find tenant with override
2. Click "Reset to plan default"
3. Tenant inherits plan defaults going forward

---

## How Features Affect UI

### UI Hiding Rules

Features are automatically hidden from UI when not enabled:

- **Multi-branch UI** hidden unless `multi_branch` is truthy
- **Warehouse selection** hidden unless `warehouses > 0` in limits
- **Advanced analytics** tabs hidden unless `reports` includes "advanced"
- **Chat file sharing** hidden unless `chat` includes "files"

### Disabled State Messages

When a feature is disabled, UI shows:
- **Disabled button** with tooltip: "Available on [Plan]+"
- **Upgrade CTA** in-place of feature
- **Gray-out** of unavailable options

---

## Experimental Features

Flags marked as `experimental`:
- Only visible in Admin Dashboard
- Available only to tenants with `feature_flags_access: "all_experimental"`
- Can be enabled via tenant override
- May be unstable or incomplete

**Example:** New AI forecasting feature
- Not in any plan yet
- Set as experimental
- Admin enables for specific test tenants
- Eventually promoted to Gold/Platinum plans

---

## Audit Trail

All flag changes create audit logs:
- Who made the change
- When it was made
- What changed (before → after)
- Which level (global, plan, tenant)
- Reason (optional comment)

**Security:** Only admins can modify flags. Role-based access enforced.

---

## Best Practices

### 1. Start Conservative
- New features start disabled globally
- Enable only on Gold/Platinum by default
- Use experimental flag for early adopters

### 2. Use Overrides Sparingly
- Overrides are for exceptions, not standard ops
- Document why an override exists
- Review and clean up overrides quarterly

### 3. Test Before Global Enable
- Test with Bronze plan default first
- Monitor usage and feedback
- Gradual rollout to Free

### 4. Clear Communication
- Announce feature changes in-app
- Update help docs when flags change
- Notify affected tenants of new capabilities

### 5. Plan Integration
- Feature flags align with plan value
- Premium features stay in Gold/Platinum
- Clear upgrade path for each feature

---

## Example Scenarios

### Scenario 1: Rolling Out New Feature

**Goal:** Enable AI forecasting for Gold+ restaurants

**Steps:**
1. Feature flag: `smart_reorder` = `ai_forecast_seasonality`
2. Set as Gold plan default (free tiers don't get it)
3. Test with 5 tenants via overrides
4. Monitor feedback
5. Set as Platinum default (all Platinum tenants get it)
6. Eventually add to Gold default

### Scenario 2: Temporarily Disable Feature

**Goal:** Chat is having issues for Restaurant X

**Steps:**
1. Find Restaurant X in admin
2. Set override: `chat = false`
3. Restaurant X cannot chat until resolved
4. Fix underlying issue
5. Remove override (revert to plan default)

### Scenario 3: Grant Exceptions

**Goal:** Important partner gets Platinum features on Gold plan

**Steps:**
1. Set individual feature overrides:
   - `multi_branch = central_purchasing`
   - `approvals_budgets = multi_level_approvals`
   - etc.
2. Partner has Platinum-like experience
3. Manually manage until upgrade

---

## Technical Implementation

### Backend Resolution

```javascript
// Resolution order in code
const value = tenantOverrides[featureKey] ?? 
              planDefaults[featureKey] ?? 
              globalDefaults[featureKey] ?? 
              false;
```

### Frontend Checking

```typescript
// React hook example
const canUseMultiBranch = useFeatureFlag('multi_branch');
if (!canUseMultiBranch) return <UpgradePrompt />;
```

---

## Troubleshooting

**Issue:** Feature appears enabled but doesn't work
- **Check:** Tenant override may be disabling it
- **Fix:** Review tenant's overrides in admin

**Issue:** All tenants see a feature that shouldn't be available
- **Check:** Global default may be set to `true`
- **Fix:** Check global flag state

**Issue:** Upgrade didn't unlock features
- **Check:** Plan defaults may not include the feature
- **Fix:** Update plan features in admin

---

Last Updated: [Current Date]

