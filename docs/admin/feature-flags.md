# Admin feature toggles

Supplify layers **subscription plan features** with **global** and **per-tenant** overrides so admins can turn capabilities on or off without editing plan JSON.

## Resolution order

For each feature key (e.g. `chat`, `smart_reorder`, `reports`):

1. **Tenant override** — row in `feature_flag_override` for that restaurant or supplier
2. **Global override** — `feature_flag.global_override` when not `NULL` (`true` = force on, `false` = force off)
3. **Plan** — `subscription_plan.features` JSON on the tenant’s active subscription
4. **Default** — disabled

Runtime checks use `requireFeature('feature_key')` on API routes, which calls `isFeatureEnabled()` in `subscription.js` (delegates to `feature-flags.js`).

## Database

Migration `0055_admin_feature_toggles.sql`:

| Table                   | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `feature_flag`          | Master list of feature keys + optional `global_override` |
| `feature_flag_override` | Per-tenant `is_enabled` + optional `reason`              |

Canonical keys live in `apps/api/src/lib/feature-keys.js`.

## Admin API

All routes require `ADMIN` role and `ADMIN_ACCESS` permission under `/api/admin-dashboard`.

| Method   | Path                                                     | Body / notes                                                                |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET`    | `/feature-flags`                                         | List global flags                                                           |
| `PATCH`  | `/feature-flags/:featureKey`                             | `{ "mode": "inherit" \| "on" \| "off" }`                                    |
| `GET`    | `/tenants/:tenantType/:id/feature-overrides`             | `tenantType`: `RESTAURANT` or `SUPPLIER`; returns overrides + effective map |
| `PUT`    | `/tenants/:tenantType/:id/feature-overrides/:featureKey` | `{ "enabled": true/false, "reason": "..." }`                                |
| `DELETE` | `/tenants/:tenantType/:id/feature-overrides/:featureKey` | Remove override                                                             |
| `GET`    | `/tenants/:tenantType/:id/entitlements`                  | Includes `effectiveFeatures` alongside plan entitlements                    |

## Examples

Force **smart_reorder** off globally:

```http
PATCH /api/admin-dashboard/feature-flags/smart_reorder
Content-Type: application/json

{ "mode": "off" }
```

Enable **chat** for one restaurant regardless of plan:

```http
PUT /api/admin-dashboard/tenants/RESTAURANT/{restaurantId}/feature-overrides/chat
Content-Type: application/json

{ "enabled": true, "reason": "Pilot" }
```

Revert to plan/global behavior:

```http
DELETE /api/admin-dashboard/tenants/RESTAURANT/{restaurantId}/feature-overrides/chat
```

## UI

**Admin Dashboard → Features** tab (`/app/admin`, select **Features** in the tab bar):

- **Global feature flags** — inherit / on / off per feature key
- **Per-tenant overrides** — pick restaurant or supplier, force on/off or clear override

## Canonical feature keys

**RESTAURANT** (23 keys): chat, order_calendar, reports, smart_reorder, **ai_platform**, multi_branch, receiving_quality, disputes_returns, finance_invoices, quick_lists, inventory_management, waste_tracking, advanced_roles, notifications, api_integrations, support_sla, custom_branding, feature_flags_access, supplier_reviews, push_notifications, order_amendments, tenant_audit_log, waitlist_auto_promo, supplier_deals

`ai_platform` enables LLM explain/ask for Smart Reorder when `AI_ENABLED` and provider credentials are set on the API. Gold/Platinum plans default to on; Silver/Free default off.

**Removed:** `approvals_budgets` (not shown in admin UI)

**SUPPLIER** (22 keys): chat, order_calendar, reports, multi_branch, warehouses, multi_warehouse, fulfillment_tools, fulfillment, driver_management, disputes_returns, quick_lists, inventory_management, advanced_roles, notifications, api_integrations, support_sla, custom_branding, feature_flags_access, promotions, push_notifications, order_amendments, tenant_audit_log

## Real-time refresh

When a global override or per-tenant override is changed, the server emits an `entitlements_refresh` WebSocket event to all connected clients. Frontend apps should listen for this event and re-fetch entitlements to reflect changes immediately without requiring a page reload.

## Related

- Subscription plans and limits: admin dashboard plan editor
- Paywall responses: HTTP 403 with `FEATURE_NOT_AVAILABLE` from `requireFeature`
